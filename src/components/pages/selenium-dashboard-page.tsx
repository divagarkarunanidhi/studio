

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { FileUploader } from '../ui/file-uploader';
import { Loader2, Upload, ChevronDown, ChevronRight, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { format, parseISO } from 'date-fns';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
  } from "@/components/ui/dialog"
import { Pie, PieChart, Cell, Tooltip } from "recharts";
import {
  ChartContainer,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { ScrollArea } from '../ui/scroll-area';


type TestCase = {
    [key: string]: string;
};

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
    jobName: string;
    totalTests: number;
    passed: number;
    failed: number;
    scenarios: DetailedScenario[];
    totalExecutionTime: number; // in nanoseconds
    rawReport: StoredReportData;
    uploadedAt: string;
    domain: string;
    environment: string;
}

interface DetailedScenario {
    id: string;
    name: string;
    status: 'passed' | 'failed';
    testCaseId: string | null;
    defectId: string | null;
}

const getStepDuration = (step: Step): number => {
    if (!step.result || step.result.duration === undefined) {
      return 0;
    }
  
    if (typeof step.result.duration === 'number') {
      return step.result.duration;
    }
  
    if (typeof step.result.duration === 'object' && step.result.duration && '$numberLong' in step.result.duration) {
      return Number(step.result.duration.$numberLong);
    }
    
    return 0;
};

const getScenarioStatus = (scenario: Scenario): 'passed' | 'failed' => {
    return scenario.steps.some(step => step.result.status === 'failed') ? 'failed' : 'passed';
};

const extractTestCaseIdFromTags = (tags?: { name: string }[]): string | null => {
    if (!tags) return null;
    const tcTag = tags.find(tag => tag.name.match(/^@TC-\d+$/));
    return tcTag ? tcTag.name.substring(1) : null; // Remove '@'
};

const findDefectIdForTestCase = (testCaseId: string | null, testCaseDetails: TestCase[]): string | null => {
    if (!testCaseId || !testCaseDetails) return null;
    const matchingTC = testCaseDetails.find(tc => tc['Issue key'] === testCaseId);
    return matchingTC ? (matchingTC['Outward issue link (Agile Hive Dependency Link)'] || null) : null;
};


const processReport = (report: StoredReportData, testCaseDetails: TestCase[]): ReportSummary => {
    const { _id, test_results, uploadedAt, solution, environment } = report;
    let totalTests = 0;
    let passed = 0;
    let totalExecutionTime = 0;
    const detailedScenarios: DetailedScenario[] = [];
    let jobName = "N/A";

    if (test_results && test_results.length > 0) {
        // Extract job name from the feature name
        jobName = test_results[0].name || "N/A";

        test_results.forEach(feature => {
            if (feature.elements) {
                feature.elements.forEach(scenario => {
                    totalTests++;
                    const status = getScenarioStatus(scenario);
                    if (status === 'passed') {
                        passed++;
                    }
                    const testCaseId = extractTestCaseIdFromTags(scenario.tags);
                    const defectId = findDefectIdForTestCase(testCaseId, testCaseDetails);
                    detailedScenarios.push({
                        id: scenario.name,
                        name: scenario.name,
                        status: status,
                        testCaseId: testCaseId,
                        defectId: defectId,
                    });

                    scenario.steps.forEach(step => {
                        totalExecutionTime += getStepDuration(step);
                    });
                });
            }
        });
    }

    return {
        id: _id,
        solution: solution || 'N/A',
        jobName: jobName,
        totalTests,
        passed,
        failed: totalTests - passed,
        scenarios: detailedScenarios,
        totalExecutionTime,
        rawReport: report,
        uploadedAt,
        domain: solution || "N/A",
        environment: environment || "N/A",
    };
};

const formatNanosToTime = (nanos: number) => {
    if (nanos === 0) return "0s";
    const seconds = nanos / 1e9;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
};

