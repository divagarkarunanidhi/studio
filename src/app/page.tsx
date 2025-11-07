
'use client';
import { DashboardPage } from '@/components/pages/dashboard-page';
import { FirebaseClientProvider } from '@/firebase/client-provider';

export default function Home() {
  return (
    <FirebaseClientProvider>
      <DashboardPage />
    </FirebaseClientProvider>
  );
}
