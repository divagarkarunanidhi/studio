
"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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

const chartConfig = {
  count: {
    label: "Test Cases",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

export function TestCaseBarChart({ data, title, description, isLoading }: TestCaseBarChartProps) {
    const sortedData = React.useMemo(() => {
        return [...data].sort((a, b) => b.count - a.count);
    }, [data]);
    
  if (isLoading) {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-64 w-full" />
            </CardContent>
        </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardContent className="p-0">
        <ChartContainer config={chartConfig}>
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
            <Bar dataKey="count" fill="var(--color-count)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
