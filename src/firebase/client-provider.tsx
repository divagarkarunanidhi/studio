'use client';
import { useEffect, useState } from 'react';
import { FirebaseProvider } from './provider';
import { initializeFirebase } from '.';
import { getRedirectResult } from 'firebase/auth';
import { useAuth } from './provider';

// This is a new component that wraps the FirebaseProvider
// but is designed to run only on the client.
function AuthHandler({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    const processRedirect = async () => {
      try {
        // This function processes the redirect result from Google Sign-In.
        // It should only be called once when the app loads.
        await getRedirectResult(auth);
      } catch (error) {
        console.error("Error processing redirect result:", error);
      } finally {
        // Whether it succeeds or fails, we're done verifying.
        // The useUser hook will then have the correct auth state.
        setIsVerifying(false);
      }
    };
    processRedirect();
  }, [auth]);

  // While we are processing the redirect, show a loading screen.
  // This prevents the sign-in page from flashing incorrectly.
  if (isVerifying) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p>Authenticating...</p>
      </div>
    );
  }

  return <>{children}</>;
}


export function FirebaseClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [firebase, setFirebase] = useState(
    () => initializeFirebase()
  );

  return (
    <FirebaseProvider {...firebase}>
        <AuthHandler>{children}</AuthHandler>
    </FirebaseProvider>
  );
}