const DetailModal = ({ report }: { report: ReportSummary }) => {
    const [openFeatures, setOpenFeatures] = useState<Set<string>>(new Set());
    const [isStatusOpen, setIsStatusOpen] = useState(true);
    const [isFailedOpen, setIsFailedOpen] = useState(true);
    const [isScenarioDetailsOpen, setIsScenarioDetailsOpen] = useState(true);
    const [openScenarios, setOpenScenarios] = useState<Set<string>>(new Set());

    const toggleScenario = (scenarioName: string) => {
        setOpenScenarios(prev => {
            const newSet = new Set(prev);
            if (newSet.has(scenarioName)) {
                newSet.delete(scenarioName);
            } else {
                newSet.add(scenarioName);
            }
            return newSet;
        });
    };

    const failedScenarios = useMemo(() => {
        return report.scenarios.filter(s => s.status === 'failed');
    }, [report.scenarios]);

    const toggleFeature = (featureName: string) => {
        setOpenFeatures(prev => {
            const newSet = new Set(prev);
            if (newSet.has(featureName)) {
                newSet.delete(featureName);
            } else {
                newSet.add(featureName);
            }
            return newSet;
        });
    };

    const pieData = [
        { name: 'Passed', value: report.passed, fill: 'hsl(var(--chart-1))' },
        { name: 'Failed', value: report.failed, fill: 'hsl(var(--chart-2))' },
    ];
    return (
        <DialogContent className="max-w-6xl">
            <DialogHeader>
                <DialogTitle>Detailed Report for: {report.solution}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[80vh]">
                <div className="space-y-6 p-4">
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                         <Collapsible open={isStatusOpen} onOpenChange={setIsStatusOpen}>
                            <Card>
                                <CollapsibleTrigger asChild>
                                    <CardHeader className="flex flex-row items-center justify-between cursor-pointer">
                                        <CardTitle>Test Case Status</CardTitle>
                                        <ChevronDown className={cn("h-4 w-4 transition-transform", !isStatusOpen && "-rotate-90")} />
                                    </CardHeader>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <CardContent>
                                        <ChartContainer config={{}} className="mx-auto aspect-square max-h-[250px]">
                                            <PieChart>
                                                <Tooltip content={<ChartTooltipContent hideLabel />} />
                                                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                                ))}
                                                </Pie>
                                            </PieChart>
                                        </ChartContainer>
                                        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4 text-sm">
                                            {pieData.map((entry) => (
                                                <div key={entry.name} className="flex items-center gap-2">
                                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.fill }} />
                                                <span>{entry.name}: <strong className='font-semibold'>{entry.value}</strong></span>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </CollapsibleContent>
                            </Card>
                        </Collapsible>
                        <div className='flex flex-col gap-2 text-sm justify-center'>
                            <div className='flex justify-between p-2 rounded-md bg-muted/50'><span>Total Test Cases:</span> <strong>{report.totalTests}</strong></div>
                            <div className='flex justify-between p-2 rounded-md text-green-600 bg-green-500/10'><span>Passed:</span> <strong>{report.passed}</strong></div>
                            <div className='flex justify-between p-2 rounded-md text-red-600 bg-red-500/10'><span>Failed:</span> <strong>{report.failed}</strong></div>
                            <div className='flex justify-between p-2 rounded-md bg-muted/50'><span>Total Execution Time:</span> <strong>{formatNanosToTime(report.totalExecutionTime)}</strong></div>
                        </div>
                    </div>

                    {failedScenarios.length > 0 && (
                        <Collapsible open={isFailedOpen} onOpenChange={setIsFailedOpen}>
                            <Card>
                                <CollapsibleTrigger asChild>
                                    <CardHeader className="flex flex-row items-center justify-between cursor-pointer">
                                        <CardTitle>Failed Test Cases</CardTitle>
                                        <ChevronDown className={cn("h-4 w-4 transition-transform", !isFailedOpen && "-rotate-90")} />
                                    </CardHeader>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <CardContent>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Test Case ID</TableHead>
                                                    <TableHead>Test Case Name</TableHead>
                                                    <TableHead>Defect ID</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {failedScenarios.map(scenario => (
                                                    <TableRow key={scenario.id}>
                                                        <TableCell>{scenario.testCaseId || 'N/A'}</TableCell>
                                                        <TableCell>{scenario.name}</TableCell>
                                                        <TableCell>{scenario.defectId || 'N/A'}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </CollapsibleContent>
                            </Card>
                        </Collapsible>
                    )}

                    <Collapsible open={isScenarioDetailsOpen} onOpenChange={setIsScenarioDetailsOpen}>
                        <Card>
                             <CollapsibleTrigger asChild>
                                <CardHeader className="flex flex-row items-center justify-between cursor-pointer">
                                    <CardTitle>Scenario Details</CardTitle>
                                    <ChevronDown className={cn("h-4 w-4 transition-transform", !isScenarioDetailsOpen && "-rotate-90")} />
                                </CardHeader>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <CardContent>
                                    <div className='max-h-96 overflow-y-auto'>
                                    {report.rawReport.test_results?.map((feature, fIndex) => (
                                        <Collapsible key={`${feature.name}-${fIndex}`} open={openFeatures.has(feature.name)} onOpenChange={() => toggleFeature(feature.name)}>
                                            <CollapsibleTrigger asChild>
                                                <div className='flex items-center justify-between p-2 rounded-md hover:bg-muted cursor-pointer'>
                                                    <h3 className='font-semibold'>Feature: {feature.name}</h3>
                                                    {openFeatures.has(feature.name) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                </div>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent className="pl-4 pt-2 space-y-2">
                                                {feature.elements.map((scenario, sIndex) => (
                                                    <Collapsible key={`${scenario.name}-${sIndex}`} open={openScenarios.has(scenario.name)} onOpenChange={() => toggleScenario(scenario.name)}>
                                                        <Card className='overflow-hidden'>
                                                            <CollapsibleTrigger asChild>
                                                                <CardHeader className='p-3 bg-muted/50 flex flex-row items-center justify-between cursor-pointer'>
                                                                    <CardTitle className='text-sm flex items-center gap-2'>
                                                                        {getScenarioStatus(scenario) === 'passed' ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                                                                        Scenario: {scenario.name}
                                                                    </CardTitle>
                                                                    <ChevronDown className={cn("h-4 w-4 transition-transform", !openScenarios.has(scenario.name) && "-rotate-90")} />
                                                                </CardHeader>
                                                            </CollapsibleTrigger>
                                                            <CollapsibleContent>
                                                                <CardContent className='p-0'>
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
                                                                                    <TableCell className='text-xs'>{step.keyword}{step.name}</TableCell>
                                                                                    <TableCell className={cn('text-xs', step.result.status === 'passed' ? 'text-green-600' : 'text-red-600')}>{step.result.status}</TableCell>
                                                                                    <TableCell className='text-xs'>{formatNanosToTime(getStepDuration(step))}</TableCell>
                                                                                </TableRow>
                                                                            ))}
                                                                        </TableBody>
                                                                    </Table>
                                                                </CardContent>
                                                            </CollapsibleContent>
                                                        </Card>
                                                    </Collapsible>
                                                ))}
                                            </CollapsibleContent>
                                        </Collapsible>
                                    ))}
                                    </div>
                                </CardContent>
                            </CollapsibleContent>
                        </Card>
                    </Collapsible>
                </div>
            </ScrollArea>
        </DialogContent>
    )
}

export function SeleniumDashboardPage() {
    const { toast } = useToast();
    const { user } = useUser();
    const [allReports, setAllReports] = useState<ReportSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showUploader, setShowUploader] = useState(false);
    const [testCaseDetails, setTestCaseDetails] = useState<TestCase[]>([]);

    const handleLoadFromServer = useCallback(async (testCases: TestCase[]) => {
        setIsLoading(true);
        try {
          const response = await fetch('/api/selenium/all');
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || 'Failed to fetch data from server.');
          }
          const data: StoredReportData[] = await response.json();
          if (data && data.length > 0) {
            const processed = data.map(report => processReport(report, testCases));
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
        const loadAllData = async () => {
            setIsLoading(true);
            try {
                const tcResponse = await fetch('/api/test-cases/latest');
                let tcs: TestCase[] = [];
                if (tcResponse.ok) {
                    const tcData = await tcResponse.json();
                    if (tcData && tcData.testCases) {
                        tcs = tcData.testCases;
                        setTestCaseDetails(tcs);
                    }
                }
                await handleLoadFromServer(tcs);
            } catch (error) {
                console.error("Error loading initial data:", error);
                await handleLoadFromServer([]); // Load reports even if TCs fail
            } finally {
                setIsLoading(false);
            }
        };
        loadAllData();
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

            if (!uploadedJson || !Array.isArray(uploadedJson)) {
                 throw new Error("JSON file must be an array of test results.");
            }

            const response = await fetch('/api/selenium/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fileData: { test_results: uploadedJson },
                  uploaderId: user.uid,
                  fileName: file.name,
                  solution: uploadedJson[0]?.elements[0]?.tags?.find((t: any) => t.name.startsWith('@Sol='))?.name.split('=')[1] || 'Unknown',
                  environment: uploadedJson[0]?.elements[0]?.tags?.find((t: any) => t.name.startsWith('@Env='))?.name.split('=')[1] || 'default',
                  Config: 'default',
                  "Report Path": "N/A"
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
            await handleLoadFromServer(testCaseDetails);
            setShowUploader(false);
            
        } catch (error: any) {
            console.error("Error processing JSON report:", error);
            toast({
                variant: 'destructive',
                title: 'Error Loading Report',
                description: error.message || 'Could not parse the JSON file. Please ensure it is a valid Selenium report.',
            });
        }
    }, [toast, user, handleLoadFromServer, testCaseDetails]);
    
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
                                    <TableHead>Job Name</TableHead>
                                    <TableHead>Domain</TableHead>
                                    <TableHead>Total</TableHead>
                                    <TableHead>Passed</TableHead>
                                    <TableHead>Failed</TableHead>
                                    <TableHead>Detailed Report</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {allReports.map(summary => (
                                    <TableRow key={summary.id}>
                                        <TableCell className='max-w-xs truncate'>{summary.jobName}</TableCell>
                                        <TableCell>{summary.solution}</TableCell>
                                        <TableCell>{summary.totalTests}</TableCell>
                                        <TableCell className='text-green-600'>{summary.passed}</TableCell>
                                        <TableCell className={cn(summary.failed > 0 ? 'text-destructive' : 'text-muted-foreground')}>{summary.failed}</TableCell>
                                        <TableCell>
                                            <Dialog>
                                                <DialogTrigger asChild>
                                                    <Button variant='link' size="sm">View Details</Button>
                                                </DialogTrigger>
                                                <DetailModal report={summary} />
                                            </Dialog>
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
