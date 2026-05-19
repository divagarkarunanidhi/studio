import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';
import {
  USERS_COLLECTION,
  type MongoUser,
  type UserRole,
} from '@/app/api/auth/[...nextauth]/options';
import { getMongoDetails } from '@/lib/mongodb';

interface NewUser {
  _id?: ObjectId;
  email: string;
  username: string;
  displayName?: string;
  role: UserRole;
  passwordHash: string;
  createdAt: Date;
}

export async function POST(request: NextRequest) {
  try {
    const { email, password, username, displayName } = await request.json();

    if (!email || !password || !username) {
      return NextResponse.json(
        { error: 'Email, password, and username are required.' },
        { status: 400 }
      );
    }

    if (!email.endsWith('@dhl.com')) {
      return NextResponse.json(
        { error: 'Only @dhl.com email addresses are allowed.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    const { client, dbName } = await getMongoDetails();
    const db = client.db(dbName);
    const users = db.collection<MongoUser>(USERS_COLLECTION);

    const existingUser = await users.findOne({ email });
    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists.' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser: NewUser = {
      email,
      username,
      displayName: displayName || username,
      role: 'newuser',
      passwordHash,
      createdAt: new Date(),
    };

    const result = await users.insertOne(newUser as MongoUser);

    return NextResponse.json(
      {
        message: 'User created successfully',
        userId: result.insertedId.toString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}