
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { MultiSelect, type MultiSelectOption } from '../ui/multi-select';


export type AnalysisType = 'creation' | 'resolution' | 'domain' | 'creation-vs-closure';

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

  const [selectedCompareDomains, setSelectedCompareDomains] = useState<string[]>(() => domainOptions.slice(0, 5).map(o => o.value));
  const [selectedFilterDomains, setSelectedFilterDomains] = useState<string[]>([]);


  const availableYears = useMemo(() => {
    const years = new Set<number>();
    defects.forEach(defect => {
      try {
        const dateKey = analysisType === 'resolution' ? defect.updated : defect.created_at;
        if(dateKey) {
            years.add(getYear(parseISO(dateKey)));
        }
        // Also consider created_at for 'creation-vs-closure'
        if (analysisType === 'creation-vs-closure' && defect.created_at) {
          years.add(getYear(parseISO(defect.created_at)));
        }
      } catch (e) {
        // ignore invalid dates
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [defects, analysisType]);
  
  const [selectedYear, setSelectedYear] = useState<number>(() => availableYears[0] || new Date().getFullYear());
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const isTimeFilterDisabled = analysisType === 'creation-vs-closure';

  const showDomainFilter = analysisType === 'creation' || analysisType === 'resolution' || analysisType === 'creation-vs-closure';

  return (
    <div className="space-y-6">
       <Tabs
        value={analysisType}
        onValueChange={(value) => setAnalysisType(value as AnalysisType)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="creation">By Creation</TabsTrigger>
          <TabsTrigger value="resolution">By Resolution</TabsTrigger>
          <TabsTrigger value="domain">By Domain</TabsTrigger>
          <TabsTrigger value="creation-vs-closure">Creation vs Closure</TabsTrigger>
        </TabsList>

        {showDomainFilter && (
             <Card className="mt-4">
                <CardHeader>
                    <CardTitle>Domain Filter</CardTitle>
                    <CardDescription>Select domains to filter the chart data. Leave empty to include all domains.</CardDescription>
                </CardHeader>
                <CardContent>
                    <MultiSelect 
                        options={domainOptions}
                        defaultValue={selectedFilterDomains}
                        onValueChange={setSelectedFilterDomains}
                        placeholder="Filter by domains..."
                    />
                </CardContent>
            </Card>
        )}

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
            selectedDomains={selectedFilterDomains}
            isTimeFilterDisabled={isTimeFilterDisabled}
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
            selectedDomains={selectedFilterDomains}
            isTimeFilterDisabled={isTimeFilterDisabled}
          />
        </TabsContent>
        <TabsContent value="domain" className="mt-4 space-y-4">
             <Card>
                <CardHeader>
                    <CardTitle>Domain Selection</CardTitle>
                    <CardDescription>Select domains to compare on the chart.</CardDescription>
                </CardHeader>
                <CardContent>
                    <MultiSelect 
                        options={domainOptions}
                        defaultValue={selectedCompareDomains}
                        onValueChange={setSelectedCompareDomains}
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
            selectedDomains={selectedCompareDomains}
            isTimeFilterDisabled={isTimeFilterDisabled}
          />
        </TabsContent>
        <TabsContent value="creation-vs-closure" className="mt-4">
           <TrendChartContainer
            defects={defects}
            period={period}
            setPeriod={setPeriod}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            availableYears={availableYears}
            dateRange={dateRange}
            setDateRange={setDateRange}
            analysisType="creation-vs-closure"
            selectedDomains={selectedFilterDomains}
            isTimeFilterDisabled={isTimeFilterDisabled}
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
    isTimeFilterDisabled: boolean;
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
    selectedDomains,
    isTimeFilterDisabled
}: TrendChartContainerProps) {
    
    // For 'creation-vs-closure', we force 'all-time' and hide the time period filters.
    const currentPeriod = analysisType === 'creation-vs-closure' ? 'all-time' : period;
    
    return (
        <Tabs
            value={currentPeriod}
            onValueChange={(value) => setPeriod(value as TrendPeriod)}
            className="w-full"
        >
            <div className="flex flex-wrap items-center gap-4">
                {analysisType !== 'creation-vs-closure' && (
                    <>
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
                    </>
                )}
            </div>
            <div className="mt-4">
                <DefectTrendChart 
                    defects={defects} 
                    period={currentPeriod}
                    year={selectedYear} 
                    dateRange={dateRange} 
                    analysisType={analysisType}
                    selectedDomains={selectedDomains}
                />
            </div>
        </Tabs>
    )
}
