import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  authOptions,
  USERS_COLLECTION,
  type MongoUser,
} from '@/app/api/auth/[...nextauth]/options';
import { getMongoDetails } from '@/lib/mongodb';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { client, dbName } = await getMongoDetails();
    const db = client.db(dbName);
    const users = db.collection<MongoUser>(USERS_COLLECTION);
    const docs = await users
      .find(
        {},
        { projection: { passwordHash: 0 } }
      )
      .toArray();

    const result = docs.map((u) => ({
      id: u._id.toString(),
      email: u.email,
      username: u.username ?? u.displayName ?? u.email,
      role: (u.role ?? 'newuser') as MongoUser['role'],
    }));

    return NextResponse.json({ users: result });
  } catch (error) {
    console.error('List users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
