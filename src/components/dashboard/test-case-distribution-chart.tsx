
"use client";

import * as React from "react";
import * as XLSX from 'xlsx';
import { Pie, PieChart, Cell, Tooltip, Bar, BarChart, CartesianGrid, XAxis, YAxis, Line, LineChart, Area, AreaChart, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Text } from "recharts";
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
import { PieChart as PieChartIcon, Download } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { TooltipProvider, Tooltip as UITooltip, TooltipContent as UITooltipContent, TooltipTrigger as UITooltipTrigger } from "@/components/ui/tooltip";


type TestCaseData = { [key: string]: string };
type ChartType = 'pie' | 'bar' | 'line' | 'area' | 'radar';

interface ChartPoint {
  name: string;
  count: number;
  testCases: TestCaseData[];
}
interface TestCaseDistributionChartProps {
  data: ChartPoint[];
  title: string;
  description: string;
  jiraLink?: string;
  allHeaders: string[];
  onExport: (testCasesToExport: TestCaseData[], sliceName: string) => void;
  chartType: ChartType;
  isLoading: boolean;
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


const CustomXAxisTick = (props: any) => {
    const { x, y, payload } = props;
    const value = payload.value;
    const truncatedValue = value.length > 20 ? `${value.substring(0, 20)}...` : value;

    return (
        <g transform={`translate(${x},${y})`}>
            <UITooltipProvider>
                <UITooltip>
                    <UITooltipTrigger asChild>
                        <Text x={0} y={0} dy={10} textAnchor="end" fill="#666" angle={-15}>
                            {truncatedValue}
                        </Text>
                    </UITooltipTrigger>
                    {value.length > 20 && (
                        <UITooltipContent>
                            <p>{value}</p>
                        </UITooltipContent>
                    )}
                </UITooltip>
            </UITooltipProvider>
        </g>
    );
};

export function TestCaseDistributionChart({
  data,
  title,
  description,
  jiraLink,
  allHeaders,
  onExport,
  chartType,
  isLoading,
}: TestCaseDistributionChartProps) {

  const chartConfig = React.useMemo(() => {
    if (!data || data.length === 0) return {};
    const config: ChartConfig = data.reduce((acc, item, index) => {
        acc[item.name] = {
            label: item.name,
            color: COLORS[index % COLORS.length],
        };
        return acc;
    }, {} as ChartConfig);

    // Add a generic 'count' for charts that use a single data key
    if (!config.count) {
        config.count = {
            label: "Count",
            color: "hsl(var(--chart-1))",
        };
    }

    return config;
  }, [data]);

  const totalCount = React.useMemo(() => {
    if (!data) return 0;
    const totalSlice = data.find(d => d.name === 'Total Test Cases in File');
    return totalSlice ? totalSlice.count : data.reduce((acc, item) => acc + item.count, 0);
  }, [data]);

  if (isLoading) {
    return (
        <Card className="flex flex-col w-full">
            <CardHeader className="items-center pb-0">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-1/3 mt-2" />
            </CardHeader>
            <CardContent className="flex-1 pb-0 flex justify-center items-center">
                <Skeleton className="h-[300px] w-[300px] rounded-full" />
            </CardContent>
            <CardContent className="mt-2 flex-col gap-2 text-sm">
                 <Skeleton className="h-5 w-1/4 mx-auto" />
                 <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                 </div>
            </CardContent>
        </Card>
    )
  }
  
  if (!data || data.length === 0) {
    return (
        <Alert>
            <PieChartIcon className="h-4 w-4" />
            <AlertTitle>No Chart Data</AlertTitle>
            <AlertDescription>
                There is no data to display in the chart. Please select labels to see a distribution.
            </AlertDescription>
        </Alert>
    );
  }

  // Filter out the 'Total Test Cases in File' slice from being rendered in the chart itself
  const chartSlices = data.filter(d => d.name !== 'Total Test Cases in File');

  const renderChart = () => {
    switch (chartType) {
        case 'bar':
            return (
                <ChartContainer config={chartConfig} className="w-11/12 mx-auto aspect-video max-h-[250px]">
                    <BarChart accessibilityLayer data={chartSlices} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                            dataKey="name"
                            tickLine={false}
                            tickMargin={10}
                            axisLine={false}
                            interval={0}
                            height={80}
                            tick={<CustomXAxisTick />}
                        />
                        <YAxis />
                        <Tooltip
                            cursor={false}
                            content={<ChartTooltipContent indicator="dot" />}
                        />
                        <Bar dataKey="count" fill="var(--color-count)" radius={4} barSize={20}>
                            {chartSlices.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ChartContainer>
            );
        case 'line':
            return (
                <ChartContainer config={chartConfig} className="w-11/12 mx-auto aspect-video max-h-[250px]">
                    <LineChart accessibilityLayer data={chartSlices} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                            dataKey="name"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={10}
                            interval={0}
                            height={80}
                            tick={<CustomXAxisTick />}
                        />
                        <YAxis />
                        <Tooltip content={<ChartTooltipContent indicator="dot" />} />
                        <Line
                            dataKey="count"
                            type="monotone"
                            stroke="hsl(var(--chart-1))"
                            strokeWidth={2}
                            dot={{
                                fill: "hsl(var(--chart-1))",
                            }}
                        />
                    </LineChart>
                </ChartContainer>
            );
        case 'area':
            return (
                <ChartContainer config={chartConfig} className="w-11/12 mx-auto aspect-video max-h-[250px]">
                    <AreaChart accessibilityLayer data={chartSlices} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                            dataKey="name"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={10}
                            interval={0}
                            height={80}
                            tick={<CustomXAxisTick />}
                        />
                        <YAxis />
                        <Tooltip content={<ChartTooltipContent indicator="dot" />} />
                        <Area
                            dataKey="count"
                            type="monotone"
                            fill="hsl(var(--chart-1))"
                            stroke="hsl(var(--chart-1))"
                            fillOpacity={0.4}
                        />
                    </AreaChart>
                </ChartContainer>
            );
        case 'radar':
            return (
                <ChartContainer config={chartConfig} className="w-full aspect-square max-h-[300px]">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartSlices}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="name" tick={(props) => {
                            const { x, y, payload } = props;
                            const name = payload.value.length > 15 ? `${payload.value.substring(0,15)}...` : payload.value;
                            return <text x={x} y={y} dy={5} textAnchor="middle" fill="#666" fontSize={10}>{name}</text>
                        }}/>
                        <PolarRadiusAxis />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Radar name="Test Cases" dataKey="count" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.6} />
                    </RadarChart>
                </ChartContainer>
            )
        case 'pie':
        default:
            return (
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
                        data={chartSlices}
                        dataKey="count"
                        nameKey="name"
                        innerRadius={60}
                        strokeWidth={5}
                        >
                        {chartSlices.map((entry, index) => (
                            <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                            className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            />
                        ))}
                        </Pie>
                    </PieChart>
                </ChartContainer>
            );
    }
  }


  return (
    <Card className="flex flex-col w-full">
      <CardHeader className="items-center pb-0">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0 flex justify-center items-center">
        {renderChart()}
      </CardContent>
      <CardContent className="mt-2 flex-col gap-2 text-sm">
        <div className="flex items-center justify-center font-semibold">
          Total Test Cases in File: {totalCount}
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {chartSlices.map((item, index) => (
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
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Test Cases for: {item.name}</DialogTitle>
                  <DialogDescription>
                    {item.count} test case(s) fall under this category.
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-72 w-full rounded-md border">
                    <div className="p-4 flex flex-wrap gap-2">
                        {item.testCases && item.testCases.map((tc, idx) => {
                            const id = tc['Issue key'] || `item-${idx}`;
                            return (
                                <Badge key={id} variant="secondary">
                                    {jiraLink && id !== 'N/A' && !id.startsWith('item-') ? (
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
                            );
                        })}
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onExport(item.testCases, item.name)} disabled={!item.testCases || item.testCases.length === 0}>
                        <Download className="mr-2 h-4 w-4" />
                        Export to Excel
                    </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
