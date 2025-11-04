"use client";

import { useState, useCallback, useMemo } from 'react';
import type { Defect, DefectSummaryOutput } from '@/lib/types';
import { summarizeDefects } from '@/ai/flows/defect-summary-flow';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Lightbulb, AlertTriangle, Wand2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DefectPieChart } from '../dashboard/defect-pie-chart';

interface SummaryPageProps {
  defects: Defect[];
  uniqueDomains: string[];
}

export function SummaryPage({ defects, uniqueDomains }: SummaryPageProps) {
  const [summary, setSummary] = useState<DefectSummaryOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>('');

  const filteredDefects = useMemo(() => {
    if (!selectedDomain) return [];
    return defects.filter((d) => d.domain === selectedDomain);
  }, [defects, selectedDomain]);

  const handleRunSummary = useCallback(async () => {
    if (filteredDefects.length === 0) {
      setError("No defects found for the selected domain.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSummary(null);
    try {
      const result = await summarizeDefects({ defects: filteredDefects });
      setSummary(result);
    } catch (err) {
      console.error(err);
      setError('Could not generate summary due to an unexpected error. Please check the console for details.');
    } finally {
      setIsLoading(false);
    }
  }, [filteredDefects]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI-Powered Defect Summary</CardTitle>
          <CardDescription>
            Visualize predicted root causes and functional areas for defects. Select a domain to begin.
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
          <Button onClick={handleRunSummary} disabled={isLoading || !selectedDomain}>
            <Wand2 className="mr-2 h-4 w-4" />
            {isLoading ? 'Generating Summary...' : 'Generate Summary'}
          </Button>
        </CardContent>
      </Card>
      
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Summary Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {(!summary && !isLoading && !error && !selectedDomain) && (
        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertTitle>Ready to Summarize</AlertTitle>
          <AlertDescription>
            Please select a domain from the dropdown above to start the summary.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DefectPieChart
            title="Defects by Root Cause"
            description="Predicted distribution of root causes"
            data={summary?.rootCause || []}
            isLoading={isLoading}
        />
        <DefectPieChart
            title="Defects by Functional Area"
            description="Predicted distribution of functional areas"
            data={summary?.defectArea || []}
            isLoading={isLoading}
        />
      </div>

    </div>
  );
}
