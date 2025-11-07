
'use client';

import { DashboardPage } from '@/components/pages/dashboard-page';
import { useUser, useFirestore, useDoc, useMemoFirebase, useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Bug, ShieldX } from 'lucide-react';
import { doc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';

export default function Home() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const firestore = useFirestore();
  const auth = useAuth();
  const { toast } = useToast();

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

  useEffect(() => {
    // This effect handles access denial for 'user' role or if profile doesn't exist after loading.
    if (!isProfileLoading && user) {
        const isDenied = userProfile?.role === 'user' || !userProfile;
        if (isDenied) {
            const description = userProfile
              ? 'You do not have the required permissions to access this page.'
              : 'Your user profile was not found. Please contact an administrator.';

            toast({
                variant: 'destructive',
                title: 'Access Denied',
                description: `${description} You will be logged out.`,
            });
            
            // Immediately sign out and redirect
            const performSignOut = async () => {
                if (auth) {
                    await signOut(auth);
                }
                router.push('/login');
            };

            performSignOut();
        }
    }
  }, [userProfile, isProfileLoading, user, auth, router, toast]);

  if (isUserLoading || isProfileLoading || !user || !userProfile) {
    return (
        <div className="flex h-screen w-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Bug className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">Verifying user role...</p>
            </div>
        </div>
    );
  }

  const role = userProfile?.role;

  if (role === 'admin' || role === 'taas') {
      return <DashboardPage userRole={role} />;
  }
  
  // This UI will be shown briefly before the redirect logic in useEffect kicks in.
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-4 text-center">
            <ShieldX className="h-16 w-16 text-destructive" />
            <h1 className="text-2xl font-bold">Access Denied</h1>
            <p className="text-muted-foreground max-w-md">
                You do not have the required permissions. Redirecting to login...
            </p>
        </div>
    </div>
  );
}
