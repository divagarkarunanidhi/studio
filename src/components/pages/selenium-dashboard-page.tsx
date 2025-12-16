
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
import { format, formatDistanceToNowStrict } from 'date-fns';
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

interface SeleniumReportFile {
    solution: string;
    environment: string;
    Config: string;
    "Report Path": string;
    test_results: Feature[];
}

interface StoredReportData {
    _id: string;
    fileName: string;
    fileData: SeleniumReportFile;
    uploaderId: string;
    uploadedAt: string;
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

    if (fileData.test_results) {
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
        domain: fileData.solution || 'N/A',
        environment: fileData.environment || 'N/A',
        executionEnv: fileData.Config || 'N/A',
        totalTests,
        passed,
        failed: totalTests - passed,
        tags: Array.from(tags),
        reportPath: fileData['Report Path'] || '#',
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
    const [detailedReport, setDetailedReport] = useState<ReportSummary | null>(null);

    const handleLoadFromServer = useCallback(async () => {
        setIsLoading(true);
        setDetailedReport(null); // Go back to summary view
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
            const fileData: SeleniumReportFile = JSON.parse(fileContent);

            if (typeof fileData !== 'object' || fileData === null) {
                throw new Error("Uploaded file is not a valid JSON object.");
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

            await handleLoadFromServer();
            
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

    if (detailedReport) {
        return (
            <div className="space-y-6">
                <Button variant="outline" onClick={() => setDetailedReport(null)}>
                    &larr; Back to All Reports
                </Button>
                <Card>
                    <CardHeader>
                        <CardTitle>Execution Details for: {detailedReport.fileName}</CardTitle>
                        <CardDescription>
                            Uploaded on {format(new Date(detailedReport.uploadedAt), "MMM d, yyyy 'at' h:mm a")}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                    <Collapsible>
                        <CollapsibleTrigger asChild>
                            <Button variant="link" className="p-0 mb-4">
                                Show Full Report Details <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <div className="space-y-4">
                                {detailedReport.rawReport.fileData.test_results?.map((feature, fIndex) => (
                                    <Card key={`${feature.name}-${fIndex}`}>
                                        <CardHeader>
                                            <CardTitle className='text-lg'>Feature: {feature.name}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-2">
                                                {feature.elements?.map((scenario, sIndex) => (
                                                    <Collapsible key={`${scenario.name}-${sIndex}`}>
                                                        <CollapsibleTrigger asChild>
                                                            <div className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer">
                                                                <ChevronRight className="h-4 w-4" />
                                                                <Badge variant={getScenarioStatus(scenario) === 'passed' ? 'default' : 'destructive'}>{getScenarioStatus(scenario)}</Badge>
                                                                <span className="font-medium">{scenario.name}</span>
                                                            </div>
                                                        </CollapsibleTrigger>
                                                        <CollapsibleContent className="pl-8 pt-2">
                                                            <Table>
                                                                <TableHeader>
                                                                    <TableRow>
                                                                        <TableHead>Step</TableHead>
                                                                        <TableHead>Status</TableHead>
                                                                        <TableHead>Duration</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {scenario.steps.map((step, stIndex) => (
                                                                        <TableRow key={stIndex}>
                                                                            <TableCell>{step.keyword.trim()} {step.name}</TableCell>
                                                                            <TableCell>
                                                                                <Badge variant={step.result.status === 'passed' ? 'default' : step.result.status === 'failed' ? 'destructive' : 'secondary'}>{step.result.status}</Badge>
                                                                            </TableCell>
                                                                            <TableCell>{formatDuration(getStepDuration(step))}</TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </CollapsibleContent>
                                                    </Collapsible>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                    
                    <h3 className="text-xl font-semibold mb-2 mt-6">Failure Summary</h3>
                    {detailedReport.failedFeatures.length > 0 ? (
                        <div className="space-y-4">
                            {detailedReport.failedFeatures.map(feature => (
                                <Card key={feature.featureName}>
                                    <CardHeader>
                                        <CardTitle className='text-lg'>{feature.featureName}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Failed Scenario</TableHead>
                                                    <TableHead>Tags</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {feature.scenarios.map(scenario => (
                                                    <TableRow key={scenario.name}>
                                                        <TableCell className="font-medium">{scenario.name}</TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-wrap gap-1">
                                                                {scenario.tags.map(tag => <Badge key={tag} variant="destructive">{tag}</Badge>)}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                         ) : (
                            <Alert>
                                <AlertTitle>No Failures!</AlertTitle>
                                <AlertDescription>This test run had 0 failed scenarios.</AlertDescription>
                            </Alert>
                         )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
             <div className='flex justify-between items-center'>
                <h2 className="text-2xl font-bold">All Selenium Executions</h2>
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
                                    <TableHead>Date Uploaded</TableHead>
                                    <TableHead>Domain</TableHead>
                                    <TableHead>Environment</TableHead>
                                    <TableHead>Total</TableHead>
                                    <TableHead>Passed</TableHead>
                                    <TableHead>Failed</TableHead>
                                    <TableHead>Execution Time</TableHead>
                                    <TableHead>Report Path</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {allReports.map(summary => (
                                    <TableRow key={summary.id}>
                                        <TableCell className='font-medium text-xs'>
                                            {format(new Date(summary.uploadedAt), "dd MMM yyyy, HH:mm")}
                                        </TableCell>
                                        <TableCell>{summary.domain}</TableCell>
                                        <TableCell>{summary.environment}</TableCell>
                                        <TableCell>{summary.totalTests}</TableCell>
                                        <TableCell className='text-green-600'>{summary.passed}</TableCell>
                                        <TableCell className={cn(summary.failed > 0 ? 'text-destructive' : 'text-muted-foreground')}>{summary.failed}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1 text-muted-foreground">
                                                <Timer className="h-4 w-4" />
                                                {formatDuration(summary.totalDuration)}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <a href={summary.reportPath} target="_blank" rel="noopener noreferrer" className="flex items-center text-primary hover:underline">
                                                View Report <ExternalLink className="ml-1 h-3 w-3" />
                                            </a>
                                        </TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="sm" onClick={() => setDetailedReport(summary)}>
                                                <Eye className="mr-2 h-4 w-4" />
                                                Details
                                            </Button>
                                        </TableCell>
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

    