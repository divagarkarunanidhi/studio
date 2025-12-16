
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
}

interface DetailedScenario {
    id: string;
    name: string;
    status: 'passed' | 'failed';
    testCaseId: string | null;
    defectId: string | null;
}

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
    const { _id, solution, test_results } = report;
    let totalTests = 0;
    let passed = 0;
    const detailedScenarios: DetailedScenario[] = [];
    let jobName = "N/A";

    if (test_results && test_results.length > 0) {
        // Extract job name from the first scenario of the first feature
        if (test_results[0].elements && test_results[0].elements.length > 0) {
            jobName = test_results[0].elements[0].name;
        }

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
                });
            }
        });
    }

    return {
        id: _id,
        solution: report.solution || 'N/A',
        jobName: jobName,
        totalTests,
        passed,
        failed: totalTests - passed,
        scenarios: detailedScenarios,
    };
};

const DetailModal = ({ report }: { report: ReportSummary }) => {
    const pieData = [
        { name: 'Passed', value: report.passed, fill: 'hsl(var(--chart-1))' },
        { name: 'Failed', value: report.failed, fill: 'hsl(var(--chart-2))' },
    ];
    return (
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>Detailed Report for: {report.solution}</DialogTitle>
            </DialogHeader>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <Card>
                    <CardHeader>
                        <CardTitle>Test Case Status</CardTitle>
                    </CardHeader>
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
                    </CardContent>
                </Card>
                <div className='flex flex-col gap-2 text-sm'>
                    <div className='flex justify-between'><span>Total Test Cases:</span> <strong>{report.totalTests}</strong></div>
                    <div className='flex justify-between text-green-600'><span>Passed:</span> <strong>{report.passed}</strong></div>
                    <div className='flex justify-between text-red-600'><span>Failed:</span> <strong>{report.failed}</strong></div>
                </div>
            </div>

            <Card>
                <CardHeader><CardTitle>Test Details</CardTitle></CardHeader>
                <CardContent>
                    <div className='max-h-96 overflow-y-auto'>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Test Case ID</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Defect ID</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {report.scenarios.map(scenario => (
                                <TableRow key={scenario.id}>
                                    <TableCell>{scenario.testCaseId || 'N/A'}</TableCell>
                                    <TableCell className={cn(scenario.status === 'passed' ? 'text-green-600' : 'text-red-600')}>{scenario.status}</TableCell>
                                    <TableCell>{scenario.defectId || 'N/A'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    </div>
                </CardContent>
            </Card>
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

     const fetchTestCaseDetails = useCallback(async () => {
        try {
            const response = await fetch('/api/test-cases/latest');
            if (response.ok) {
                const data = await response.json();
                if (data && data.testCases) {
                    setTestCaseDetails(data.testCases);
                }
            }
        } catch (error) {
            console.error("Failed to fetch test case details:", error);
        }
    }, []);

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
                  solution: uploadedJson[0]?.name || "Unknown Solution",
                  environment: 'default',
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
                                    <TableHead>Solution</TableHead>
                                    <TableHead>Job Name</TableHead>
                                    <TableHead>Total Test Cases</TableHead>
                                    <TableHead>Passed</TableHead>
                                    <TableHead>Failed</TableHead>
                                    <TableHead>Detailed Report</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {allReports.map(summary => (
                                    <TableRow key={summary.id}>
                                        <TableCell>{summary.solution}</TableCell>
                                        <TableCell>{summary.jobName}</TableCell>
                                        <TableCell>{summary.totalTests}</TableCell>
                                        <TableCell className='text-green-600'>{summary.passed}</TableCell>
                                        <TableCell className={cn(summary.failed > 0 ? 'text-destructive' : 'text-muted-foreground')}>{summary.failed}</TableCell>
                                        <TableCell>
                                            <Dialog>
                                                <DialogTrigger asChild>
                                                    <Button variant='link'>View Details</Button>
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
