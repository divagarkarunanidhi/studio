
'use client';
import { useEffect, useState } from 'react';
import { FirebaseProvider } from './provider';
import { initializeFirebase } from '.';
import { signInAnonymously } from 'firebase/auth';
import { useUser } from './auth/use-user';
import { Skeleton } from '@/components/ui/skeleton';

export function FirebaseClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { firebaseApp, auth, firestore } = initializeFirebase();
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    const signIn = async () => {
      // Check if a user is already signed in
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.error('Anonymous sign-in failed:', error);
          // Handle error appropriately, maybe show an error message
        }
      }
      setIsAuthLoading(false);
    };

    signIn();
  }, [auth]);

  if (isAuthLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-6 w-48" />
          <p className="text-muted-foreground">Initializing session...</p>
        </div>
      </div>
    );
  }

  return (
    <FirebaseProvider
      firebaseApp={firebaseApp}
      auth={auth}
      firestore={firestore}
    >
      {children}
    </FirebaseProvider>
  );
}
