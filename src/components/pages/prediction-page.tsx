'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Lightbulb, AlertTriangle, Info } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from "@/components/ui/tooltip"
import { Chatbot } from '../dashboard/chatbot';

export function PredictionPage({ defects }: { defects: Defect[] }) {
  const [predictions, setPredictions] = useState<DefectPrediction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleRunPrediction = useCallback(async () => {
    if (defects.length === 0) {
      setIsLoading(false);
      return;
    };
    setIsLoading(true);
    setError(null);
    try {
      const result = await predictDefects({ defects });
      setPredictions(result.predictions);
    } catch (err) {
      console.error(err);
      setError('An error occurred while generating predictions.');
    } finally {
      setIsLoading(false);
    }
  }, [defects]);

  useEffect(() => {
    handleRunPrediction();
  }, [handleRunPrediction]);

  const defectsWithPredictions = useMemo(() => {
    return defects.map((defect) => {
      const prediction = predictions.find((p) => p.id === defect.id);
      return {
        ...defect,
        predictedSeverity: prediction?.predictedSeverity,
        predictedPriority: prediction?.predictedPriority,
        predictionDescription: prediction?.predictionDescription,
        predictedRootCause: prediction?.predictedRootCause,
      };
    });
  }, [defects, predictions]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
            <Card>
                <CardHeader>
                <CardTitle>Defect Predictions</CardTitle>
                <CardDescription>
                    AI-powered predictions for severity and priority of each defect.
                </CardDescription>
                </CardHeader>
                <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Prediction Failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                {!isLoading && defects.length > 0 && (
                    <Button onClick={handleRunPrediction} disabled={isLoading} className="mb-4">
                        {isLoading ? 'Reloading...' : 'Reload Predictions'}
                    </Button>
                )}
                <div className="overflow-x-auto rounded-md border">
                    <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead>Summary</TableHead>
                        <TableHead>Actual / Predicted Severity</TableHead>
                        <TableHead>Actual / Predicted Priority</TableHead>
                        <TableHead>Predicted Root Cause</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading
                        ? Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            </TableRow>
                            ))
                        : defectsWithPredictions.map((defect) => (
                            <TableRow key={defect.id}>
                                <TableCell className="font-medium max-w-sm truncate">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="cursor-help underline decoration-dashed">{defect.summary}</span>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs">{defect.predictionDescription || 'No description available'}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
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
                {!isLoading && defectsWithPredictions.length === 0 && (
                    <Alert>
                        <Lightbulb className="h-4 w-4" />
                        <AlertTitle>No Defects to Predict</AlertTitle>
                        <AlertDescription>
                            Upload a CSV file to see AI-powered defect predictions.
                        </AlertDescription>
                    </Alert>
                )}
                </CardContent>
            </Card>
        </div>
        <div className="lg:col-span-1">
            <Chatbot defects={defects} predictions={predictions} />
        </div>
    </div>
  );
}
