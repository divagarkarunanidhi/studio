
"use client";

import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Lightbulb, AlertTriangle } from 'lucide-react';
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

interface AnalysisPageProps {
  defects: Defect[];
  uniqueDomains: string[];
}

export function AnalysisPage({ defects, uniqueDomains }: AnalysisPageProps) {
  const [analysis, setAnalysis] = useState<DefectAnalysisOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>('');

  const filteredDefects = useMemo(() => {
    if (!selectedDomain) return [];
    return defects.filter((d) => d.domain === selectedDomain);
  }, [defects, selectedDomain]);

  const handleRunAnalysis = useCallback(async () => {
    if (filteredDefects.length === 0) {
        setError("No defects found for the selected domain.");
        return;
    }
    setIsLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const result = await analyzeDefects({ defects: filteredDefects });
      setAnalysis(result);
    } catch (err) {
      console.error(err);
      setError('Could not generate analysis due to an unexpected error. Please check the console for details.');
    } finally {
      setIsLoading(false);
    }
  }, [filteredDefects]);


  const renderContent = (title: string, content: string | undefined) => {
    if (isLoading) {
      return (
        <>
          <Skeleton className="h-6 w-1/4 mb-2" />
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-3/4" />
        </>
      )
    }
    if (!content && analysis) {
        return <p className="text-muted-foreground">No insights generated for this section.</p>;
    }
    if (!content) return null;

    return (
      <>
        <h3 className="font-semibold text-lg mb-2">{title}</h3>
        <p className="text-muted-foreground whitespace-pre-wrap">{content}</p>
      </>
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
            <Card>
            <CardHeader>
                <CardTitle>Defect Root Cause</CardTitle>
            </CardHeader>
            <CardContent>
                {renderContent("Root Causes", analysis?.defectCause)}
            </CardContent>
            </Card>
            <Card>
            <CardHeader>
                <CardTitle>Suggestions for Reduction</CardTitle>
            </CardHeader>
            <CardContent>
                {renderContent("Suggestions", analysis?.defectSuggestions)}
            </CardContent>
            </Card>
            <Card>
            <CardHeader>
                <CardTitle>Source of Defects</CardTitle>
            </CardHeader>
            <CardContent>
                {renderContent("Primary Sources", analysis?.defectSource)}
            </CardContent>
            </Card>
        </div>
      )}
    </div>
  );
}
