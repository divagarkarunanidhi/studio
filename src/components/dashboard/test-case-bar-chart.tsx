"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
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
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { BarChart as BarChartIcon } from "lucide-react";

interface ChartPoint {
  name: string;
  count: number;
}
interface TestCaseBarChartProps {
  data: ChartPoint[];
  title: string;
  description: string;
}

const chartConfig = {
  count: {
    label: "Count",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;


export function TestCaseBarChart({
  data,
  title,
  description,
}: TestCaseBarChartProps) {

  if (!data || data.length === 0) {
    return (
        <Alert>
            <BarChartIcon className="h-4 w-4" />
            <AlertTitle>No Chart Data</AlertTitle>
            <AlertDescription>
                There is no data to display in the chart. Please select one or more labels to see a distribution.
            </AlertDescription>
        </Alert>
    );
  }

  return (
    <Card>
        <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <BarChart accessibilityLayer data={data} margin={{ top: 20, right: 20, bottom: 60, left: 20 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                    dataKey="name"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                />
                <YAxis allowDecimals={false} />
                <Tooltip
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
