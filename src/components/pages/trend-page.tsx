
'use client';

import type { Defect } from '@/lib/types';
import { DefectTrendChart } from '@/components/dashboard/defect-trend-chart';

interface TrendPageProps {
  defects: Defect[];
}

export function TrendPage({ defects }: TrendPageProps) {
  return (
    <div className="space-y-6">
      <DefectTrendChart defects={defects} />
    </div>
  );
}

    