
"use client";

import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Lightbulb, AlertTriangle, ListChecks, Target, ChevronDown, CalendarIcon } from 'lucide-react';
import type { Defect, DefectAnalysisOutput } from '@/lib/types';
import { analyzeDefects } from '@/ai/flows/defect-analysis-flow';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from '@/lib/utils';
import { DateRangePicker } from '../ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { isWithinInterval, parseISO } from 'date-fns';

interface AnalysisPageProps {
  defects: Defect[];
  uniqueDomains: string[];
}

function MajorListItem({ item, index }: { item: string; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const colonIndex = item.indexOf(':');
  
  if (colonIndex === -1) {
    return (
      <div className="flex items-start gap-3 py-1">
        <span className="font-bold text-sm text-foreground shrink-0 mt-0.5">{index}.</span>
        <span className="text-sm text-muted-foreground leading-relaxed font-medium text-foreground">{item}</span>
      </div>
    );
  }

  const topic = item.substring(0, colonIndex);
  const rest = item.substring(colonIndex + 1).trim();

  return (
    <div className="text-sm leading-relaxed space-y-1 py-1">
      <div 
        className="flex items-start gap-3 group cursor-pointer hover:bg-muted/30 p-1 rounded-md transition-colors" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-bold text-foreground shrink-0 mt-0.5">
          {index}.
        </span>
        <div className="flex-1 flex items-center justify-between gap-2">
            <span className="font-bold text-foreground group-hover:text-primary transition-colors">
            {topic}
            </span>
            <Button variant="ghost" size="icon" className="h-5 w-5 p-0 opacity-50 group-hover:opacity-100 shrink-0">
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded ? "rotate-0" : "-rotate-90")} />
            </Button>
        </div>
      </div>
      {isExpanded && (
        <p className="text-muted-foreground text-xs pl-8 mt-1 border-l-2 border-primary/20 animate-in fade-in slide-in-from-top-1 duration-200 leading-relaxed whitespace-pre-wrap">
          {rest}
        </p>
      )}
    </div>
  );
}

