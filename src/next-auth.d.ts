import type { DefaultSession } from 'next-auth';
import type { UserRole } from '@/app/api/auth/[...nextauth]/options';

declare module 'next-auth' {
  interface Session {
    user: {
      uid: string;
      username?: string;
      role?: UserRole;
    } & DefaultSession['user'];
  }

  interface User {
    uid?: string;
    username?: string;
    role?: UserRole;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string;
    username?: string;
    role?: UserRole;
  }
}
