
'use client';

import { DashboardPage } from '@/components/pages/dashboard-page';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Bug, LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

function WelcomePage() {
  const handleLogout = async () => {
    await signOut({ redirect: false });
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-transparent p-4">
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

export interface UserProfile {
  username: string;
  email: string;
  role: 'admin' | 'taas' | 'view' | 'newuser';
}

export default function Home() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading) {
    return (
        <div className="flex h-screen w-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Bug className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">Verifying user role...</p>
            </div>
        </div>
    );
  }

  if (user) {
    const role = user.role;
    if (role === 'admin' || role === 'taas' || role === 'view') {
      const userProfile: UserProfile = {
        username: user.username || user.email || 'User',
        email: user.email || '',
        role,
      };
      return <DashboardPage userProfile={userProfile} />;
    }
    return <WelcomePage />;
  }

  return (
    <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
            <Bug className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Redirecting...</p>
        </div>
    </div>
  );
}
