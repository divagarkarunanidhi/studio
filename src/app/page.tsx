
'use client';

import { DashboardPage } from '@/components/pages/dashboard-page';
import { useUser, useFirestore, useDoc, useMemoFirebase, useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Bug, ShieldX, LogOut } from 'lucide-react';
import { doc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

function WelcomePage() {
  const auth = useAuth();
  
  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome!</CardTitle>
          <CardDescription>
            Your account is authenticated, but your user profile is not yet set up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Please contact an administrator to have a role assigned to your account.
            Without a role, you will not be able to access the application.
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={handleLogout} className="w-full">
            <LogOut className="mr-2 h-4 w-4" />
            Log Out
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

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
    // This effect handles access denial for 'user' role.
    if (!isProfileLoading && user && userProfile?.role === 'user') {
        toast({
            variant: 'destructive',
            title: 'Access Denied',
            description: 'You do not have the required permissions to access this page. You will be logged out.',
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
  }, [userProfile, isProfileLoading, user, auth, router, toast]);

  if (isUserLoading || isProfileLoading) {
    return (
        <div className="flex h-screen w-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Bug className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">Verifying user role...</p>
            </div>
        </div>
    );
  }
  
  if (user && !userProfile) {
    return <WelcomePage />;
  }

  const role = userProfile?.role;

  if (role === 'admin' || role === 'taas') {
      return <DashboardPage userRole={role} />;
  }
  
  // This UI will be shown briefly before the redirect logic in useEffect kicks in for the 'user' role.
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

