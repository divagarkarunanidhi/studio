
'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { FileUploader } from '../ui/file-uploader';
import { Loader2, Upload } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';
import { Button } from '../ui/button';

interface StepResult {
    status: 'passed' | 'failed' | 'skipped';
    duration?: number | { '$numberLong'?: string };
    error_message?: string;
}

interface Step {
    result: StepResult;
    name: string;
    keyword: string;
}

interface Scenario {
    name: string;
    keyword: string;
    steps: Step[];
    tags?: { name: string }[];
}

interface Feature {
    uri: string;
    name: string;
    elements: Scenario[];
    tags?: { name: string }[];
}

interface SeleniumReportFile {
    solution?: string;
    environment?: string;
    Config?: string;
    "Report Path"?: string;
    test_results: Feature[];
}

// This interface now represents the direct structure from MongoDB
interface StoredReportData {
    _id: string;
    fileName: string;
    solution: string;
    environment: string;
    Config: string;
    "Report Path": string;
    test_results: Feature[];
    uploaderId: string;
    uploadedAt: string;
}

interface ReportSummary {
    id: string;
    solution: string;
    totalTests: number;
    passed: number;
    failed: number;
}


const getStepStatus = (step: Step): 'passed' | 'failed' | 'skipped' => {
    return step.result.status;
};

const getScenarioStatus = (scenario: Scenario): 'passed' | 'failed' => {
    // A scenario fails if any of its steps have failed.
    return scenario.steps.some(step => getStepStatus(step) === 'failed') ? 'failed' : 'passed';
}

const processReport = (report: StoredReportData): ReportSummary => {
    const { _id, solution, test_results } = report;
    let totalTests = 0;
    let passed = 0;

    if (test_results) {
        test_results.forEach(feature => {
            if (feature.elements) {
                feature.elements.forEach(scenario => {
                    totalTests++;
                    const scenarioStatus = getScenarioStatus(scenario);
                    if (scenarioStatus === 'passed') {
                        passed++;
                    }
                });
            }
        });
    }

    return {
        id: _id,
        solution: solution || 'N/A',
        totalTests,
        passed,
        failed: totalTests - passed,
    };
};

export function SeleniumDashboardPage() {
    const { toast } = useToast();
    const { user } = useUser();
    const [allReports, setAllReports] = useState<ReportSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showUploader, setShowUploader] = useState(false);

    const handleLoadFromServer = useCallback(async () => {
        setIsLoading(true);
        try {
          const response = await fetch('/api/selenium/all');
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || 'Failed to fetch data from server.');
          }
          const data: StoredReportData[] = await response.json();
          if (data && data.length > 0) {
            const processed = data.map(processReport);
            setAllReports(processed);
            setShowUploader(false);
          } else {
            setAllReports([]);
            setShowUploader(true); 
          }
        } catch (error: any) {
          toast({ variant: 'destructive', title: 'Error Loading Reports', description: error.message });
          setShowUploader(true); 
          console.error(error);
        } finally {
          setIsLoading(false);
        }
      }, [toast]);
      
    useEffect(() => {
        handleLoadFromServer();
    }, [handleLoadFromServer]);

    const handleDataUploaded = useCallback(async (fileContent: string, file: File) => {
        if (!user) {
            toast({
              variant: 'destructive',
              title: 'Authentication Error',
              description: 'You must be logged in to upload a report.',
            });
            return;
        }

        try {
            const uploadedJson = JSON.parse(fileContent);

            if (!uploadedJson || !Array.isArray(uploadedJson.test_results)) {
                 throw new Error("JSON file must be an object containing a 'test_results' array.");
            }

            const response = await fetch('/api/selenium/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fileData: uploadedJson, // Send the whole object
                  uploaderId: user.uid,
                  fileName: file.name,
                }),
            });
      
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save the report to the server.');
            }
            
            toast({
                title: "Report Uploaded",
                description: `Successfully processed and saved ${file.name}. Refreshing data...`
            });
            handleLoadFromServer();
            
        } catch (error: any) {
            console.error("Error processing JSON report:", error);
            toast({
                variant: 'destructive',
                title: 'Error Loading Report',
                description: error.message || 'Could not parse the JSON file. Please ensure it is a valid Selenium report.',
            });
        }
    }, [toast, user, handleLoadFromServer]);
    
    if (isLoading) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <p>Loading Selenium Reports...</p>
                </div>
            </div>
        );
    }

    if (showUploader) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center p-4">
                <div className="flex w-full max-w-lg flex-col items-center justify-center gap-4 text-center">
                    <Card className="w-full">
                        <CardHeader>
                            <CardTitle>Upload Selenium Report</CardTitle>
                            <CardDescription>To get started, please upload a Cucumber JSON report file.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <FileUploader onDataUploaded={handleDataUploaded} accept=".json" templatePath="" />
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
             <div className='flex justify-between items-center'>
                <h2 className="text-2xl font-bold">Selenium Executions</h2>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="outline">
                            <Upload className="mr-2 h-4 w-4" />
                            Upload New Report
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Upload a new Selenium report?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will take you to the uploader. After uploading, the new report will appear in this list.
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => setShowUploader(true)}>Continue</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="w-full overflow-hidden rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Solution</TableHead>
                                    <TableHead>Total Test Cases</TableHead>
                                    <TableHead>Passed</TableHead>
                                    <TableHead>Failed</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {allReports.map(summary => (
                                    <TableRow key={summary.id}>
                                        <TableCell>{summary.solution}</TableCell>
                                        <TableCell>{summary.totalTests}</TableCell>
                                        <TableCell className='text-green-600'>{summary.passed}</TableCell>
                                        <TableCell className={cn(summary.failed > 0 ? 'text-destructive' : 'text-muted-foreground')}>{summary.failed}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                     {allReports.length === 0 && (
                        <Alert className="mt-4">
                            <AlertTitle>No Reports Found</AlertTitle>
                            <AlertDescription>
                                There are no Selenium reports stored in the database. Use the button above to upload one.
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>

        </div>
    );
}
