'use client';

import { SessionProvider } from 'next-auth/react';
import { FirebaseClientProvider } from '@/firebase';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <FirebaseClientProvider>{children}</FirebaseClientProvider>
    </SessionProvider>
  );
}
