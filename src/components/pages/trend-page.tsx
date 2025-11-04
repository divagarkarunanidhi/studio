
'use client';

import { useState, useMemo } from 'react';
import type { Defect } from '@/lib/types';
import { DefectTrendChart, type TrendPeriod } from '@/components/dashboard/defect-trend-chart';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getYear, parseISO } from 'date-fns';

interface TrendPageProps {
  defects: Defect[];
}

export function TrendPage({ defects }: TrendPageProps) {
  const [period, setPeriod] = useState<TrendPeriod>('all-time');
  
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    defects.forEach(defect => {
      try {
        years.add(getYear(parseISO(defect.created_at)));
      } catch (e) {
        // ignore invalid dates
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [defects]);
  
  const [selectedYear, setSelectedYear] = useState<number>(() => availableYears[0] || new Date().getFullYear());

  return (
    <div className="space-y-6">
      <Tabs
        value={period}
        onValueChange={(value) => setPeriod(value as TrendPeriod)}
        className="w-full"
      >
        <div className="flex items-center gap-4">
          <TabsList>
            <TabsTrigger value="all-time">All Time</TabsTrigger>
            <TabsTrigger value="yearly">Yearly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
          {period === 'monthly' && (
            <Select
              value={String(selectedYear)}
              onValueChange={(value) => setSelectedYear(Number(value))}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Year" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <TabsContent value="all-time" className="mt-4">
          <DefectTrendChart defects={defects} period="all-time" />
        </TabsContent>
        <TabsContent value="yearly" className="mt-4">
          <DefectTrendChart defects={defects} period="yearly" />
        </TabsContent>
        <TabsContent value="monthly" className="mt-4">
          <DefectTrendChart defects={defects} period="monthly" year={selectedYear} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
