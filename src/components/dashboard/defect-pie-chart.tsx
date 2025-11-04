
'use client';

import { Pie, PieChart, Cell } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { useMemo } from 'react';

interface DefectPieChartProps {
  data: { name: string; count: number }[];
  title: string;
  description: string;
  isLoading?: boolean;
}

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function DefectPieChart({ data, title, description, isLoading }: DefectPieChartProps) {
  const chartData = useMemo(() => data.map(item => ({ ...item, fill: 'var(--color-count)' })), [data]);

  const chartConfig = useMemo(() => {
    return data.reduce((acc, item, index) => {
        acc[item.name] = {
            label: item.name,
            color: CHART_COLORS[index % CHART_COLORS.length],
        };
        return acc;
    }, {} as any);
  }, [data]);


  if (isLoading) {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent className="flex justify-center">
                <Skeleton className="h-[250px] w-[250px] rounded-full" />
            </CardContent>
        </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='flex justify-center'>
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square w-full max-w-[250px]"
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="count" hideLabel />} />
            <Pie data={chartData} dataKey="count" nameKey="name" innerRadius={60}>
               {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <ChartLegend
              content={<ChartLegendContent nameKey="name" />}
              className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