export function AnalysisPage({ defects, uniqueDomains }: AnalysisPageProps) {
  const [analysis, setAnalysis] = useState<DefectAnalysisOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const { user } = useUser();

  // State for top-level collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    majorRootCauses: true,
    majorReductionSuggestions: true,
    recurringPatterns: true,
    engineeringSuggestions: true,
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const filteredDefects = useMemo(() => {
    let result = defects;
    
    if (selectedDomain && selectedDomain !== 'all') {
      result = result.filter((d) => d.domain === selectedDomain);
    }
    
    if (dateRange?.from && dateRange?.to) {
      const interval = { start: dateRange.from, end: dateRange.to };
      result = result.filter(d => {
        try {
          return isWithinInterval(parseISO(d.created_at), interval);
        } catch {
          return false;
        }
      });
    }
    
    return result;
  }, [defects, selectedDomain, dateRange]);

  const handleRunAnalysis = useCallback(async () => {
    if (filteredDefects.length === 0) {
        setError("No defects found for the selected criteria.");
        return;
    }
    if (!user) {
        setError("You must be logged in to run analysis.");
        return;
    }
    setIsLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const result = await analyzeDefects({ defects: filteredDefects, userId: user.uid });
      setAnalysis(result);
    } catch (err: any) {
      if (err.message?.includes('permission-denied') || err.message?.includes('insufficient permissions')) {
        const contextualError = new FirestorePermissionError({
            operation: 'list',
            path: 'sharedFeedback',
        });
        errorEmitter.emit('permission-error', contextualError);
        setError('A permission error occurred while fetching analysis examples. The detailed error has been logged.');
      } else {
        console.error(err);
        setError('Could not generate analysis due to an unexpected error. Please check the console for details.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [filteredDefects, user]);


  const renderContent = (id: string, title: string, content: string | undefined) => {
    const isOpen = openSections[id];

    if (isLoading) {
      return (
        <Card className='w-full'>
            <CardHeader>
                <Skeleton className="h-6 w-1/4 mb-2" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-3/4" />
            </CardContent>
        </Card>
      )
    }
    if (!content && analysis) {
        return null;
    }
    if (!content) return null;

    return (
      <Collapsible open={isOpen} onOpenChange={() => toggleSection(id)} className='w-full'>
        <Card>
            <CollapsibleTrigger asChild>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardTitle>{title}</CardTitle>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", !isOpen && "-rotate-90")} />
                </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <CardContent className="pt-0">
                    <p className="text-muted-foreground whitespace-pre-wrap text-sm leading-relaxed">{content}</p>
                </CardContent>
            </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  }

  const renderMajorList = (id: string, title: string, items: string[] | undefined, icon: React.ReactNode) => {
    const isOpen = openSections[id];

    if (isLoading) {
        return (
            <Card className='w-full'>
                <CardHeader className='flex flex-row items-center gap-2 space-y-0'>
                    {icon}
                    <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent className='space-y-2'>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                </CardContent>
            </Card>
        )
    }
    if (!analysis || !items) return null;

    return (
        <Collapsible open={isOpen} onOpenChange={() => toggleSection(id)} className='w-full'>
            <Card>
                <CollapsibleTrigger asChild>
                    <CardHeader className='flex flex-row items-center justify-between space-y-0 cursor-pointer hover:bg-muted/50 transition-colors'>
                        <div className="flex items-center gap-2">
                            {icon}
                            <CardTitle>{title}</CardTitle>
                        </div>
                        <ChevronDown className={cn("h-4 w-4 transition-transform", !isOpen && "-rotate-90")} />
                    </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <CardContent className="pt-0">
                        {items.length > 0 ? (
                            <div className="space-y-2">
                                {items.map((item, idx) => (
                                    <MajorListItem key={idx} item={item} index={idx + 1} />
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground italic">No major items identified.</p>
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
  }

  return (
    <div className="w-full space-y-6">
      <Card className='w-full'>
        <CardHeader>
          <CardTitle>Static Defect Analysis</CardTitle>
          <CardDescription>
            AI-powered insights into your defect data. Select a domain or filter by date range to begin.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-muted-foreground">Domain</label>
                <Select value={selectedDomain} onValueChange={setSelectedDomain}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select Domain" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Domains</SelectItem>
                        {uniqueDomains.map(domain => (
                        <SelectItem key={domain} value={domain}>{domain}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            
            <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-muted-foreground">Date Range (Optional)</label>
                <DateRangePicker date={dateRange} onDateChange={setDateRange} />
            </div>

            <div className="flex flex-col justify-end pt-6">
                <Button onClick={handleRunAnalysis} disabled={isLoading || (!selectedDomain && !dateRange)}>
                    {isLoading ? 'Analyzing...' : 'Run Analysis'}
                </Button>
            </div>
        </CardContent>
      </Card>
      
      {error && (
        <Alert variant="destructive" className='w-full'>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Analysis Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {(!analysis && !isLoading && !error && !selectedDomain && !dateRange) && (
        <Alert className='w-full'>
          <Lightbulb className="h-4 w-4" />
          <AlertTitle>Ready for Analysis</AlertTitle>
          <AlertDescription>
            Please select a domain (or "All Domains") and an optional date range from the filters above to start the analysis.
          </AlertDescription>
        </Alert>
      )}

      {( (selectedDomain || dateRange) && !isLoading && !analysis && !error) && (
        <Alert className='w-full'>
          <Lightbulb className="h-4 w-4" />
          <AlertTitle>Criteria Selected</AlertTitle>
          <AlertDescription>
            Click the "Run Analysis" button to generate insights for {selectedDomain === 'all' ? 'all domains' : (selectedDomain ? `'${selectedDomain}'` : 'selected filters')} {dateRange?.from ? `within the selected date range` : ''}.
          </AlertDescription>
        </Alert>
      )}

      {(isLoading || analysis) && (
        <div className="grid grid-cols-1 gap-6 w-full">
            <div className='grid grid-cols-1 gap-6 w-full'>
                {renderMajorList("majorRootCauses", "Major Root Causes", analysis?.majorRootCauses, <Target className='h-5 w-5 text-primary' />)}
                {renderMajorList("majorReductionSuggestions", "Major Reduction Suggestions", analysis?.majorReductionSuggestions, <ListChecks className='h-5 w-5 text-primary' />)}
            </div>

            {renderContent("recurringPatterns", "Defect Root Cause Analysis", analysis?.defectCause)}
            
            {renderContent("engineeringSuggestions", "Actionable Suggestions", analysis?.defectSuggestions)}
        </div>
      )}
    </div>
  );
}
