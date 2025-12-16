
'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { FileUploader } from '../ui/file-uploader';
import { Loader2, Upload, ExternalLink, ChevronRight, ChevronsRight, Eye, Timer } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '../ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';
import { format, formatDistanceToNowStrict, isValid } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';


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

interface StoredReportData {
    _id: string;
    fileName: string;
    fileData: SeleniumReportFile;
    uploaderId: string;
    uploadedAt: string;
}

interface SeleniumReportFile {
    solution?: string;
    environment?: string;
    Config?: string;
    "Report Path"?: string;
    test_results: Feature[];
}

interface ReportSummary {
    id: string;
    fileName: string;
    uploadedAt: string;
    domain: string;
    environment: string;
    executionEnv: string;
    totalTests: number;
    passed: number;
    failed: number;
    tags: string[];
    reportPath: string;
    failedFeatures: { featureName: string; scenarios: { name: string; tags: string[] }[] }[];
    totalDuration: number;
    rawReport: StoredReportData;
}

const getStepDuration = (step: Step): number => {
    if (!step.result.duration) return 0;
    if (typeof step.result.duration === 'number') return step.result.duration;
    if (typeof step.result.duration === 'object' && step.result.duration?.$numberLong) {
        return parseInt(step.result.duration.$numberLong, 10);
    }
    return 0;
};

const getStepStatus = (step: Step): 'passed' | 'failed' | 'skipped' => {
    return step.result.status;
};

const getScenarioStatus = (scenario: Scenario): 'passed' | 'failed' => {
    return scenario.steps.every(step => getStepStatus(step) === 'passed') ? 'passed' : 'failed';
}

const formatDuration = (nanoseconds: number): string => {
    if (nanoseconds === 0) return "0s";
    const seconds = nanoseconds / 1e9;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds.toFixed(2)}s`;
};


const processReport = (report: StoredReportData): ReportSummary => {
    const { _id, fileName, uploadedAt, fileData } = report;
    let totalTests = 0;
    let passed = 0;
    let totalDuration = 0;
    const tags = new Set<string>();
    const failedFeatures: ReportSummary['failedFeatures'] = [];

    if (fileData && fileData.test_results) {
        fileData.test_results.forEach(feature => {
            if (feature.tags) {
                feature.tags.forEach(tag => tags.add(tag.name));
            }

            let featureHasFailures = false;
            const failedScenariosInFeature: { name: string; tags: string[] }[] = [];

            if (feature.elements) {
                feature.elements.forEach(scenario => {
                    totalTests++;
                    const scenarioStatus = getScenarioStatus(scenario);
                    if (scenarioStatus === 'passed') {
                        passed++;
                    } else {
                        featureHasFailures = true;
                        failedScenariosInFeature.push({
                            name: scenario.name,
                            tags: scenario.tags ? scenario.tags.map(t => t.name) : []
                        });
                    }

                    if (scenario.tags) {
                        scenario.tags.forEach(tag => tags.add(tag.name));
                    }

                    scenario.steps.forEach(step => {
                        totalDuration += getStepDuration(step);
                    });
                });
            }

            if (featureHasFailures) {
                failedFeatures.push({
                    featureName: feature.name,
                    scenarios: failedScenariosInFeature
                });
            }
        });
    }

    return {
        id: _id,
        fileName,
        uploadedAt,
        domain: fileData?.solution || 'N/A',
        environment: fileData?.environment || 'N/A',
        executionEnv: fileData?.Config || 'N/A',
        totalTests,
        passed,
        failed: totalTests - passed,
        tags: Array.from(tags),
        reportPath: fileData?.['Report Path'] || '#',
        failedFeatures,
        totalDuration,
        rawReport: report,
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

            const fileData: SeleniumReportFile = {
                solution: uploadedJson.solution,
                environment: uploadedJson.environment,
                Config: uploadedJson.Config,
                "Report Path": uploadedJson["Report Path"],
                test_results: uploadedJson.test_results,
            };

            if (!fileData || !Array.isArray(fileData.test_results)) {
                 throw new Error("JSON file must be an object containing a 'test_results' array.");
            }

            const response = await fetch('/api/selenium/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fileData: fileData,
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
                                        <TableCell>{summary.domain}</TableCell>
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
