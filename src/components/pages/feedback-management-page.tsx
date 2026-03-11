'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth, useFirestore, useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import type { WithId } from '@/firebase/firestore/use-collection';
import type { SavedPrediction, AppConfiguration, DefectPrediction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Bookmark, Trash2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from "@/components/ui/alert-dialog";
import { deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';


const SEVERITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low'];
const PRIORITY_OPTIONS = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];

function FeedbackRow({ feedback, jiraLink }: { feedback: WithId<SavedPrediction>, jiraLink: string }) {
    const { toast } = useToast();
    const firestore = useFirestore();
    const [editablePrediction, setEditablePrediction] = useState(feedback.prediction);
    const [isModified, setIsModified] = useState(false);

    useEffect(() => {
        setEditablePrediction(feedback.prediction);
        setIsModified(false);
    }, [feedback]);

    const handlePredictionChange = (field: keyof Omit<DefectPrediction, 'id'>, value: string) => {
        setEditablePrediction(prev => ({
            ...prev,
            [field]: value
        }));
        setIsModified(true);
    };

    const handleUpdate = () => {
        if (!firestore) return;
        const docRef = doc(firestore, 'sharedFeedback', feedback.id);
        
        updateDocumentNonBlocking(docRef, { prediction: editablePrediction });

        toast({
            title: "Feedback Updated",
            description: "The saved example has been successfully updated."
        });
        setIsModified(false);
    };

    const handleDelete = () => {
        if (!firestore) return;
        const docRef = doc(firestore, 'sharedFeedback', feedback.id);
        deleteDocumentNonBlocking(docRef);
        toast({
            title: "Feedback Deleted",
            description: "The saved example has been removed."
        });
    };

    return (
        <TableRow className="align-top">
            <TableCell className="font-medium max-w-xs">
                <a
                    href={`${jiraLink}/browse/${feedback.defect.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                >
                    {feedback.defect.id}
                </a>
                <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <p className='text-muted-foreground text-xs mt-1 truncate'>{feedback.defect.summary}</p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                        <p>{feedback.defect.summary}</p>
                    </TooltipContent>
                </Tooltip>
                </TooltipProvider>
            </TableCell>
            <TableCell>
                <Select
                    value={editablePrediction.predictedSeverity}
                    onValueChange={(value) => handlePredictionChange('predictedSeverity', value)}
                >
                    <SelectTrigger className="h-8 w-[120px] text-xs">
                        <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent>
                        {SEVERITY_OPTIONS.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                    </SelectContent>
                </Select>
            </TableCell>
            <TableCell>
                <Select
                    value={editablePrediction.predictedPriority}
                    onValueChange={(value) => handlePredictionChange('predictedPriority', value)}
                >
                    <SelectTrigger className="h-8 w-[120px] text-xs">
                        <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                        {PRIORITY_OPTIONS.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                    </SelectContent>
                </Select>
            </TableCell>
            <TableCell className="w-[200px]">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Input
                                value={editablePrediction.predictedRootCause}
                                onChange={(e) => handlePredictionChange('predictedRootCause', e.target.value)}
                                className="h-8 text-xs"
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{editablePrediction.predictedRootCause}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </TableCell>
            <TableCell className="w-[200px]">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Input
                                value={editablePrediction.predictedFunctionalArea}
                                onChange={(e) => handlePredictionChange('predictedFunctionalArea', e.target.value)}
                                className="h-8 text-xs"
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{editablePrediction.predictedFunctionalArea}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </TableCell>
            <TableCell className="text-muted-foreground text-xs max-w-md w-[300px]">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Textarea
                                value={editablePrediction.predictedDefectSuggestions}
                                onChange={(e) => handlePredictionChange('predictedDefectSuggestions', e.target.value)}
                                className="h-20 text-xs"
                            />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">
                            <p className="whitespace-pre-wrap">{editablePrediction.predictedDefectSuggestions}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </TableCell>
            <TableCell className="text-right space-x-2">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={handleUpdate} disabled={!isModified}>
                                <Save className="h-5 w-5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Update Feedback</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                         <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-5 w-5" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the saved feedback example.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete} className='bg-destructive hover:bg-destructive/90'>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </TableCell>
        </TableRow>
    );
}


export function FeedbackManagementPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const configRef = useMemoFirebase(() => (firestore ? doc(firestore, 'appConfiguration', 'global') : null), [firestore]);
    const { data: configData } = useDoc<AppConfiguration>(configRef);

    const jiraLink = configData?.jiraLink || "";

    const feedbackColRef = useMemoFirebase(
        () => (user ? collection(firestore, 'sharedFeedback') : null),
        [firestore, user]
    );
    const { data: feedbackData, isLoading: isFeedbackLoading, error } = useCollection<SavedPrediction>(feedbackColRef);

    const isLoading = isUserLoading || isFeedbackLoading;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Feedback Management</CardTitle>
                <CardDescription>
                    Review, modify, or delete the saved feedback examples used for few-shot prompting. Changes made here will affect future AI predictions and analysis.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive">
                        <Bookmark className="h-4 w-4" />
                        <AlertTitle>Failed to load feedback</AlertTitle>
                        <AlertDescription>{error.message}</AlertDescription>
                    </Alert>
                )}

                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Defect</TableHead>
                                <TableHead>Severity</TableHead>
                                <TableHead>Priority</TableHead>
                                <TableHead>Root Cause</TableHead>
                                <TableHead>Functional Area</TableHead>
                                <TableHead>Suggestion</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                        <TableCell><Skeleton className="h-8 w-28" /></TableCell>
                                        <TableCell><Skeleton className="h-8 w-28" /></TableCell>
                                        <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                                        <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                                        <TableCell><Skeleton className="h-20 w-full" /></TableCell>
                                        <TableCell className="text-right"><Skeleton className="h-8 w-20" /></TableCell>
                                    </TableRow>
                                ))
                            ) : feedbackData && feedbackData.length > 0 ? (
                                feedbackData.map(feedbackItem => (
                                   <FeedbackRow key={feedbackItem.id} feedback={feedbackItem} jiraLink={jiraLink} />
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        No saved feedback found. Use the bookmark icon on the Prediction page to save examples.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
