import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';
import { MongoClient, ObjectId } from 'mongodb';
import { getMongoConfig } from '@/lib/mongo-config';

export type UserRole = 'admin' | 'taas' | 'view' | 'newuser';

export interface MongoUser {
  _id: ObjectId;
  email: string;
  username: string;
  displayName?: string;
  role: UserRole;
  passwordHash: string;
  createdAt: Date;
}

/**
 * Default values used when data/mongo-config.json is missing. The actual URI
 * and DB name come from getMongoConfig() at runtime so admins can edit them
 * via the Configuration page.
 */
export const MONGO_URI = 'mongodb://localhost:27017';
export const MONGO_DB_NAME = 'bugsense';
export const USERS_COLLECTION = 'users';
const NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET ?? 'local-dev-nextauth-secret-change-me';

async function authenticateWithMongoDB(identifier: string, password: string) {
  const { uri, dbName } = await getMongoConfig();
  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db(dbName);
    const users = db.collection<MongoUser>(USERS_COLLECTION);

    const normalizedIdentifier = identifier.trim();
    const user = await users.findOne({
      $or: [
        { email: normalizedIdentifier },
        { username: normalizedIdentifier },
      ],
    });
    if (!user) {
      throw new Error('Invalid email or password.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password.');
    }

    return {
      id: user._id.toString(),
      email: user.email,
      username: user.username ?? user.displayName ?? user.email,
      displayName: user.displayName ?? user.username ?? user.email,
      role: (user.role ?? 'newuser') as UserRole,
    };
  } finally {
    await client.close();
  }
}

export const authOptions: NextAuthOptions = {
  secret: NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email or Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required.');
        }

        const user = await authenticateWithMongoDB(
          credentials.email,
          credentials.password
        );

        return {
          id: user.id,
          uid: user.id,
          email: user.email,
          name: user.displayName,
          username: user.username,
          role: user.role,
        } as any;
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as any;
        token.uid = u.uid ?? u.id;
        token.username = u.username;
        token.role = u.role;
        token.email = u.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user = {
          ...session.user,
          uid: token.uid as string,
          username: token.username as string | undefined,
          role: token.role as UserRole | undefined,
        } as typeof session.user & {
          uid: string;
          username?: string;
          role?: UserRole;
        };
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};
