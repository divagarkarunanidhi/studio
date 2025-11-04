
'use client';

import { useMemo } from 'react';
import type { Defect } from '@/lib/types';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig,
} from '@/components/ui/chart';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { format, parseISO, startOfWeek, startOfMonth, startOfYear, getYear } from 'date-fns';

export type TrendPeriod = 'all-time' | 'yearly' | 'monthly';

interface DefectTrendChartProps {
  defects: Defect[];
  period: TrendPeriod;
  year?: number;
}

const chartConfig = {
  count: {
    label: 'Defects',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

export function DefectTrendChart({ defects, period, year }: DefectTrendChartProps) {
  const trendData = useMemo(() => {
    if (!defects.length) return [];

    let defectsToProcess = defects;
    if (period === 'monthly' && year) {
        defectsToProcess = defects.filter(d => {
            try {
                return getYear(parseISO(d.created_at)) === year;
            } catch {
                return false;
            }
        });
    }


    const getGroupKey: (date: Date) => string = (date) => {
      switch (period) {
        case 'yearly':
          return format(startOfYear(date), 'yyyy');
        case 'monthly':
          return format(startOfMonth(date), 'yyyy-MM');
        case 'all-time':
        default:
            const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday
            return format(weekStart, 'yyyy-MM-dd');
      }
    };

    const countsByPeriod = defectsToProcess.reduce((acc, defect) => {
      try {
        const date = parseISO(defect.created_at);
        const key = getGroupKey(date);
        acc[key] = (acc[key] || 0) + 1;
      } catch (e) {
        // Ignore invalid dates
      }
      return acc;
    }, {} as { [key: string]: number });

    return Object.entries(countsByPeriod)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [defects, period, year]);

  const tickFormatter = (value: string): string => {
    try {
        switch (period) {
            case 'yearly':
                return value; // '2023'
            case 'monthly':
                return format(parseISO(value), 'MMM'); // 'Jan'
            case 'all-time':
            default:
                return format(parseISO(value), 'MMM d'); // 'Jan 1'
        }
    } catch {
        return value;
    }
  }

  const description = {
    'all-time': 'Number of new defects created per week',
    yearly: 'Total defects created per year',
    monthly: `Total defects created per month for the year ${year}`,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Defect Creation Trend</CardTitle>
        <CardDescription>{description[period]}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ChartContainer config={chartConfig}>
            <AreaChart accessibilityLayer data={trendData} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={tickFormatter}
                interval={0}
              />
              <YAxis />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
              <Area
                dataKey="count"
                type="natural"
                fill="var(--color-count)"
                fillOpacity={0.4}
                stroke="var(--color-count)"
                stackId="a"
              />
            </AreaChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
