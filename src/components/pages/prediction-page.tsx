'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Defect, DefectPrediction, AppConfiguration, SavedPrediction } from '@/lib/types';
import { predictDefects } from '@/ai/flows/defect-prediction-flow';
import { refineSuggestion } from '@/ai/flows/refine-suggestion-flow';
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
import { Lightbulb, AlertTriangle, Wand2, Bookmark, BookmarkCheck, HelpCircle, Check, Loader2 } from 'lucide-react';
import { doc, collection } from '@/firebase/firestore-shim';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError, useDoc, useMemoFirebase } from '@/firebase';
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
const PRIORITY_OPTIONS = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];

export function PredictionPage({ defects, uniqueDomains }: PredictionPageProps) {
  const [predictions, setPredictions] = useState<DefectPrediction[]>([]);
  const [editablePredictions, setEditablePredictions] = useState<Record<string, DefectPrediction>>({});
  const [userSuggestions, setUserSuggestions] = useState<Record<string, string>>({});
  const [refiningIds, setRefiningIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [savedPredictionIds, setSavedPredictionIds] = useState<Set<string>>(new Set());

  const configRef = useMemoFirebase(() => (firestore ? doc(firestore, 'appConfiguration', 'global') : null), [firestore]);
  const { data: configData } = useDoc<AppConfiguration>(configRef);

  const jiraLink = configData?.jiraLink || "";

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

    } catch (err: any) {
      if (err.message?.includes('permission-denied') || err.message?.includes('insufficient permissions')) {
        const contextualError = new FirestorePermissionError({
            operation: 'list',
            path: 'sharedFeedback',
        });
        errorEmitter.emit('permission-error', contextualError);
        setError('A permission error occurred while fetching prediction examples.');
      } else {
        console.error(err);
        setError('An error occurred while generating predictions.');
      }
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

  const handleUserSuggestionChange = (defectId: string, value: string) => {
    setUserSuggestions(prev => ({ ...prev, [defectId]: value }));
  };

  const handleRefineAndSave = async (defect: Defect) => {
    const rawSuggestion = userSuggestions[defect.id];
    if (!rawSuggestion || rawSuggestion.trim().length < 5) {
        toast({ variant: 'destructive', title: 'Suggestion too short', description: 'Please provide a more descriptive suggestion before submitting.' });
        return;
    }

    if (!user || !firestore) return;

    setRefiningIds(prev => new Set(prev).add(defect.id));
    try {
        const refined = await refineSuggestion({
            defectSummary: defect.summary,
            userSuggestion: rawSuggestion
        });

        // Display the refined suggestion back in the textarea for the user
        setUserSuggestions(prev => ({ ...prev, [defect.id]: refined }));

        const currentPrediction = editablePredictions[defect.id] || predictions.find(p => p.id === defect.id);
        
        const finalPrediction: Omit<DefectPrediction, 'id'> = {
            predictedSeverity: currentPrediction?.predictedSeverity || 'Medium',
            predictedPriority: currentPrediction?.predictedPriority || 'Medium',
            predictedRootCause: currentPrediction?.predictedRootCause || 'Unknown',
            predictedFunctionalArea: currentPrediction?.predictedFunctionalArea || 'General',
            predictedDefectSuggestions: refined, // Use refined feedback as the suggestion
        };

        const savedData: Omit<SavedPrediction, 'savedAt'> = {
            defect: defect,
            prediction: finalPrediction
        };

        const collectionRef = collection(firestore, 'sharedFeedback');
        addDocumentNonBlocking(collectionRef, {
            ...savedData,
            savedAt: new Date().toISOString(),
        });

        setSavedPredictionIds(prev => new Set(prev).add(defect.id));
        toast({ title: 'Success!', description: 'Refined feedback has been saved and will be used for future predictions.' });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Refinement failed', description: 'The AI could not refine your suggestion at this time.' });
    } finally {
        setRefiningIds(prev => {
            const next = new Set(prev);
            next.delete(defect.id);
            return next;
        });
    }
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
    };

    const savedPrediction: Omit<SavedPrediction, 'savedAt'> = {
        defect: defect,
        prediction: finalPrediction
    };

    const collectionRef = collection(firestore, 'sharedFeedback');
    
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
                    AI-powered predictions for severity and priority. Correct any inaccurate predictions or provide your own suggestions. User suggestions are automatically refined by AI and used to improve future models.
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
                    <CardDescription>Review AI predictions or provide your own expert suggestions below.</CardDescription>
                </CardHeader>
                <CardContent>
                    <TooltipProvider>
                    <div className="overflow-x-auto rounded-md border">
                        <Table>
                        <TableHeader>
                            <TableRow>
                            <TableHead className='w-[50px]'></TableHead>
                            <TableHead>Defect ID / Summary</TableHead>
                             <TableHead>Severity</TableHead>
                            <TableHead>Priority</TableHead>
                            <TableHead>AI Root Cause</TableHead>
                            <TableHead>AI Suggestion</TableHead>
                            <TableHead className="w-[300px]">Your Suggestion (Refine & Save)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading
                            ? Array.from({ length: 3 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-3/4 mb-2" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-28" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-28" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-full" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-full" /></TableCell>
                                </TableRow>
                                ))
                            : defectsWithPredictions.map((defect) => {
                                const currentPrediction = editablePredictions[defect.id];
                                const hasPrediction = !!currentPrediction;
                                const isSaved = savedPredictionIds.has(defect.id);
                                const isRefining = refiningIds.has(defect.id);

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
                                            <a href={`${jiraLink}/browse/${defect.id}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                                {defect.id}
                                            </a>
                                            <p className='text-muted-foreground text-[10px] mt-1 truncate'>{defect.summary}</p>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <Badge variant="outline" className="text-[10px] px-1 py-0">{defect.severity || 'N/A'}</Badge>
                                                {hasPrediction && (
                                                    <Select
                                                        value={currentPrediction.predictedSeverity}
                                                        onValueChange={(value) => handlePredictionChange(defect.id, 'predictedSeverity', value)}
                                                    >
                                                        <SelectTrigger className="h-7 w-[100px] text-[10px]">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {SEVERITY_OPTIONS.map(opt => <SelectItem key={opt} value={opt} className="text-[10px]">{opt}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <Badge variant="outline" className="text-[10px] px-1 py-0">{defect.priority || 'N/A'}</Badge>
                                                {hasPrediction && (
                                                    <Select
                                                        value={currentPrediction.predictedPriority}
                                                        onValueChange={(value) => handlePredictionChange(defect.id, 'predictedPriority', value)}
                                                    >
                                                        <SelectTrigger className="h-7 w-[100px] text-[10px]">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {PRIORITY_OPTIONS.map(opt => <SelectItem key={opt} value={opt} className="text-[10px]">{opt}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="w-[120px]">
                                            {hasPrediction ? (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Input
                                                            value={currentPrediction.predictedRootCause}
                                                            onChange={(e) => handlePredictionChange(defect.id, 'predictedRootCause', e.target.value)}
                                                            className="h-7 text-[10px]"
                                                        />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>{currentPrediction.predictedRootCause}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            ) : '...'}
                                        </TableCell>
                                        <TableCell className="text-[10px] text-muted-foreground max-w-[200px]">
                                            {hasPrediction ? (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <p className="truncate line-clamp-2">{currentPrediction.predictedDefectSuggestions}</p>
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-md">
                                                        <p>{currentPrediction.predictedDefectSuggestions}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            ) : '...'}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-start gap-2">
                                                <Textarea 
                                                    placeholder="Enter your suggestion..."
                                                    className="min-h-[60px] text-[10px] resize-none"
                                                    value={userSuggestions[defect.id] || ''}
                                                    onChange={(e) => handleUserSuggestionChange(defect.id, e.target.value)}
                                                    disabled={isSaved || isRefining}
                                                />
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button 
                                                            size="icon" 
                                                            variant="secondary" 
                                                            className="h-8 w-8 shrink-0"
                                                            onClick={() => handleRefineAndSave(defect)}
                                                            disabled={isSaved || isRefining || !userSuggestions[defect.id]}
                                                        >
                                                            {isRefining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Refine with AI and Save as Feedback</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                        </Table>
                    </div>
                    </TooltipProvider>
                </CardContent>
            </Card>
        )}
    </div>
  );
}
