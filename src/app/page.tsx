
import { DashboardPage } from '@/components/pages/dashboard-page';
import { getDefects } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { defects, timestamp } = await getDefects();
  return (
      <DashboardPage initialDefects={defects} initialTimestamp={timestamp} />
  );
}
