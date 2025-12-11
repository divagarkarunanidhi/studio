
"use client";

import * as React from "react";
import { Pie, PieChart, Cell, Tooltip } from "recharts";
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
  ChartTooltipContent,
} from "@/components/ui/chart";

interface ChartPoint {
  name: string;
  count: number;
}
interface TestCasePieChartProps {
  data: ChartPoint[];
  title: string;
  description: string;
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#FFBB28",
  "#FF8042",
  "#00C49F",
  "#A28CF2",
  "#FF6384",
];


export function TestCasePieChart({
  data,
  title,
  description,
}: TestCasePieChartProps) {

  const chartConfig = React.useMemo(() => {
    if (!data) return {};
    return data.reduce((acc, item, index) => {
      acc[item.name] = {
        label: item.name,
        color: COLORS[index % COLORS.length],
      };
      return acc;
    }, {} as ChartConfig);
  }, [data]);

  const totalCount = React.useMemo(() => {
    return data.reduce((acc, item) => acc + item.count, 0);
  }, [data]);

  return (
    <Card className="flex flex-col items-center">
      <CardHeader className="items-center pb-0">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[300px]"
        >
          <PieChart>
            <Tooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel nameKey="name" />}
            />
            <Pie
              data={data}
              dataKey="count"
              nameKey="name"
              innerRadius={60}
              strokeWidth={5}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardContent className="mt-2 flex-col gap-2 text-sm">
        <div className="flex items-center justify-center font-semibold">
          Total: {totalCount}
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {data.map((item, index) => (
             <div key={item.name} className="flex items-center gap-1">
                <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span>
                {item.name} (
                <span className="font-bold text-foreground">
                    {item.count}
                </span>
                )
                </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
