"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Lightbulb, AlertTriangle } from 'lucide-react';
import type { Defect, DefectAnalysisOutput } from '@/lib/types';
import { analyzeDefects } from '@/ai/flows/defect-analysis-flow';
import { Button } from '../ui/button';
import { Chatbot } from '../dashboard/chatbot';

interface AnalysisPageProps {
  defects: Defect[];
}

export function AnalysisPage({ defects }: AnalysisPageProps) {
  const [analysis, setAnalysis] = useState<DefectAnalysisOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunAnalysis = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const result = await analyzeDefects({ defects });
      setAnalysis(result);
    } catch (err) {
      console.error(err);
      setError('Could not generate analysis due to an unexpected error. Please check the console for details.');
    } finally {
      setIsLoading(false);
    }
  }, [defects]);

  useEffect(() => {
    if (defects.length > 0) {
      handleRunAnalysis();
    }
  }, [defects, handleRunAnalysis]);

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
    if (!content) return null;
    return (
      <>
        <h3 className="font-semibold text-lg mb-2">{title}</h3>
        <p className="text-muted-foreground whitespace-pre-wrap">{content}</p>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Static Defect Analysis</CardTitle>
              <CardDescription>
                AI-powered insights into your defect data. The analysis is based on the currently loaded CSV file.
              </CardDescription>
            </CardHeader>
            <CardContent>
                {defects.length > 0 && (
                    <Button onClick={handleRunAnalysis} disabled={isLoading}>
                        {isLoading ? 'Analyzing...' : 'Re-run Analysis'}
                    </Button>
                )}
            </CardContent>
          </Card>
          
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Analysis Failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {(!analysis && !isLoading && !error) && (
            <Alert>
              <Lightbulb className="h-4 w-4" />
              <AlertTitle>Ready for Analysis</AlertTitle>
              <AlertDescription>
                Once you upload a CSV file, the analysis will run automatically. You can also re-run it using the button above.
              </AlertDescription>
            </Alert>
          )}

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
        </div>
        <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Defect Chatbot</CardTitle>
              <CardDescription>
                Ask questions about the defect data in plain English.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <Chatbot defects={defects} />
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
