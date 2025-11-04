
'use client';

import { useState, useMemo } from 'react';
import type { Defect } from '@/lib/types';
import { DefectTrendChart, type TrendPeriod } from '@/components/dashboard/defect-trend-chart';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getYear, parseISO } from 'date-fns';
import { DateRangePicker } from '../ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { MultiSelect, type MultiSelectOption } from '../ui/multi-select';


type AnalysisType = 'creation' | 'resolution' | 'domain';

interface TrendPageProps {
  defects: Defect[];
}

export function TrendPage({ defects }: TrendPageProps) {
  const [analysisType, setAnalysisType] = useState<AnalysisType>('creation');
  const [period, setPeriod] = useState<TrendPeriod>('all-time');
  
  const uniqueDomains = useMemo(() => {
    const domains = new Set<string>();
    defects.forEach(defect => {
      if (defect.domain) domains.add(defect.domain);
    });
    return Array.from(domains).filter(Boolean).sort();
  }, [defects]);

  const domainOptions: MultiSelectOption[] = useMemo(() => {
    return uniqueDomains.map(d => ({ value: d, label: d }));
  }, [uniqueDomains]);

  const [selectedDomains, setSelectedDomains] = useState<string[]>(() => uniqueDomains.slice(0, 5));

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    defects.forEach(defect => {
      try {
        const dateKey = analysisType === 'resolution' ? defect.updated : defect.created_at;
        if(dateKey) {
            years.add(getYear(parseISO(dateKey)));
        }
      } catch (e) {
        // ignore invalid dates
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [defects, analysisType]);
  
  const [selectedYear, setSelectedYear] = useState<number>(() => availableYears[0] || new Date().getFullYear());
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  return (
    <div className="space-y-6">
       <Tabs
        value={analysisType}
        onValueChange={(value) => setAnalysisType(value as AnalysisType)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="creation">By Creation</TabsTrigger>
          <TabsTrigger value="resolution">By Resolution</TabsTrigger>
          <TabsTrigger value="domain">By Domain</TabsTrigger>
        </TabsList>
        <TabsContent value="creation" className="mt-4">
          <TrendChartContainer
            defects={defects}
            period={period}
            setPeriod={setPeriod}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            availableYears={availableYears}
            dateRange={dateRange}
            setDateRange={setDateRange}
            analysisType="creation"
          />
        </TabsContent>
        <TabsContent value="resolution" className="mt-4">
           <TrendChartContainer
            defects={defects}
            period={period}
            setPeriod={setPeriod}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            availableYears={availableYears}
            dateRange={dateRange}
            setDateRange={setDateRange}
            analysisType="resolution"
          />
        </TabsContent>
        <TabsContent value="domain" className="mt-4 space-y-4">
             <Card>
                <CardHeader>
                    <CardTitle>Domain Selection</CardTitle>
                </CardHeader>
                <CardContent>
                    <MultiSelect 
                        options={domainOptions}
                        selected={selectedDomains}
                        onChange={setSelectedDomains}
                        placeholder="Select domains to compare..."
                    />
                </CardContent>
            </Card>
           <TrendChartContainer
            defects={defects}
            period={period}
            setPeriod={setPeriod}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            availableYears={availableYears}
            dateRange={dateRange}
            setDateRange={setDateRange}
            analysisType="domain"
            selectedDomains={selectedDomains}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}


interface TrendChartContainerProps {
    defects: Defect[];
    period: TrendPeriod;
    setPeriod: (period: TrendPeriod) => void;
    selectedYear: number;
    setSelectedYear: (year: number) => void;
    availableYears: number[];
    dateRange: DateRange | undefined;
    setDateRange: (dateRange: DateRange | undefined) => void;
    analysisType: AnalysisType;
    selectedDomains?: string[];
}

function TrendChartContainer({
    defects,
    period,
    setPeriod,
    selectedYear,
    setSelectedYear,
    availableYears,
    dateRange,
    setDateRange,
    analysisType,
    selectedDomains
}: TrendChartContainerProps) {
    return (
        <Tabs
            value={period}
            onValueChange={(value) => setPeriod(value as TrendPeriod)}
            className="w-full"
        >
            <div className="flex flex-wrap items-center gap-4">
            <TabsList>
                <TabsTrigger value="all-time">All Time</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="yearly">Yearly</TabsTrigger>
                <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
            {period === 'monthly' && (
                <Select
                value={String(selectedYear)}
                onValueChange={(value) => setSelectedYear(Number(value))}
                >
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select Year" />
                </SelectTrigger>
                <SelectContent>
                    {availableYears.map(year => (
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                    ))}
                </SelectContent>
                </Select>
            )}
            {period === 'custom' && (
                <DateRangePicker date={dateRange} onDateChange={setDateRange} />
            )}
            </div>
            <div className="mt-4">
                <DefectTrendChart 
                    defects={defects} 
                    period={period} 
                    year={selectedYear} 
                    dateRange={dateRange} 
                    analysisType={analysisType}
                    selectedDomains={selectedDomains}
                />
            </div>
        </Tabs>
    )
}
