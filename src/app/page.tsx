
'use client';

import { DashboardPage } from '@/components/pages/dashboard-page';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Bug } from 'lucide-react';

export default function Home() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading || !user) {
    return (
        <div className="flex h-screen w-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Bug className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading Defect Insights...</p>
            </div>
        </div>
    );
  }
  
  return (
      <DashboardPage />
  );
}
