
'use client';

import { useMemo } from 'react';
import type { Defect } from '@/lib/types';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig,
} from '@/components/ui/chart';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { format, parseISO, startOfWeek } from 'date-fns';

interface DefectTrendChartProps {
  defects: Defect[];
}

const chartConfig = {
  count: {
    label: 'Defects',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

export function DefectTrendChart({ defects }: DefectTrendChartProps) {
  const trendData = useMemo(() => {
    if (!defects.length) return [];

    const countsByWeek = defects.reduce((acc, defect) => {
      try {
        const date = parseISO(defect.created_at);
        const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday
        const weekKey = format(weekStart, 'yyyy-MM-dd');
        acc[weekKey] = (acc[weekKey] || 0) + 1;
      } catch (e) {
        // Ignore invalid dates
      }
      return acc;
    }, {} as { [key: string]: number });

    return Object.entries(countsByWeek)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [defects]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Defect Creation Trend</CardTitle>
        <CardDescription>Number of new defects created per week</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ChartContainer config={chartConfig}>
            <AreaChart accessibilityLayer data={trendData} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => format(parseISO(value), 'MMM d')}
              />
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
