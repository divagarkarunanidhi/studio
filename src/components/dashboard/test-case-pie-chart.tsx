
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
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { PieChart as PieChartIcon } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription
} from "@/components/ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";

interface ChartPoint {
  name: string;
  count: number;
  testCaseIds?: string[];
}
interface TestCasePieChartProps {
  data: ChartPoint[];
  title: string;
  description: string;
  jiraLink?: string;
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
  jiraLink,
}: TestCasePieChartProps) {

  const chartConfig = React.useMemo(() => {
    if (!data || data.length === 0) return {};
    return data.reduce((acc, item, index) => {
      acc[item.name] = {
        label: item.name,
        color: COLORS[index % COLORS.length],
      };
      return acc;
    }, {} as ChartConfig);
  }, [data]);

  const totalCount = React.useMemo(() => {
    if (!data) return 0;
    return data.reduce((acc, item) => acc + item.count, 0);
  }, [data]);
  
  if (!data || data.length === 0) {
    return (
        <Alert>
            <PieChartIcon className="h-4 w-4" />
            <AlertTitle>No Chart Data</AlertTitle>
            <AlertDescription>
                There is no data to display in the chart. Please select one or more labels to see a distribution.
            </AlertDescription>
        </Alert>
    );
  }

  return (
    <Card className="flex flex-col">
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
                  className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
            <Dialog key={item.name}>
              <DialogTrigger asChild>
                <div className="flex items-center gap-1 cursor-pointer hover:underline">
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
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Test Cases for: {item.name}</DialogTitle>
                  <DialogDescription>
                    {item.count} test case(s) fall under this category.
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-72 w-full rounded-md border">
                    <div className="p-4 flex flex-wrap gap-2">
                        {item.testCaseIds && item.testCaseIds.map((id, idx) => (
                            <Badge key={`${id}-${idx}`} variant="secondary">
                                {jiraLink && id !== 'N/A' ? (
                                    <a
                                        href={`${jiraLink}/browse/${id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:underline"
                                    >
                                        {id}
                                    </a>
                                ) : (
                                    id
                                )}
                            </Badge>
                        ))}
                    </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
