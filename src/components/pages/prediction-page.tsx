
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
import { Input } from '@/components/ui/input';
import { Lightbulb, AlertTriangle, Wand2, Bookmark, BookmarkCheck, HelpCircle } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Textarea } from '../ui/textarea';

interface PredictionPageProps {
    defects: Defect[];
    uniqueDomains: string[];
}

const SEVERITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low'];
const PRIORITY_OPTIONS = ['Highest', 'High', 'Medium', 'Low'];

export function PredictionPage({ defects, uniqueDomains }: PredictionPageProps) {
  const [predictions, setPredictions] = useState<DefectPrediction[]>([]);
  const [editablePredictions, setEditablePredictions] = useState<Record<string, DefectPrediction>>({});
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
      setEditablePredictions({});
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
      
      const editableMap = result.predictions.reduce((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {} as Record<string, DefectPrediction>);
      setEditablePredictions(editableMap);

    } catch (err) {
      console.error(err);
      setError('An error occurred while generating predictions.');
    } finally {
      setIsLoading(false);
    }
  }, [filteredDefects, selectedDomain, user]);

  const handlePredictionChange = (defectId: string, field: keyof Omit<DefectPrediction, 'id'>, value: string) => {
    setEditablePredictions(prev => ({
        ...prev,
        [defectId]: {
            ...prev[defectId],
            [field]: value
        }
    }));
  };

  const defectsWithPredictions = useMemo(() => {
    return filteredDefects.map((defect) => {
      const originalPrediction = predictions.find((p) => p.id === defect.id);
      const editablePrediction = editablePredictions[defect.id];
      return {
        ...defect,
        predictedSeverity: editablePrediction?.predictedSeverity ?? originalPrediction?.predictedSeverity,
        predictedPriority: editablePrediction?.predictedPriority ?? originalPrediction?.predictedPriority,
        predictedRootCause: editablePrediction?.predictedRootCause ?? originalPrediction?.predictedRootCause,
        predictedFunctionalArea: editablePrediction?.predictedFunctionalArea ?? originalPrediction?.predictedFunctionalArea,
        predictedDefectSuggestions: editablePrediction?.predictedDefectSuggestions ?? originalPrediction?.predictedDefectSuggestions,
        predictedDefectSource: editablePrediction?.predictedDefectSource ?? originalPrediction?.predictedDefectSource,
      };
    });
  }, [filteredDefects, predictions, editablePredictions]);

  const handleSavePrediction = (defect: Defect, editedPrediction: DefectPrediction) => {
    if (!user || !firestore) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'You must be logged in to save predictions.'
        });
        return;
    }

    const finalPrediction: Omit<DefectPrediction, 'id'> = {
        predictedSeverity: editedPrediction.predictedSeverity,
        predictedPriority: editedPrediction.predictedPriority,
        predictedRootCause: editedPrediction.predictedRootCause,
        predictedFunctionalArea: editedPrediction.predictedFunctionalArea,
        predictedDefectSuggestions: editedPrediction.predictedDefectSuggestions,
        predictedDefectSource: editedPrediction.predictedDefectSource,
    };

    const savedPrediction: Omit<SavedPrediction, 'savedAt'> = {
        defect: defect,
        prediction: finalPrediction
    };

    const collectionRef = collection(firestore, `users/${user.uid}/savedPredictions`);
    
    addDocumentNonBlocking(collectionRef, {
        ...savedPrediction,
        savedAt: new Date().toISOString(),
    });

    setSavedPredictionIds(prev => new Set(prev).add(defect.id));

    toast({
        title: 'Feedback Saved!',
        description: 'This corrected example will improve future predictions.'
    });
  };

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Defect Predictions</CardTitle>
                <CardDescription>
                    AI-powered predictions for severity and priority. Correct any inaccurate predictions and save them as feedback to improve the model over time.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
                <Select value={selectedDomain} onValueChange={(value) => {
                    setSelectedDomain(value);
                    setPredictions([]);
                    setEditablePredictions({});
                    setError(null);
                }}>
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
                    <CardDescription>The table below shows the actual vs. predicted values. Edit the predictions to be more accurate and click the bookmark icon to save your feedback.</CardDescription>
                </CardHeader>
                <CardContent>
                    <TooltipProvider>
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                        <TableHeader>
                            <TableRow>
                            <TableHead className='w-[50px]'></TableHead>
                            <TableHead>
                                <div className="flex items-center gap-1">
                                    <span>Defect ID / Summary</span>
                                    <Tooltip>
                                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
                                        <TooltipContent><p>The unique identifier and summary of the defect.</p></TooltipContent>
                                    </Tooltip>
                                </div>
                            </TableHead>
                             <TableHead>
                                <div className="flex items-center gap-1">
                                    <span>Severity (Actual/Predicted)</span>
                                    <Tooltip>
                                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
                                        <TooltipContent><p>Actual vs. AI-predicted severity. You can edit the prediction.</p></TooltipContent>
                                    </Tooltip>
                                </div>
                            </TableHead>
                            <TableHead>
                                <div className="flex items-center gap-1">
                                    <span>Priority (Actual/Predicted)</span>
                                    <Tooltip>
                                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
                                        <TooltipContent><p>Actual vs. AI-predicted priority. You can edit the prediction.</p></TooltipContent>
                                    </Tooltip>
                                </div>
                            </TableHead>
                            <TableHead>
                                <div className="flex items-center gap-1">
                                    <span>Root Cause</span>
                                    <Tooltip>
                                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
                                        <TooltipContent><p>The AI's predicted root cause for the defect. This is editable.</p></TooltipContent>
                                    </Tooltip>
                                </div>
                            </TableHead>
                            <TableHead>
                                <div className="flex items-center gap-1">
                                    <span>Functional Area</span>
                                    <Tooltip>
                                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
                                        <TooltipContent><p>The AI's predicted functional area. This is editable.</p></TooltipContent>
                                    </Tooltip>
                                </div>
                            </TableHead>
                            <TableHead>
                                <div className="flex items-center gap-1">
                                    <span>Suggestion for Reduction</span>
                                    <Tooltip>
                                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
                                        <TooltipContent><p>The AI's suggestion to prevent similar defects. This is editable.</p></TooltipContent>
                                    </Tooltip>
                                </div>
                            </TableHead>
                            <TableHead>
                                <div className="flex items-center gap-1">
                                    <span>Source of Defect</span>
                                    <Tooltip>
                                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
                                        <TooltipContent><p>The AI's predicted origin of the defect. This is editable.</p></TooltipContent>
                                    </Tooltip>
                                </div>
                            </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading
                            ? Array.from({ length: Math.min(filteredDefects.length, 3) || 1 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-28" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-28" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-full" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-full" /></TableCell>
                                </TableRow>
                                ))
                            : defectsWithPredictions.map((defect) => {
                                const currentPrediction = editablePredictions[defect.id];
                                const hasPrediction = !!currentPrediction;
                                const isSaved = savedPredictionIds.has(defect.id);
                                return (
                                    <TableRow key={defect.id} className="align-top">
                                         <TableCell className='pt-3.5'>
                                            {hasPrediction && (
                                                 <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleSavePrediction(defect, currentPrediction)}
                                                            disabled={isSaved}
                                                            aria-label="Save prediction as feedback"
                                                            className='h-8 w-8'
                                                        >
                                                            {isSaved ? (
                                                                <BookmarkCheck className="h-5 w-5 text-primary" />
                                                            ) : (
                                                                <Bookmark className="h-5 w-5 text-muted-foreground" />
                                                            )}
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>{isSaved ? 'Feedback saved!' : 'Save corrected prediction as feedback'}</p>
                                                    </TooltipContent>
                                                 </Tooltip>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-medium max-w-xs">
                                            <a
                                                href={`${jiraLink}/${defect.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-primary hover:underline"
                                            >
                                                {defect.id}
                                            </a>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <p className='text-muted-foreground text-xs mt-1 truncate'>{defect.summary}</p>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-md">
                                                    <p>{defect.summary}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <Badge variant="outline" className="w-fit mb-1">{defect.severity || 'N/A'}</Badge>
                                                {hasPrediction ? (
                                                    <Select
                                                        value={currentPrediction.predictedSeverity}
                                                        onValueChange={(value) => handlePredictionChange(defect.id, 'predictedSeverity', value)}
                                                    >
                                                        <SelectTrigger className="h-8 w-[120px] text-xs">
                                                            <SelectValue placeholder="Severity" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {SEVERITY_OPTIONS.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                ) : <Badge variant="secondary" className="w-fit">...</Badge>}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <Badge variant="outline" className="w-fit mb-1">{defect.priority || 'N/A'}</Badge>
                                                {hasPrediction ? (
                                                    <Select
                                                        value={currentPrediction.predictedPriority}
                                                        onValueChange={(value) => handlePredictionChange(defect.id, 'predictedPriority', value)}
                                                    >
                                                        <SelectTrigger className="h-8 w-[120px] text-xs">
                                                            <SelectValue placeholder="Priority" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {PRIORITY_OPTIONS.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                ) : <Badge variant="secondary" className="w-fit">...</Badge>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="w-[200px]">
                                            {hasPrediction ? (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Input
                                                            value={currentPrediction.predictedRootCause}
                                                            onChange={(e) => handlePredictionChange(defect.id, 'predictedRootCause', e.target.value)}
                                                            className="h-8 text-xs"
                                                        />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>{currentPrediction.predictedRootCause}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            ) : '...'}
                                        </TableCell>
                                        <TableCell className="w-[200px]">
                                            {hasPrediction ? (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Input
                                                            value={currentPrediction.predictedFunctionalArea}
                                                            onChange={(e) => handlePredictionChange(defect.id, 'predictedFunctionalArea', e.target.value)}
                                                            className="h-8 text-xs"
                                                        />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>{currentPrediction.predictedFunctionalArea}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            ) : '...'}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs max-w-md w-[300px]">
                                            {hasPrediction ? (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Textarea
                                                            value={currentPrediction.predictedDefectSuggestions}
                                                            onChange={(e) => handlePredictionChange(defect.id, 'predictedDefectSuggestions', e.target.value)}
                                                            className="h-20 text-xs"
                                                        />
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-md">
                                                        <p className="whitespace-pre-wrap">{currentPrediction.predictedDefectSuggestions}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            ) : '...'}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs max-w-md w-[300px]">
                                            {hasPrediction ? (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Textarea
                                                            value={currentPrediction.predictedDefectSource}
                                                            onChange={(e) => handlePredictionChange(defect.id, 'predictedDefectSource', e.target.value)}
                                                            className="h-20 text-xs"
                                                        />
                                                    </TooltipTrigger>
                                                     <TooltipContent className="max-w-md">
                                                        <p className="whitespace-pre-wrap">{currentPrediction.predictedDefectSource}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            ) : '...'}
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                        </Table>
                    </div>
                    </TooltipProvider>
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

    

    