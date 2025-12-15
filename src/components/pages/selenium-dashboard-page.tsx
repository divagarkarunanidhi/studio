
'use client';

import { useState, useCallback, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { FileUploader } from '../dashboard/file-uploader';
import { StatCard } from '../dashboard/stat-card';
import { ClipboardCheck, FileJson, CheckCircle2, XCircle, Percent } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface Step {
    result: {
        status: 'passed' | 'failed' | 'skipped';
        duration: number;
    };
    name: string;
    keyword: string;
}

interface Scenario {
    name: string;
    keyword: string;
    steps: Step[];
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
    failedFeatures: { name: string; scenarios: { name: string; failedStep: string }[] }[];
}

export function SeleniumDashboardPage() {
    const { toast } = useToast();
    const [report, setReport] = useState<Feature[] | null>(null);

    const handleDataUploaded = useCallback((fileContent: string, file: File) => {
        try {
            if (!file.name.endsWith('.json')) {
                throw new Error("Invalid file type. Please upload a JSON file.");
            }
            const data = JSON.parse(fileContent);
            if (!Array.isArray(data) || data.length === 0) {
                throw new Error("Invalid or empty JSON report. Expected an array of features.");
            }
            // Basic validation for Cucumber JSON structure
            if (!('uri' in data[0] && 'elements' in data[0])) {
                throw new Error("JSON file does not appear to be a valid Cucumber report.");
            }
            setReport(data);
            toast({
                title: "Report Loaded",
                description: `Successfully parsed ${data.length} feature(s) from ${file.name}.`
            });
        } catch (error: any) {
            console.error("Error parsing JSON report:", error);
            setReport(null);
            toast({
                variant: 'destructive',
                title: 'Error Loading Report',
                description: error.message || 'Could not parse the JSON file.',
            });
        }
    }, [toast]);

    const reportStats: ReportStats | null = useMemo(() => {
        if (!report) return null;

        let totalScenarios = 0;
        let passedScenarios = 0;
        const failedFeatures: ReportStats['failedFeatures'] = [];

        report.forEach(feature => {
            totalScenarios += feature.elements.length;
            const featureFails: { name: string; failedStep: string }[] = [];

            feature.elements.forEach(scenario => {
                const isScenarioPassed = scenario.steps.every(step => step.result.status === 'passed');
                if (isScenarioPassed) {
                    passedScenarios++;
                } else {
                    const failedStep = scenario.steps.find(step => step.result.status === 'failed');
                    featureFails.push({
                        name: scenario.name,
                        failedStep: failedStep ? `${failedStep.keyword}${failedStep.name}` : 'Unknown step'
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

    if (!report || !reportStats) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center p-4">
                <div className="flex w-full max-w-lg flex-col items-center justify-center gap-4 text-center">
                    <Card className="w-full">
                        <CardHeader>
                            <CardTitle>Upload Selenium Report</CardTitle>
                            <CardDescription>To get started, please upload a Cucumber JSON report file.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <FileUploader onDataUploaded={handleDataUploaded} templatePath='' />
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
