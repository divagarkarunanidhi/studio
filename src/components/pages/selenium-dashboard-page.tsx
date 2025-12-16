
'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { FileUploader } from '../ui/file-uploader';
import { ClipboardCheck, FileJson, CheckCircle2, XCircle, Percent, Loader2, Upload, ExternalLink } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '../ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';


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
    keyword: string;
    elements: Scenario[];
}

// This represents the entire file structure from MongoDB
interface SeleniumReportFile {
    solution: string;
    environment: string;
    Config: string;
    "Report Path": string;
    test_results: Feature[];
}

// This represents the data we store on the server
interface StoredReportData {
    fileName: string;
    fileData: SeleniumReportFile;
    uploaderId: string;
    uploadedAt: string;
}

interface ReportSummary {
    domain: string;
    environment: string;
    executionEnv: string;
    totalTests: number;
    passed: number;
    failed: number;
    tags: string[];
    reportPath: string;
}

const getStepStatus = (step: Step): 'passed' | 'failed' | 'skipped' => {
    return step.result.status;
};

const getScenarioStatus = (scenario: Scenario): 'passed' | 'failed' => {
    return scenario.steps.every(step => getStepStatus(step) === 'passed') ? 'passed' : 'failed';
}

export function SeleniumDashboardPage() {
    const { toast } = useToast();
    const { user } = useUser();
    const [reportData, setReportData] = useState<SeleniumReportFile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showUploader, setShowUploader] = useState(false);

    const handleLoadFromServer = useCallback(async () => {
        setIsLoading(true);
        try {
          const response = await fetch('/api/selenium/latest');
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || 'Failed to fetch data from server.');
          }
          const data: StoredReportData | null = await response.json();
          if (data && data.fileData) {
            setReportData(data.fileData);
            setShowUploader(false);
          } else {
            setReportData(null);
            setShowUploader(true); 
          }
        } catch (error: any) {
          toast({ variant: 'destructive', title: 'Error Loading Report', description: error.message });
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
            const jsonData: SeleniumReportFile = JSON.parse(fileContent);

             // Validate the structure
             if (typeof jsonData !== 'object' || jsonData === null || !Array.isArray(jsonData.test_results)) {
                throw new Error("Uploaded file is not a valid JSON object with a 'test_results' array.");
            }

            const response = await fetch('/api/selenium/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fileData: jsonData,
                  uploaderId: user.uid,
                  fileName: file.name,
                }),
              });
      
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save the report to the server.');
            }
            
            setReportData(jsonData);
            setShowUploader(false);
            
            toast({
                title: "Report Uploaded",
                description: `Successfully processed and saved ${file.name}.`
            });
            
        } catch (error: any) {
            console.error("Error processing JSON report:", error);
            setReportData(null);
            toast({
                variant: 'destructive',
                title: 'Error Loading Report',
                description: error.message || 'Could not parse the JSON file. Please ensure it is a valid Selenium report.',
            });
        }
    }, [toast, user]);

    const reportSummary: ReportSummary | null = useMemo(() => {
        if (!reportData || !reportData.test_results) return null;

        const testResults = reportData.test_results;
        let totalTests = 0;
        let passed = 0;
        const tags = new Set<string>();

        testResults.forEach(feature => {
            if (feature.elements) {
                feature.elements.forEach(scenario => {
                    totalTests++;
                    if (getScenarioStatus(scenario) === 'passed') {
                        passed++;
                    }
                    if (scenario.tags) {
                        scenario.tags.forEach(tag => tags.add(tag.name));
                    }
                });
            }
        });

        return {
            domain: reportData.solution || 'N/A',
            environment: reportData.environment || 'N/A',
            executionEnv: reportData.Config || 'N/A',
            totalTests,
            passed,
            failed: totalTests - passed,
            tags: Array.from(tags),
            reportPath: reportData['Report Path'] || '#',
        };
    }, [reportData]);
    
    if (isLoading) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <p>Loading Selenium Dashboard...</p>
                </div>
            </div>
        );
    }

    if (showUploader || !reportSummary) {
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
                             <Alert className="mt-4">
                                <FileJson className="h-4 w-4" />
                                <AlertTitle>Waiting for file</AlertTitle>
                                <AlertDescription>
                                    This dashboard requires a JSON output file generated by a test automation framework like Cucumber.
                                </AlertDescription>
                            </Alert>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
             <div className='flex justify-between items-center'>
                <h2 className="text-2xl font-bold">Selenium Execution Summary</h2>
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
                            This will clear the current view and allow you to upload a new JSON file.
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
                                    <TableHead>Domain</TableHead>
                                    <TableHead>Environment</TableHead>
                                    <TableHead>Execution Env</TableHead>
                                    <TableHead>Total</TableHead>
                                    <TableHead>Passed</TableHead>
                                    <TableHead>Failed</TableHead>
                                    <TableHead>Tags</TableHead>
                                    <TableHead>Report Path</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                    <TableRow>
                                        <TableCell className='font-medium'>{reportSummary.domain}</TableCell>
                                        <TableCell>{reportSummary.environment}</TableCell>
                                        <TableCell>{reportSummary.executionEnv}</TableCell>
                                        <TableCell>{reportSummary.totalTests}</TableCell>
                                        <TableCell className='text-green-600'>{reportSummary.passed}</TableCell>
                                        <TableCell className='text-destructive'>{reportSummary.failed}</TableCell>
                                        <TableCell className='max-w-xs'>
                                            <div className="flex flex-wrap gap-1">
                                                {reportSummary.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <a href={reportSummary.reportPath} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:underline">
                                                View Report <ExternalLink className="ml-1 h-3 w-3" />
                                            </a>
                                        </TableCell>
                                    </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

        </div>
    );
}
