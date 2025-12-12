
"use client";

import * as React from "react";
import * as XLSX from 'xlsx';
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

type TestCaseData = { [key: string]: string };

interface ChartPoint {
  name: string;
  count: number;
  testCases: TestCaseData[];
}
interface TestCasePieChartProps {
  data: ChartPoint[];
  title: string;
  description: string;
  jiraLink?: string;
  allHeaders: string[];
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
  allHeaders,
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
    // Find the 'Total Test Cases' slice to display its count, otherwise sum all slices.
    const totalSlice = data.find(d => d.name === 'Total Test Cases');
    return totalSlice ? totalSlice.count : data.reduce((acc, item) => acc + item.count, 0);
  }, [data]);
  
  if (!data || data.length === 0) {
    return (
        <Alert>
            <PieChartIcon className="h-4 w-4" />
            <AlertTitle>No Chart Data</AlertTitle>
            <AlertDescription>
                There is no data to display in the chart. Please upload data or adjust filters to see a distribution.
            </AlertDescription>
        </Alert>
    );
  }

  const handleExport = (testCasesToExport: TestCaseData[], sliceName: string) => {
    if (testCasesToExport.length === 0) return;

    const worksheetData = testCasesToExport.map(tc => {
        const row: { [key: string]: any } = {};
        allHeaders.forEach(header => {
            if (header === 'Issue key' && jiraLink) {
                row[header] = {
                    t: 's',
                    v: tc[header],
                    l: { Target: `${jiraLink}/browse/${tc[header]}`, Tooltip: `View ${tc[header]} in JIRA` }
                };
            } else {
                row[header] = tc[header] || '';
            }
        });
        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(worksheetData, { header: allHeaders });

    // Set column widths
    const colWidths = allHeaders.map(header => ({ wch: Math.max(header.length, 20) }));
    worksheet['!cols'] = colWidths;
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Test Cases');

    const fileName = `test_cases_${sliceName.replace(/ /g, '_')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

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
          Total Test Cases in File: {totalCount}
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
                            );
                        })}
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <Button variant="outline" onClick={() => handleExport(item.testCases, item.name)} disabled={!item.testCases || item.testCases.length === 0}>
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
