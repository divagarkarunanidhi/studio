
"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from "recharts";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "../ui/skeleton";

interface ChartPoint {
  name: string;
  count: number;
}

interface TestCaseBarChartProps {
  data: ChartPoint[];
  title: string;
  description: string;
  isLoading?: boolean;
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function TestCaseBarChart({ data, title, description, isLoading }: TestCaseBarChartProps) {
    const sortedData = React.useMemo(() => {
        return [...data].sort((a, b) => b.count - a.count);
    }, [data]);

    const chartConfig = React.useMemo(() => {
        return sortedData.reduce((acc, item, index) => {
          acc[item.name] = {
            label: item.name,
            color: COLORS[index % COLORS.length],
          };
          return acc;
        }, {} as ChartConfig);
    }, [sortedData]);
    
  if (isLoading) {
    return (
        <Card>
            <CardContent className="p-6">
                <Skeleton className="h-[250px] w-full" />
            </CardContent>
        </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardContent className="p-0">
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <BarChart
            accessibilityLayer
            data={sortedData}
            margin={{
              top: 20,
              right: 20,
              bottom: 40,
              left: 20,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              angle={-45}
              textAnchor="end"
              interval={0}
              height={80} // Adjust height to prevent label cutoff
              tick={{ fontSize: 12 }}
            />
            <YAxis />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Bar dataKey="count" radius={4} barSize={30}>
                {sortedData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
