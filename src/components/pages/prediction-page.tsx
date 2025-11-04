
'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Defect, DefectPrediction } from '@/lib/types';
import { predictDefects } from '@/ai/flows/defect-prediction-flow';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Lightbulb, AlertTriangle, Wand2 } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select';

interface PredictionPageProps {
    defects: Defect[];
    uniqueDomains: string[];
}


export function PredictionPage({ defects, uniqueDomains }: PredictionPageProps) {
  const [predictions, setPredictions] = useState<DefectPrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>('');

  const filteredDefects = useMemo(() => {
    if (!selectedDomain) return [];
    return defects.filter((d) => d.domain === selectedDomain);
  }, [defects, selectedDomain]);


  const handleRunPrediction = useCallback(async () => {
    if (filteredDefects.length === 0) {
      setPredictions([]);
      if(selectedDomain) {
        setError("No defects found for the selected domain to make predictions.");
      }
      return;
    };
    setIsLoading(true);
    setError(null);
    try {
      const result = await predictDefects({ defects: filteredDefects });
      setPredictions(result.predictions);
    } catch (err) {
      console.error(err);
      setError('An error occurred while generating predictions.');
    } finally {
      setIsLoading(false);
    }
  }, [filteredDefects, selectedDomain]);

  const defectsWithPredictions = useMemo(() => {
    return filteredDefects.map((defect) => {
      const prediction = predictions.find((p) => p.id === defect.id);
      return {
        ...defect,
        predictedSeverity: prediction?.predictedSeverity,
        predictedPriority: prediction?.predictedPriority,
        predictionDescription: prediction?.predictionDescription,
        predictedRootCause: prediction?.predictedRootCause,
      };
    });
  }, [filteredDefects, predictions]);

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Defect Predictions</CardTitle>
                <CardDescription>
                    AI-powered predictions for severity and priority. Select a domain to begin.
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
                <Button onClick={handleRunPrediction} disabled={isLoading || !selectedDomain}>
                    <Wand2 className="mr-2 h-4 w-4" />
                    {isLoading ? 'Running Predictions...' : 'Run Predictions'}
                </Button>
            </CardContent>
        </Card>
        
        {error && (
            <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Prediction Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}

        {!selectedDomain && (
             <Alert>
                <Lightbulb className="h-4 w-4" />
                <AlertTitle>Select a Domain</AlertTitle>
                <AlertDescription>
                    Please choose a domain from the dropdown to start predicting defect properties.
                </AlertDescription>
            </Alert>
        )}
        
        {selectedDomain && (
             <Card>
                <CardHeader>
                    <CardTitle>Predictions for '{selectedDomain}'</CardTitle>
                    <CardDescription>The table below shows the actual vs. predicted values for defects in the selected domain.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                        <TableHeader>
                            <TableRow>
                            <TableHead>Summary</TableHead>
                            <TableHead>Reasoning</TableHead>
                            <TableHead>Actual / Predicted Severity</TableHead>
                            <TableHead>Actual / Predicted Priority</TableHead>
                            <TableHead>Predicted Root Cause</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading
                            ? Array.from({ length: Math.min(filteredDefects.length, 3) || 1 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-64" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                </TableRow>
                                ))
                            : defectsWithPredictions.map((defect) => (
                                <TableRow key={defect.id}>
                                    <TableCell className="font-medium max-w-xs truncate">
                                        {defect.summary}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs max-w-md truncate">
                                        {defect.predictionDescription || '...'}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <Badge variant="outline" className="w-fit">{defect.severity || 'N/A'}</Badge>
                                            <Badge variant="secondary" className="w-fit">{defect.predictedSeverity || '...'}</Badge>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                            <div className="flex flex-col gap-1">
                                            <Badge variant="outline" className="w-fit">{defect.priority || 'N/A'}</Badge>
                                            <Badge variant="secondary" className="w-fit">{defect.predictedPriority || '...'}</Badge>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{defect.predictedRootCause || '...'}</Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        </Table>
                    </div>
                    {!isLoading && defectsWithPredictions.length === 0 && !error && (
                        <Alert className="mt-4">
                            <Lightbulb className="h-4 w-4" />
                            <AlertTitle>No Predictions to Display</AlertTitle>
                            <AlertDescription>
                                Click the "Run Predictions" button to see AI-powered defect predictions for the '{selectedDomain}' domain.
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>
        )}
    </div>
  );
}
