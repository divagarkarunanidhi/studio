
'use client';

import { useMemo } from 'react';
import type { Defect } from '@/lib/types';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Line, ComposedChart, Legend, LineChart, Tooltip } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { format, parseISO, startOfWeek, startOfMonth, startOfYear, getYear, isWithinInterval } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { CalendarIcon } from 'lucide-react';
import type { AnalysisType } from '../pages/trend-page';

export type TrendPeriod = 'all-time' | 'yearly' | 'monthly' | 'weekly' | 'custom';

interface DefectTrendChartProps {
  defects: Defect[];
  period: TrendPeriod;
  analysisType: AnalysisType;
  selectedDomains?: string[];
  year?: number;
  dateRange?: DateRange;
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
];

export function DefectTrendChart({ defects, period, analysisType, selectedDomains = [], year, dateRange }: DefectTrendChartProps) {
  
    const { trendData, chartConfig } = useMemo(() => {
    if (!defects.length) return { trendData: [], chartConfig: {} };

    let chartConfig: ChartConfig = {
        count: {
            label: analysisType === 'creation' ? 'Created' : 'Resolved',
            color: 'hsl(var(--chart-1))',
        },
    };

    const getGroupKey: (date: Date) => string = (date) => {
      switch (period) {
        case 'yearly':
          return format(startOfYear(date), 'yyyy');
        case 'monthly':
          return format(startOfMonth(date), 'yyyy-MM');
        case 'weekly':
        case 'custom':
        case 'all-time':
        default:
            const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday
            return format(weekStart, 'yyyy-MM-dd');
      }
    };
    
    if (analysisType === 'creation-vs-closure') {
      const allEvents: { date: Date, type: 'created' | 'resolved' }[] = [];
        defects.forEach(defect => {
            try {
                if (defect.created_at) {
                    allEvents.push({ date: parseISO(defect.created_at), type: 'created' });
                }
                if (defect.status?.toLowerCase() === 'done' && defect.updated) {
                    allEvents.push({ date: parseISO(defect.updated), type: 'resolved' });
                }
            } catch (e) {
                // Ignore parsing errors
            }
        });

        // Sort events chronologically
        allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

        let cumulativeCreated = 0;
        let cumulativeResolved = 0;
        const dataMap = new Map<string, { date: string, created: number, resolved: number }>();

        allEvents.forEach(event => {
            if (event.type === 'created') {
                cumulativeCreated++;
            } else {
                cumulativeResolved++;
            }
            const dateStr = format(event.date, 'yyyy-MM-dd');
            dataMap.set(dateStr, {
                date: dateStr,
                created: cumulativeCreated,
                resolved: cumulativeResolved
            });
        });

        const trendData = Array.from(dataMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const newChartConfig: ChartConfig = {
            created: { label: 'Cumulative Created', color: 'hsl(var(--chart-1))' },
            resolved: { label: 'Cumulative Resolved', color: 'hsl(var(--chart-2))' },
        };
        
        return { trendData, chartConfig: newChartConfig };

    } else if(analysisType === 'domain') {
        let defectsToProcess = defects;
        const domainCountsByPeriod: { [date: string]: { [domain: string]: number } } = {};
        
        const filteredDefects = defectsToProcess.filter(d => selectedDomains.includes(d.domain || ''));

        filteredDefects.forEach(defect => {
            try {
                const date = parseISO(defect.created_at);
                const key = getGroupKey(date);
                if (!domainCountsByPeriod[key]) {
                  domainCountsByPeriod[key] = {};
                }
                const domain = defect.domain || 'Unassigned';
                domainCountsByPeriod[key][domain] = (domainCountsByPeriod[key][domain] || 0) + 1;
            } catch (e) {
                // Ignore invalid dates
            }
        });

        const newChartConfig = selectedDomains.reduce((acc, domain, index) => {
            acc[domain] = {
                label: domain,
                color: COLORS[index % COLORS.length],
            };
            return acc;
        }, {} as ChartConfig);

        const trendData = Object.entries(domainCountsByPeriod)
            .map(([date, counts]) => ({ date, ...counts }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        return { trendData, chartConfig: newChartConfig };

    } else { // creation or resolution
        let defectsToProcess = defects;

        if (analysisType === 'resolution') {
            defectsToProcess = defects.filter(d => d.status?.toLowerCase() === 'done' && d.updated);
        }
        
        if (period === 'monthly' && year) {
            defectsToProcess = defectsToProcess.filter(d => {
                try {
                    const dateKey = analysisType === 'resolution' ? d.updated : d.created_at;
                    return getYear(parseISO(dateKey!)) === year;
                } catch {
                    return false;
                }
            });
        }
    
        if (period === 'custom' && dateRange?.from && dateRange?.to) {
            const interval = { start: dateRange.from, end: dateRange.to };
            defectsToProcess = defectsToProcess.filter(d => {
                try {
                    const dateKey = analysisType === 'resolution' ? d.updated : d.created_at;
                    return isWithinInterval(parseISO(dateKey!), interval);
                } catch {
                    return false;
                }
            });
        }

        const countsByPeriod = defectsToProcess.reduce((acc, defect) => {
            try {
              const dateKey = analysisType === 'resolution' ? defect.updated : defect.created_at;
              const date = parseISO(dateKey!);
              const key = getGroupKey(date);
              acc[key] = (acc[key] || 0) + 1;
            } catch (e) {
              // Ignore invalid dates
            }
            return acc;
          }, {} as { [key: string]: number });
      
          const trendData = Object.entries(countsByPeriod)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return { trendData, chartConfig };
    }

  }, [defects, period, year, dateRange, analysisType, selectedDomains]);

  const tickFormatter = (value: string): string => {
    try {
        if (analysisType === 'creation-vs-closure') {
            return format(parseISO(value), 'MMM d, yyyy');
        }
        switch (period) {
            case 'yearly':
                return value; // '2023'
            case 'monthly':
                return format(parseISO(value), 'MMM'); // 'Jan'
            case 'weekly':
            case 'custom':
            case 'all-time':
            default:
                return format(parseISO(value), 'MMM d'); // 'Jan 1'
        }
    } catch {
        return value;
    }
  }

  const descriptionMap: Record<AnalysisType, Record<TrendPeriod, string>> = {
    creation: {
        'all-time': 'Number of new defects created per week across all time',
        'weekly': 'Number of new defects created per week',
        'yearly': 'Total defects created per year',
        'monthly': `Total defects created per month for the year ${year}`,
        'custom': 'Number of new defects created per week in the selected date range',
    },
    resolution: {
        'all-time': 'Number of defects resolved per week across all time',
        'weekly': 'Number of defects resolved per week',
        'yearly': 'Total defects resolved per year',
        'monthly': `Total defects resolved per month for the year ${year}`,
        'custom': 'Number of defects resolved per week in the selected date range',
    },
    domain: {
        'all-time': 'Number of new defects per domain per week across all time',
        'weekly': 'Number of new defects per domain per week',
        'yearly': 'Total new defects per domain per year',
        'monthly': `Total new defects per domain per month for the year ${year}`,
        'custom': 'Number of new defects per domain per week in the selected date range',
    },
    'creation-vs-closure': {
        'all-time': 'Cumulative count of created vs. resolved defects over time.',
        'weekly': 'Cumulative count of created vs. resolved defects over time.',
        'yearly': 'Cumulative count of created vs. resolved defects over time.',
        'monthly': `Cumulative count of created vs. resolved defects over time.`,
        'custom': 'Cumulative count of created vs. resolved defects over time.',
    }
  };

  const description = descriptionMap[analysisType][period];
  const titleMap: Record<AnalysisType, string> = {
    creation: 'Defect Creation Trend',
    resolution: 'Defect Resolution Trend',
    domain: 'Defect Trend by Domain',
    'creation-vs-closure': 'Cumulative Defect Creation vs. Closure'
  };
  const title = titleMap[analysisType]

  if (period === 'custom' && (!dateRange || !dateRange.from || !dateRange.to)) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <Alert>
                    <CalendarIcon className="h-4 w-4" />
                    <AlertTitle>Select a Date Range</AlertTitle>
                    <AlertDescription>Please select a start and end date to see the trend.</AlertDescription>
                </Alert>
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
      <CardContent>
        <div className="h-[250px]">
          <ChartContainer config={chartConfig} className="h-full w-full">
            {analysisType === 'domain' ? (
                 <LineChart accessibilityLayer data={trendData} margin={{ left: 12, right: 20 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={tickFormatter}
                        interval={trendData.length > 30 ? Math.floor(trendData.length / 15) : 0}
                    />
                    <YAxis />
                    <Tooltip content={<ChartTooltipContent indicator="dot" />} />
                    <Legend content={<ChartLegendContent />} />
                    {selectedDomains.map((domain) => (
                        <Line
                            key={domain}
                            dataKey={domain}
                            type="monotone"
                            stroke={`var(--color-${domain})`}
                            strokeWidth={2}
                            dot={false}
                        />
                    ))}
                 </LineChart>
            ) : analysisType === 'creation-vs-closure' ? (
                <LineChart accessibilityLayer data={trendData} margin={{ left: 12, right: 20 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={tickFormatter}
                        interval={trendData.length > 30 ? Math.floor(trendData.length / 15) : 0}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip content={<ChartTooltipContent indicator="dot" />} />
                    <Legend content={<ChartLegendContent />} />
                    <Line dataKey="created" type="monotone" stroke="var(--color-created)" strokeWidth={2} dot={false} />
                    <Line dataKey="resolved" type="monotone" stroke="var(--color-resolved)" strokeWidth={2} dot={false} />
                </LineChart>
            ) : (
                <AreaChart accessibilityLayer data={trendData} margin={{ left: 12, right: 20 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={tickFormatter}
                    interval={trendData.length > 30 ? Math.floor(trendData.length / 15) : 0}
                />
                <YAxis />
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
            )}
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
