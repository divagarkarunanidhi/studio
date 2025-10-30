"use client";

import { useState, useMemo } from 'react';
import type { Defect } from '@/lib/types';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig,
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';

interface GroupedDefectsChartProps {
  defects: Defect[];
}

const chartConfig = {
  count: {
    label: 'Count',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

const GROUPABLE_KEYS = ['severity', 'priority', 'status', 'domain'];

export function GroupedDefectsChart({ defects }: GroupedDefectsChartProps) {
  const [groupingKey, setGroupingKey] = useState('severity');

  const groupedData = useMemo(() => {
    if (!defects.length) return [];

    const counts = defects.reduce((acc, defect) => {
      const key = (defect[groupingKey] as string)?.trim() || 'Unassigned';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [defects, groupingKey]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Grouped Defect Analysis</CardTitle>
          <CardDescription>Defects grouped by the selected category</CardDescription>
        </div>
        <div className="w-48">
          <Select value={groupingKey} onValueChange={setGroupingKey}>
            <SelectTrigger>
              <SelectValue placeholder="Group by..." />
            </SelectTrigger>
            <SelectContent>
              {GROUPABLE_KEYS.map(key => (
                <SelectItem key={key} value={key}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ChartContainer config={chartConfig}>
            <BarChart accessibilityLayer data={groupedData} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                interval={0}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dot" />}
              />
              <Bar dataKey="count" fill="var(--color-count)" radius={4} />
            </BarChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
