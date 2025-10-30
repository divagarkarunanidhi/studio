"use client";

import { useState, useEffect } from 'react';
import { bulkPredictDefects, type BulkPredictDefectOutput } from '@/ai/flows/defect-prediction-flow';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Zap, Loader } from 'lucide-react';
import type { Defect } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '../ui/progress';

interface PredictionPageProps {
  defects: Defect[];
}

export function PredictionPage({ defects }: PredictionPageProps) {
  const [predictions, setPredictions] = useState<BulkPredictDefectOutput>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    async function getPredictions() {
      if (defects.length === 0) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      setPredictions([]);

      try {
        const defectDataForApi = defects.map(d => ({
            summary: d.summary,
            description: d.description || ''
        }));
        const results = await bulkPredictDefects(defectDataForApi);
        setPredictions(results);
      } catch (error) {
        console.error('Bulk prediction failed:', error);
        toast({
          variant: 'destructive',
          title: 'Prediction Failed',
          description: 'The AI model could not make predictions. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    }

    getPredictions();
  }, [defects, toast]);


  return (
    <Card>
      <CardHeader>
        <CardTitle>AI-Powered Defect Predictions</CardTitle>
        <CardDescription>
          The AI has analyzed all uploaded defects to predict their severity, priority, and domain.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center p-8">
            <Loader className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4 text-muted-foreground">AI is analyzing {defects.length} defects...</p>
          </div>
        )}
        {!isLoading && predictions.length > 0 && (
          <div className="w-full overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Summary</TableHead>
                  <TableHead>Predicted Severity</TableHead>
                  <TableHead>Predicted Priority</TableHead>
                  <TableHead>Suggested Domain</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {predictions.map((p, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium max-w-xs truncate">{p.summary}</TableCell>
                    <TableCell><Badge variant="destructive">{p.predicted_severity}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{p.predicted_priority}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{p.suggested_domain}</Badge></TableCell>
                    <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                           <Progress value={p.confidence_score * 100} className="w-20"/>
                           <span>{(p.confidence_score * 100).toFixed(0)}%</span>
                        </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {!isLoading && predictions.length === 0 && defects.length > 0 && (
           <div className="flex flex-col items-center justify-center p-8 text-center">
             <Zap className="h-10 w-10 text-muted-foreground/50 mb-4" />
             <p className="text-muted-foreground">Could not generate AI predictions.</p>
           </div>
        )}
      </CardContent>
    </Card>
  );
}
