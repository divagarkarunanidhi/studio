
'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { FileUploader } from '../ui/file-uploader';
import { StatCard } from '../dashboard/stat-card';
import { ClipboardCheck, FileJson, CheckCircle2, XCircle, Percent, Loader2, Upload } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '../ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';


interface Step {
    result: {
        status: 'passed' | 'failed' | 'skipped';
        duration: number;
    };
    name: string;
    keyword: string;
}

interface Tag {
    name: string;
    line: number;
}

interface Scenario {
    name: string;
    keyword: string;
    steps: Step[];
    tags?: Tag[];
}

interface Feature {
    uri: string;
    name: string;
    keyword: string;
    elements: Scenario[];
}

interface ReportStats {
    totalFeatures: number;
    totalScenarios: number;
    passedScenarios: number;
    failedScenarios: number;
    passPercentage: number;
    failedFeatures: { name: string; scenarios: { name: string; failedStep: string, tags: string }[] }[];
}

export function SeleniumDashboardPage() {
    const { toast } = useToast();
    const { user } = useUser();
    const [report, setReport] = useState<Feature[] | null>(null);
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
          const data = await response.json();
          if (data && data.report) {
            setReport(data.report);
            setShowUploader(false);
          } else {
            setReport(null);
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
            const data = JSON.parse(fileContent);
            if (!Array.isArray(data) || data.length === 0 || !('uri' in data[0] && 'elements' in data[0])) {
                throw new Error("JSON file does not appear to be a valid Cucumber report.");
            }
            
            const response = await fetch('/api/selenium/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  report: data,
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
                description: `Successfully processed and saved ${file.name}.`
            });

            // Immediately update the state with the uploaded data to refresh the UI
            setReport(data);
            setShowUploader(false);
            
        } catch (error: any) {
            console.error("Error processing JSON report:", error);
            setReport(null);
            toast({
                variant: 'destructive',
                title: 'Error Loading Report',
                description: error.message || 'Could not parse or upload the JSON file.',
            });
        }
    }, [toast, user]);

    const reportStats: ReportStats | null = useMemo(() => {
        if (!report) return null;

        let totalScenarios = 0;
        let passedScenarios = 0;
        const failedFeatures: ReportStats['failedFeatures'] = [];

        report.forEach(feature => {
            totalScenarios += feature.elements.length;
            const featureFails: { name: string; failedStep: string, tags: string }[] = [];

            feature.elements.forEach(scenario => {
                const isScenarioPassed = scenario.steps.every(step => step.result.status === 'passed');
                if (isScenarioPassed) {
                    passedScenarios++;
                } else {
                    const failedStep = scenario.steps.find(step => step.result.status === 'failed');
                    const tags = (scenario.tags || []).map(tag => tag.name).join(', ');
                    featureFails.push({
                        name: scenario.name,
                        failedStep: failedStep ? `${failedStep.keyword}${failedStep.name}` : 'Unknown step',
                        tags: tags,
                    });
                }
            });

            if (featureFails.length > 0) {
                failedFeatures.push({
                    name: feature.name,
                    scenarios: featureFails
                });
            }
        });

        const failedScenarios = totalScenarios - passedScenarios;
        const passPercentage = totalScenarios > 0 ? (passedScenarios / totalScenarios) * 100 : 0;

        return {
            totalFeatures: report.length,
            totalScenarios,
            passedScenarios,
            failedScenarios,
            passPercentage,
            failedFeatures,
        };
    }, [report]);
    
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

    if (showUploader || !report || !reportStats) {
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
             <div className='text-right'>
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Total Features" value={reportStats.totalFeatures} icon={<FileJson />} />
                <StatCard title="Total Scenarios" value={reportStats.totalScenarios} icon={<ClipboardCheck />} />
                <StatCard title="Passed Scenarios" value={reportStats.passedScenarios} icon={<CheckCircle2 className="text-green-500" />} />
                <StatCard title="Failed Scenarios" value={reportStats.failedScenarios} icon={<XCircle className="text-destructive" />} />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Test Run Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="text-5xl font-bold text-green-500">{reportStats.passPercentage.toFixed(2)}%</div>
                        <div className="w-full">
                            <p className="text-muted-foreground">Overall Pass Rate</p>
                            <Progress value={reportStats.passPercentage} className="mt-2" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {reportStats.failedFeatures.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Failure Details</CardTitle>
                        <CardDescription>A summary of all features with failed scenarios.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="w-full overflow-hidden rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Feature</TableHead>
                                        <TableHead>Failed Scenario</TableHead>
                                        <TableHead>Failing Step</TableHead>
                                        <TableHead>Tags</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportStats.failedFeatures.map((feature, idx) => (
                                        feature.scenarios.map((scenario, sIdx) => (
                                            <TableRow key={`${idx}-${sIdx}`}>
                                                {sIdx === 0 && <TableCell rowSpan={feature.scenarios.length} className="font-medium align-top">{feature.name}</TableCell>}
                                                <TableCell>{scenario.name}</TableCell>
                                                <TableCell>
                                                    <Badge variant="destructive">{scenario.failedStep}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {scenario.tags && <Badge variant="outline">{scenario.tags}</Badge>}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
