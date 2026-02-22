
"use client";

import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Lightbulb, AlertTriangle, ListChecks, Target, ChevronDown } from 'lucide-react';
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

interface AnalysisPageProps {
  defects: Defect[];
  uniqueDomains: string[];
}

function MajorListItem({ item }: { item: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const colonIndex = item.indexOf(':');
  
  if (colonIndex === -1) {
    return (
      <li className="text-sm text-muted-foreground leading-relaxed">
        <span className="font-medium text-foreground">{item}</span>
      </li>
    );
  }

  const topic = item.substring(0, colonIndex);
  const rest = item.substring(colonIndex + 1).trim();

  return (
    <li className="text-sm leading-relaxed space-y-1 py-1">
      <div 
        className="flex items-center justify-between gap-2 group cursor-pointer hover:bg-muted/30 p-1 rounded-md transition-colors" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-bold text-foreground group-hover:text-primary transition-colors">
          {topic}
        </span>
        <Button variant="ghost" size="icon" className="h-5 w-5 p-0 opacity-50 group-hover:opacity-100 shrink-0">
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded ? "rotate-0" : "-rotate-90")} />
        </Button>
      </div>
      {isExpanded && (
        <p className="text-muted-foreground text-xs pl-3 mt-1 border-l-2 border-primary/20 animate-in fade-in slide-in-from-top-1 duration-200 leading-relaxed whitespace-pre-wrap">
          {rest}
        </p>
      )}
    </li>
  );
}

export function AnalysisPage({ defects, uniqueDomains }: AnalysisPageProps) {
  const [analysis, setAnalysis] = useState<DefectAnalysisOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>('');
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
    if (!selectedDomain) return [];
    return defects.filter((d) => d.domain === selectedDomain);
  }, [defects, selectedDomain]);

  const handleRunAnalysis = useCallback(async () => {
    if (filteredDefects.length === 0) {
        setError("No defects found for the selected domain.");
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
        <Card>
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
      <Collapsible open={isOpen} onOpenChange={() => toggleSection(id)}>
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
            <Card>
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
        <Collapsible open={isOpen} onOpenChange={() => toggleSection(id)}>
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
                            <ul className="list-decimal list-inside space-y-2">
                                {items.map((item, idx) => (
                                    <MajorListItem key={idx} item={item} />
                                ))}
                            </ul>
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
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Static Defect Analysis</CardTitle>
          <CardDescription>
            AI-powered insights into your defect data. Select a domain to begin the analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
            <Select value={selectedDomain} onValueChange={setSelectedDomain}>
                <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Select a Domain" />
                </SelectTrigger>
                <SelectContent>
                    {uniqueDomains.map(domain => (
                    <SelectItem key={domain} value={domain}>{domain}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button onClick={handleRunAnalysis} disabled={isLoading || !selectedDomain}>
                {isLoading ? 'Analyzing...' : 'Run Analysis'}
            </Button>
        </CardContent>
      </Card>
      
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Analysis Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {(!analysis && !isLoading && !error && !selectedDomain) && (
        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertTitle>Ready for Analysis</AlertTitle>
          <AlertDescription>
            Please select a domain from the dropdown above to start the analysis.
          </AlertDescription>
        </Alert>
      )}

      {(selectedDomain && !isLoading && !analysis && !error) && (
        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertTitle>Domain Selected</AlertTitle>
          <AlertDescription>
            Click the "Run Analysis" button to generate insights for the '{selectedDomain}' domain.
          </AlertDescription>
        </Alert>
      )}

      {(isLoading || analysis) && (
        <div className="grid grid-cols-1 gap-6">
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
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
