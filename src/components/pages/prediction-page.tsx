
'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Defect, DefectPrediction, AppConfiguration, SavedPrediction } from '@/lib/types';
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
import { Lightbulb, AlertTriangle, Wand2, Bookmark, BookmarkCheck } from 'lucide-react';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth, useFirestore, useUser } from '@/firebase';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';

interface PredictionPageProps {
    defects: Defect[];
    uniqueDomains: string[];
}


export function PredictionPage({ defects, uniqueDomains }: PredictionPageProps) {
  const [predictions, setPredictions] = useState<DefectPrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [jiraLink, setJiraLink] = useState<string>("");
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [savedPredictionIds, setSavedPredictionIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchConfig = async () => {
        if (!firestore) return;
        const configRef = doc(firestore, 'appConfiguration', 'global');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
            const configData = configSnap.data() as AppConfiguration;
            setJiraLink(configData.jiraLink);
        }
    };
    fetchConfig();
  }, [firestore]);

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
    if (!user) {
        setError("You must be logged in to run predictions.");
        return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await predictDefects({ defects: filteredDefects, userId: user.uid });
      setPredictions(result.predictions);
    } catch (err) {
      console.error(err);
      setError('An error occurred while generating predictions.');
    } finally {
      setIsLoading(false);
    }
  }, [filteredDefects, selectedDomain, user]);

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

  const handleSavePrediction = (defect: Defect, prediction: Omit<DefectPrediction, 'id'>) => {
    if (!user || !firestore) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'You must be logged in to save predictions.'
        });
        return;
    }

    const savedPrediction: Omit<SavedPrediction, 'savedAt'> = {
        defect: defect,
        prediction: {
            predictedSeverity: prediction.predictedSeverity!,
            predictedPriority: prediction.predictedPriority!,
            predictionDescription: prediction.predictionDescription!,
            predictedRootCause: prediction.predictedRootCause!,
        }
    };

    const collectionRef = collection(firestore, `users/${user.uid}/savedPredictions`);
    
    addDocumentNonBlocking(collectionRef, {
        ...savedPrediction,
        savedAt: new Date().toISOString(),
    });

    setSavedPredictionIds(prev => new Set(prev).add(defect.id));

    toast({
        title: 'Prediction Saved!',
        description: 'This example will be used to improve future predictions.'
    });
  };

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Defect Predictions</CardTitle>
                <CardDescription>
                    AI-powered predictions for severity and priority. Your feedback by saving accurate predictions helps improve the model over time.
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
                    <CardDescription>The table below shows the actual vs. predicted values for defects in the selected domain. Click the bookmark icon to save a high-quality prediction as an example for future runs.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                        <TableHeader>
                            <TableRow>
                            <TableHead className='w-[40px]'></TableHead>
                            <TableHead>Defect ID</TableHead>
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
                                    <TableCell><Skeleton className="h-6 w-6" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-64" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                </TableRow>
                                ))
                            : defectsWithPredictions.map((defect) => {
                                const hasPrediction = defect.predictedSeverity && defect.predictedPriority;
                                const isSaved = savedPredictionIds.has(defect.id);
                                return (
                                    <TableRow key={defect.id}>
                                         <TableCell>
                                            {hasPrediction && (
                                                 <Button
                                                 variant="ghost"
                                                 size="icon"
                                                 onClick={() => handleSavePrediction(defect, defect)}
                                                 disabled={isSaved}
                                                 aria-label="Save prediction"
                                             >
                                                 {isSaved ? (
                                                     <BookmarkCheck className="h-5 w-5 text-primary" />
                                                 ) : (
                                                     <Bookmark className="h-5 w-5 text-muted-foreground" />
                                                 )}
                                             </Button>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            <a
                                                href={`${jiraLink}/${defect.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-primary hover:underline"
                                            >
                                                {defect.id}
                                            </a>
                                        </TableCell>
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
                                )
                            })}
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
