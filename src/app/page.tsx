
'use client';

import { DashboardPage } from '@/components/pages/dashboard-page';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Bug, ShieldX } from 'lucide-react';
import { doc } from 'firebase/firestore';

export default function Home() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const firestore = useFirestore();

  const userProfileRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<{ role: string }>(userProfileRef);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading || isProfileLoading || !user) {
    return (
        <div className="flex h-screen w-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Bug className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading Defect Insights...</p>
            </div>
        </div>
    );
  }

  if (userProfile?.role === 'user') {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background p-4">
            <div className="flex flex-col items-center gap-4 text-center">
                <ShieldX className="h-16 w-16 text-destructive" />
                <h1 className="text-2xl font-bold">Access Denied</h1>
                <p className="text-muted-foreground max-w-md">
                    You do not have the required permissions to access the TaaS BugSense AI application. Please contact your administrator if you believe this is an error.
                </p>
            </div>
        </div>
    );
  }

  if (userProfile?.role === 'admin') {
      return (
          <DashboardPage />
      );
  }

  // Fallback for when profile is loaded but role is not admin/user, or profile doesn't exist
  return (
    <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
            <Bug className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Verifying user role...</p>
        </div>
    </div>
  );
}
