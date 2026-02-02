'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import type { AppConfiguration, Defect } from '@/lib/types';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { FileUploader } from '../ui/file-uploader';
import { Loader2, Upload, ChevronDown, ChevronRight, CheckCircle, XCircle, Clock, Download, GitCompareArrows, TrendingUp, TrendingDown, Layers, Terminal, Camera, Settings } from 'lucide-react';
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
    DialogDescription,
    DialogFooter,
  } from "@/components/ui/dialog"
import { Pie, PieChart, Cell, Tooltip } from "recharts";
import {
  ChartContainer,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import {
  Tooltip as UITooltip,
  TooltipContent as UITooltipContent,
  TooltipProvider as UITooltipProvider,
  TooltipTrigger as UITooltipTrigger,
} from "@/components/ui/tooltip";
import { DateRangePicker } from '../ui/date-range-picker';
import type { DateRange } from 'react-day-picker';


type TestCase = {
    [key: string]: string;
};

interface StepResult {
    status: 'passed' | 'failed' | 'skipped';
    duration?: number | { '$numberLong'?: string };
    error_message?: string;
    embeddings?: Embedding[];
}

interface Embedding {
    data: string;
    mime_type: string;
}

interface Step {
    result: StepResult;
    name: string;
    keyword: string;
    embeddings?: Embedding[];
}

interface Scenario {
    name: string;
    keyword: string;
    steps: Step[];
    tags?: { name: string }[];
    start_timestamp?: string;
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
    domain: string;
    environment: string;
    uploadedAt: string;
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

const formatNanosToTime = (nanos: number) => {
    if (nanos <= 0) return "0s";
    const totalSeconds = nanos / 1e9;
    
    if (totalSeconds < 1) {
        return `${totalSeconds.toFixed(3)}s`;
    }
    
    if (totalSeconds < 60) {
        return `${totalSeconds.toFixed(1)}s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
};

const handleExport = (scenariosToExport: DetailedScenario[], sliceName: string) => {
    if (!scenariosToExport || scenariosToExport.length === 0) {
        return;
    }

    const worksheetData = scenariosToExport.map(sc => ({
        'Test Case ID': sc.testCaseId || 'N/A',
        'Test Case Name': sc.name,
        'Defect ID': sc.defectId || 'N/A',
        'Status': sc.status,
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    
    worksheet['!cols'] = [
        { wch: 15 }, // Test Case ID
        { wch: 60 }, // Test Case Name
        { wch: 15 }, // Defect ID
        { wch: 10 }, // Status
    ];

    XLSX.utils.sheet_add_aoa(worksheet, [Object.keys(worksheetData[0])], { origin: 'A1' });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Scenarios');
    const fileName = `selenium_scenarios_${sliceName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
};

const SmallStatusChart = ({ passed, failed, size = 48 }: { passed: number; failed: number; size?: number }) => {
    const data = [
        { name: 'Passed', value: passed, fill: '#22c55e' }, // Green
        { name: 'Failed', value: failed, fill: '#ef4444' }, // Red
    ].filter(d => d.value > 0);

    if (data.length === 0) return <div style={{ width: size, height: size }} className="bg-muted rounded-full" />;

    return (
        <div style={{ width: size, height: size }} className="flex items-center justify-center shrink-0">
            <ChartContainer config={{}} className="h-full w-full">
                <PieChart width={size} height={size}>
                    <Tooltip
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                return (
                                    <div className="bg-background border rounded p-1 text-[10px] shadow-sm z-50">
                                        {payload[0].name}: {payload[0].value}
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={0}
                        outerRadius={(size / 2) - 2}
                        paddingAngle={0}
                        dataKey="value"
                        isAnimationActive={false}
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                        ))}
                    </Pie>
                </PieChart>
            </ChartContainer>
        </div>
    );
};


const ClickableStat = ({
    title,
    count,
    scenarios,
    jiraLink,
    className
}: {
    title: string;
    count: number;
    scenarios: DetailedScenario[];
    jiraLink: string;
    className?: string;
}) => {
    if (count === 0) {
        return null;
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <div className={cn('flex justify-between p-2 rounded-md cursor-pointer hover:ring-1 hover:ring-primary', className)}>
                    <span>{title}:</span>
                    <strong className='hover:underline'>{count}</strong>
                </div>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Test Cases for: {title}</DialogTitle>
                    <DialogDescription>{count} test case(s) in this category.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-72 w-full rounded-md border">
                    <div className="p-4 flex flex-wrap gap-2">
                        {scenarios.map((scenario, idx) => (
                            <Badge key={`${scenario.id}-${idx}`} variant="secondary">
                                {scenario.testCaseId ? (
                                    <a
                                        href={`${jiraLink}/browse/${scenario.testCaseId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:underline"
                                    >
                                        {scenario.testCaseId}
                                    </a>
                                ) : (
                                    <span title={scenario.name}>ID N/A</span>
                                )}
                            </Badge>
                        ))}
                    </div>
                </ScrollArea>
                 <DialogFooter>
                    <Button variant="outline" onClick={() => handleExport(scenarios, title)} disabled={!scenarios || scenarios.length === 0}>
                        <Download className="mr-2 h-4 w-4" />
                        Export to Excel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

const DetailModal = ({ report, jiraLink, allProcessedReports }: { report: ReportSummary; jiraLink: string; allProcessedReports: ReportSummary[] }) => {
    const [openFeatures, setOpenFeatures] = useState<Set<string>>(new Set());
    const [isStatusOpen, setIsStatusOpen] = useState(true);
    const [isComparisonOpen, setIsComparisonOpen] = useState(true);
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
    const passedScenarios = useMemo(() => {
        return report.scenarios.filter(s => s.status === 'passed');
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

    const isMostRecentReport = useMemo(() => {
        if (report.id.startsWith('consolidated')) return false;
        
        const reportsForSameJob = allProcessedReports.filter(p => p.jobName === report.jobName && !p.id.startsWith('consolidated'));
        if (reportsForSameJob.length <= 1) return false;

        const mostRecentReport = reportsForSameJob.sort((a,b) => {
            const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
            const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
            return dateB - dateA;
        })[0];

        return mostRecentReport.id === report.id;
    }, [report, allProcessedReports]);

    const comparisonData = useMemo(() => {
        if (report.id.startsWith('consolidated') || !isMostRecentReport) return null;

        const previousRuns = allProcessedReports
            .filter(p => p.jobName === report.jobName && !p.id.startsWith('consolidated') && p.uploadedAt && report.uploadedAt && new Date(p.uploadedAt) < new Date(report.uploadedAt))
            .sort((a, b) => {
                const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
                const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
                return dateB - dateA;
            });
    
        const previousReport = previousRuns[0];

        if (!previousReport) return null;
        
        const currentFailed = new Set(report.scenarios.filter(s => s.status === 'failed').map(s => s.name));
        const prevFailed = new Set(previousReport.scenarios.filter(s => s.status === 'failed').map(s => s.name));

        const newFailures = report.scenarios.filter(s => currentFailed.has(s.name) && !prevFailed.has(s.name));
        const fixes = previousReport.scenarios.filter(s => prevFailed.has(s.name) && !currentFailed.has(s.name));

        const timeDifference = report.totalExecutionTime - previousReport.totalExecutionTime;

        return {
            newFailures,
            fixes,
            timeDifference,
            previousReportDate: previousReport.uploadedAt,
        }

    }, [report, allProcessedReports, isMostRecentReport]);

    const pieData = [
        { name: 'Passed', value: report.passed, fill: '#22c55e' },
        { name: 'Failed', value: report.failed, fill: '#ef4444' },
    ];
    
    const scenariosByFeature = useMemo(() => {
        const featureMap = new Map<string, Scenario[]>();
        report.rawReport.test_results?.forEach(feature => {
            const existingScenarios = featureMap.get(feature.name) || [];
            featureMap.set(feature.name, [...existingScenarios, ...feature.elements]);
        });
        return Array.from(featureMap.entries());
    }, [report.rawReport.test_results]);


    return (
        <DialogContent className="max-w-6xl">
            <DialogHeader>
                <DialogTitle>Detailed Report for: {report.solution}</DialogTitle>
                <DialogDescription>
                    {report.jobName} | Run on: {report.uploadedAt ? format(parseISO(report.uploadedAt), "MMM d, yyyy 'at' h:mm a") : 'N/A'}
                </DialogDescription>
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
                           <ClickableStat title="Total Test Cases" count={report.totalTests} scenarios={report.scenarios} jiraLink={jiraLink} />
                            <ClickableStat title="Passed" count={report.passed} scenarios={passedScenarios} jiraLink={jiraLink} className='text-green-600 bg-green-500/10' />
                            <ClickableStat title="Failed" count={report.failed} scenarios={failedScenarios} jiraLink={jiraLink} className='text-red-600 bg-red-500/10' />
                            <div className='flex justify-between p-2 rounded-md bg-muted/50'><span>Total Execution Time:</span> <strong>{formatNanosToTime(report.totalExecutionTime)}</strong></div>
                        </div>
                    </div>

                    {comparisonData && (
                         <Collapsible open={isComparisonOpen} onOpenChange={setIsComparisonOpen}>
                            <Card>
                                <CollapsibleTrigger asChild>
                                    <CardHeader className="flex flex-row items-center justify-between cursor-pointer">
                                        <CardTitle className="flex items-center gap-2"><GitCompareArrows /> Comparison with Last Run</CardTitle>
                                        <ChevronDown className={cn("h-4 w-4 transition-transform", !isComparisonOpen && "-rotate-90")} />
                                    </CardHeader>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <CardContent className="text-sm space-y-4">
                                         <p className="text-xs text-muted-foreground">
                                            Compared against run from {comparisonData.previousReportDate ? format(parseISO(comparisonData.previousReportDate), "MMM d, yyyy 'at' h:mm a") : 'N/A'}
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <h4 className="font-semibold mb-2">New Failures ({comparisonData.newFailures.length})</h4>
                                                <ScrollArea className="h-40 rounded-md border p-2">
                                                    {comparisonData.newFailures.length > 0 ? (
                                                        comparisonData.newFailures.map(s => (
                                                            <a
                                                                key={s.id}
                                                                href={`${jiraLink}/browse/${s.testCaseId}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="block text-xs p-1 rounded-md hover:bg-muted text-primary hover:underline"
                                                            >
                                                                {s.testCaseId || 'N/A'}
                                                            </a>
                                                        ))
                                                    ) : <p className="text-muted-foreground text-xs">No new failures.</p>}
                                                </ScrollArea>
                                            </div>
                                            <div>
                                                <h4 className="font-semibold mb-2">Fixes ({comparisonData.fixes.length})</h4>
                                                <ScrollArea className="h-40 rounded-md border p-2">
                                                    {comparisonData.fixes.length > 0 ? (
                                                         comparisonData.fixes.map(s => (
                                                            <a
                                                                key={s.id}
                                                                href={`${jiraLink}/browse/${s.testCaseId}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="block text-xs p-1 rounded-md hover:bg-muted text-primary hover:underline"
                                                            >
                                                                {s.testCaseId || 'N/A'}
                                                            </a>
                                                        ))
                                                    ) : <p className="text-muted-foreground text-xs">No new fixes.</p>}
                                                </ScrollArea>
                                            </div>
                                            <div>
                                                <h4 className="font-semibold mb-2">Execution Time</h4>
                                                <div className={cn("flex items-center gap-2 p-2 rounded-md", comparisonData.timeDifference > 0 ? "bg-red-500/10 text-red-600" : "bg-green-500/10 text-green-600")}>
                                                     {comparisonData.timeDifference > 0 ? <TrendingUp /> : <TrendingDown />}
                                                    <span>
                                                        {formatNanosToTime(Math.abs(comparisonData.timeDifference))} {comparisonData.timeDifference > 0 ? 'slower' : 'faster'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </CollapsibleContent>
                            </Card>
                         </Collapsible>
                    )}

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
                                                        <TableCell>
                                                        {scenario.testCaseId ? (
                                                                <a
                                                                    href={`${jiraLink}/browse/${scenario.testCaseId}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-primary hover:underline"
                                                                >
                                                                    {scenario.testCaseId}
                                                                </a>
                                                            ) : (
                                                                'N/A'
                                                            )}
                                                        </TableCell>
                                                        <TableCell>{scenario.name}</TableCell>
                                                        <TableCell>
                                                            {scenario.defectId ? (
                                                                <a
                                                                    href={`${jiraLink}/browse/${scenario.defectId}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-primary hover:underline"
                                                                >
                                                                    {scenario.defectId}
                                                                </a>
                                                            ) : (
                                                                'N/A'
                                                            )}
                                                        </TableCell>
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
                                    {scenariosByFeature.map(([featureName, scenarios], fIndex) => (
                                        <Collapsible key={`${featureName}-${fIndex}`} open={openFeatures.has(featureName)} onOpenChange={() => toggleFeature(featureName)}>
                                            <CollapsibleTrigger asChild>
                                                <div className='flex items-center justify-between p-2 rounded-md hover:bg-muted cursor-pointer'>
                                                    <h3 className='font-semibold'>Feature: {featureName}</h3>
                                                    {openFeatures.has(featureName) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4" />}
                                                </div>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent className="pl-4 pt-2 space-y-2">
                                                {scenarios.map((scenario, sIndex) => (
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
                                                                            {scenario.steps.map((step, stIndex) => {
                                                                                const screenshots = [...(step.embeddings || []), ...(step.result?.embeddings || [])].filter(e => e.mime_type?.startsWith('image/'));
                                                                                const hasScreenshots = screenshots.length > 0;

                                                                                return (
                                                                                    <TableRow key={stIndex}>
                                                                                        <TableCell className='text-xs'>{step.keyword}{step.name}</TableCell>
                                                                                        <TableCell className={cn('text-xs', step.result.status === 'passed' ? 'text-green-600' : 'text-red-600')}>
                                                                                            <div className="flex flex-col gap-1">
                                                                                                <span>{step.result.status}</span>
                                                                                                <div className="flex gap-2">
                                                                                                    {step.result.error_message && (
                                                                                                        <Dialog>
                                                                                                            <DialogTrigger asChild>
                                                                                                                <Button variant="link" size="sm" className="h-auto p-0 text-[10px] text-destructive underline justify-start flex gap-1">
                                                                                                                    <Terminal className="h-2.5 w-2.5" />
                                                                                                                    View Logs
                                                                                                                </Button>
                                                                                                            </DialogTrigger>
                                                                                                            <DialogContent className="max-w-3xl">
                                                                                                                <DialogHeader>
                                                                                                                    <DialogTitle>Failure Logs</DialogTitle>
                                                                                                                    <DialogDescription>
                                                                                                                        Step: {step.keyword}{step.name}
                                                                                                                    </DialogDescription>
                                                                                                                </DialogHeader>
                                                                                                                <ScrollArea className="max-h-[60vh] rounded-md border bg-muted p-4">
                                                                                                                    <pre className="text-xs whitespace-pre-wrap font-mono text-foreground/90 leading-relaxed">
                                                                                                                        {step.result.error_message}
                                                                                                                    </pre>
                                                                                                                </ScrollArea>
                                                                                                            </DialogContent>
                                                                                                        </Dialog>
                                                                                                    )}
                                                                                                    {hasScreenshots && (
                                                                                                        <Dialog>
                                                                                                            <DialogTrigger asChild>
                                                                                                                <Button variant="link" size="sm" className="h-auto p-0 text-[10px] text-blue-600 underline justify-start flex gap-1">
                                                                                                                    <Camera className="h-2.5 w-2.5" />
                                                                                                                    View Screenshot
                                                                                                                </Button>
                                                                                                            </DialogTrigger>
                                                                                                            <DialogContent className="max-w-5xl">
                                                                                                                <DialogHeader>
                                                                                                                    <DialogTitle>Step Screenshot</DialogTitle>
                                                                                                                    <DialogDescription>
                                                                                                                        Step: {step.keyword}{step.name}
                                                                                                                    </DialogDescription>
                                                                                                                </DialogHeader>
                                                                                                                <ScrollArea className="max-h-[80vh] flex flex-col items-center justify-center bg-muted p-2 rounded-md border">
                                                                                                                    {screenshots.map((e, idx) => (
                                                                                                                            <img 
                                                                                                                                key={idx} 
                                                                                                                                src={`data:${e.mime_type};base64,${e.data}`} 
                                                                                                                                alt={`Screenshot ${idx}`} 
                                                                                                                                className="max-w-full h-auto shadow-md rounded-sm mb-4 last:mb-0"
                                                                                                                            />
                                                                                                                        ))
                                                                                                                    }
                                                                                                                </ScrollArea>
                                                                                                            </DialogContent>
                                                                                                        </Dialog>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                        </TableCell>
                                                                                        <TableCell className='text-xs'>{formatNanosToTime(getStepDuration(step))}</TableCell>
                                                                                    </TableRow>
                                                                                )
                                                                            })}
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

const PAGE_SIZE = 50;

export function SeleniumDashboardPage() {
    const { toast } = useToast();
    const { user } = useUser();
    const firestore = useFirestore();
    
    const [processedReports, setProcessedReports] = useState<ReportSummary[]>([]);
    const [totalReports, setTotalReports] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    
    const [isLoading, setIsLoading] = useState(true);
    const [showUploader, setShowUploader] = useState(false);
    const [testCaseDetails, setTestCaseDetails] = useState<TestCase[]>([]);
    const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);

    const configRef = useMemoFirebase(() => (firestore ? doc(firestore, 'appConfiguration', 'global') : null), [firestore]);
    const { data: configData } = useDoc<AppConfiguration>(configRef);

    const jiraLink = useMemo(() => configData?.jiraLink || "", [configData]);

    const domainDateRanges = useMemo(() => {
        const ranges: Record<string, DateRange | undefined> = {};
        if (configData?.seleniumDomainDateRanges) {
            Object.entries(configData.seleniumDomainDateRanges).forEach(([d, r]: [string, any]) => {
                if (r) {
                    ranges[d] = {
                        from: r.from ? new Date(r.from) : undefined,
                        to: r.to ? new Date(r.to) : undefined
                    };
                }
            });
        }
        return ranges;
    }, [configData]);

    const setDomainDateRange = (domain: string, range: DateRange | undefined) => {
        if (!configRef) return;
        
        const currentRaw = configData?.seleniumDomainDateRanges || {};
        const updatedRaw = { ...currentRaw };
        
        if (range) {
            const rangeObj: any = {};
            if (range.from) rangeObj.from = range.from.toISOString();
            if (range.to) rangeObj.to = range.to.toISOString();
            
            // Firebase doesn't support 'undefined' field values. 
            // We ensure both properties are set correctly or omitted if they don't exist.
            updatedRaw[domain] = rangeObj;
        } else {
            delete updatedRaw[domain];
        }
        
        updateDocumentNonBlocking(configRef, { seleniumDomainDateRanges: updatedRaw });
    };

    const resetAllRanges = () => {
        if (!configRef) return;
        updateDocumentNonBlocking(configRef, { seleniumDomainDateRanges: {} });
    };

    const fetchReports = useCallback(async (page: number) => {
        setIsLoading(true);
        try {
            const reportResponse = await fetch(`/api/selenium/all?page=${page}&limit=${PAGE_SIZE}`);
            if (!reportResponse.ok) {
                throw new Error('Failed to fetch selenium reports.');
            }
            const { reports, total } = await reportResponse.json();
            setProcessedReports(reports);
            setTotalReports(total);
            setShowUploader(total === 0);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error Loading Reports', description: error.message });
            setShowUploader(true);
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        const loadInitialData = async () => {
            setIsLoading(true);
            try {
                const [tcResponse] = await Promise.all([
                    fetch('/api/test-cases/latest'),
                ]);
    
                if (tcResponse.ok) {
                    const tcData = await tcResponse.json();
                    if (tcData && tcData.testCases) {
                        setTestCaseDetails(tcData.testCases);
                    }
                } else {
                    console.warn("Could not fetch test case details. Defect IDs might be missing.");
                }
                
                await fetchReports(1);

            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Error Initializing Dashboard', description: error.message });
                setShowUploader(true);
            } finally {
                setIsLoading(false);
            }
        };
    
        loadInitialData();
    }, [toast, fetchReports]);


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

            if (!uploadedJson || !Array.isArray(uploadedJson) || uploadedJson.length === 0) {
                 throw new Error("JSON file must be a non-empty array of test results.");
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
            await fetchReports(1);
            setCurrentPage(1);
            setShowUploader(false);
            
        } catch (error: any) {
            console.error("Error processing JSON report:", error);
            toast({
                variant: 'destructive',
                title: 'Error Loading Report',
                description: error.message || 'Could not parse the JSON file. Please ensure it is a valid Selenium report.',
            });
        }
    }, [toast, user, fetchReports]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedReportIds(processedReports.map(r => r.id));
        } else {
            setSelectedReportIds([]);
        }
    };
    
    const handleSelectRow = (reportId: string, checked: boolean) => {
        if (checked) {
            setSelectedReportIds(prev => [...prev, reportId]);
        } else {
            setSelectedReportIds(prev => prev.filter(id => id !== reportId));
        }
    };

    /**
     * Consolidates a list of reports into a single ReportSummary.
     * Logic:
     * - For each unique scenario (grouped by jobName + scenarioName):
     * - If it passed in any execution, mark as Passed (and use data from the latest successful execution).
     * - If it failed in ALL executions, mark as Failed (and use data from the latest run).
     */
    const consolidateReports = useCallback((reportsToConsolidate: ReportSummary[], id: string, title: string, jobDesc: string) => {
        if (reportsToConsolidate.length === 0) return null;

        // Sort by execution date ascending (oldest to newest) to process history in order
        const sorted = [...reportsToConsolidate].sort((a, b) => {
            const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
            const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
            return dateA - dateB;
        });

        const scenarioRegistry = new Map<string, { summary: DetailedScenario, raw: { feature: Feature, scenario: Scenario } }>();
        let totalExecutionTime = 0;

        sorted.forEach(report => {
            totalExecutionTime += report.totalExecutionTime;
            
            // Map raw report results for easy lookup
            const rawScenarioMap = new Map<string, { feature: Feature, scenario: Scenario }>();
            report.rawReport.test_results?.forEach(feature => {
                feature.elements?.forEach(scenario => {
                    rawScenarioMap.set(scenario.name, { feature, scenario });
                });
            });

            report.scenarios.forEach(sc => {
                const key = `${report.jobName}|${sc.name}`;
                const existing = scenarioRegistry.get(key);
                const rawData = rawScenarioMap.get(sc.name);

                if (!rawData) return;

                if (!existing) {
                    scenarioRegistry.set(key, { summary: sc, raw: rawData });
                } else {
                    // Logic: 
                    // 1. If current scenario passed, it becomes the definitive result (even if a later one fails)
                    // 2. If existing was already passed and current passes too, update to current (latest pass)
                    // 3. If current failed and existing was failed, update to current (latest fail)
                    if (sc.status === 'passed') {
                        scenarioRegistry.set(key, { summary: sc, raw: rawData });
                    } else if (sc.status === 'failed' && existing.summary.status === 'failed') {
                        scenarioRegistry.set(key, { summary: sc, raw: rawData });
                    }
                }
            });
        });

        const consolidatedScenarios = Array.from(scenarioRegistry.values());
        const uniqueSummaries = consolidatedScenarios.map(v => v.summary);
        const passedCount = uniqueSummaries.filter(s => s.status === 'passed').length;
        const failedCount = uniqueSummaries.length - passedCount;

        const consolidatedFeatures: Feature[] = [];
        consolidatedScenarios.forEach(({ raw }) => {
            let existingFeature = consolidatedFeatures.find(f => f.name === raw.feature.name);
            if (!existingFeature) {
                existingFeature = { ...raw.feature, elements: [] };
                consolidatedFeatures.push(existingFeature);
            }
            existingFeature.elements.push(raw.scenario);
        });

        return {
            id,
            solution: title,
            jobName: jobDesc,
            totalTests: uniqueSummaries.length,
            passed: passedCount,
            failed: failedCount,
            scenarios: uniqueSummaries,
            totalExecutionTime,
            rawReport: {
                _id: id,
                fileName: id,
                solution: title,
                environment: "consolidated",
                Config: "consolidated",
                "Report Path": "N/A",
                test_results: consolidatedFeatures,
                uploaderId: "",
                uploadedAt: new Date().toISOString(),
            },
            domain: title,
            environment: "Consolidated",
            uploadedAt: new Date().toISOString(),
        } as ReportSummary;
    }, []);
    
    const consolidatedReport = useMemo((): ReportSummary | null => {
        if (selectedReportIds.length === 0) return null;
        const selected = processedReports.filter(r => selectedReportIds.includes(r.id));
        return consolidateReports(selected, "consolidated-selection", "Selected Consolidated Report", `${selected.length} Reports Combined`);
    }, [selectedReportIds, processedReports, consolidateReports]);

    const domainConsolidatedReports = useMemo((): ReportSummary[] => {
        if (processedReports.length === 0) return [];
        const domains = Array.from(new Set(processedReports.map(r => r.domain)));
        
        return domains.map(domain => {
            let domainReports = processedReports.filter(r => r.domain === domain);
            
            // Apply date filter if set for this domain
            const range = domainDateRanges[domain];
            if (range?.from) {
                domainReports = domainReports.filter(r => {
                    if (!r.uploadedAt) return false;
                    const reportDate = new Date(r.uploadedAt);
                    const fromDate = new Date(range.from!);
                    fromDate.setHours(0, 0, 0, 0);
                    
                    if (range.to) {
                        const toDate = new Date(range.to);
                        toDate.setHours(23, 59, 59, 999);
                        return reportDate >= fromDate && reportDate <= toDate;
                    }
                    return reportDate >= fromDate;
                });
            }

            if (domainReports.length === 0) return null;

            return consolidateReports(domainReports, `consolidated-domain-${domain}`, domain, `Domain Consolidated Report`);
        }).filter((r): r is ReportSummary => r !== null);
    }, [processedReports, consolidateReports, domainDateRanges]);
    
    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        fetchReports(newPage);
    }

    const totalPages = Math.ceil(totalReports / PAGE_SIZE);

    if (isLoading && currentPage === 1) {
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
                <h2 className="text-2xl font-bold">Selenium Dashboard</h2>
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

            {domainConsolidatedReports.length > 0 && (
                <Card className='bg-muted/30'>
                    <CardHeader className="flex flex-row items-start justify-between space-y-0">
                        <div className="space-y-1.5">
                            <div className='flex items-center gap-2'>
                                <Layers className='h-5 w-5 text-primary' />
                                <CardTitle>Domain-wise Consolidated Reports</CardTitle>
                            </div>
                            <CardDescription>
                                Aggregated results per domain. Logic: Latest "Passed" status is prioritized for each scenario.
                            </CardDescription>
                        </div>
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" title="Configure Domain Date Ranges">
                                    <Settings className="h-5 w-5" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>Configure Domain Date Ranges</DialogTitle>
                                    <DialogDescription>
                                        Set specific date ranges for each domain to consolidate reports within those periods.
                                    </DialogDescription>
                                </DialogHeader>
                                <ScrollArea className="max-h-[60vh] pr-4">
                                    <div className="space-y-6 py-4">
                                        {Array.from(new Set(processedReports.map(r => r.domain))).sort().map(domain => (
                                            <div key={domain} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 last:border-0">
                                                <div className="font-medium text-sm min-w-[120px]">{domain}</div>
                                                <DateRangePicker 
                                                    date={domainDateRanges[domain]} 
                                                    onDateChange={(range) => setDomainDateRange(domain, range)} 
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                                <DialogFooter>
                                    <Button variant="outline" onClick={resetAllRanges}>Reset All Ranges</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {domainConsolidatedReports.map(report => (
                                <Card key={report.id} className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-lg truncate" title={report.domain}>{report.domain}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="space-y-1 grow">
                                                <p className="text-xs text-muted-foreground flex items-center justify-between gap-4">
                                                    <span>Total:</span> 
                                                    <span className='font-semibold text-foreground'>{report.totalTests}</span>
                                                </p>
                                                <p className="text-xs text-green-600 flex items-center justify-between gap-4">
                                                    <span>Passed:</span>
                                                    <span className='font-bold'>{report.passed}</span>
                                                </p>
                                                <p className="text-xs text-red-600 flex items-center justify-between gap-4">
                                                    <span>Failed:</span>
                                                    <span className='font-bold'>{report.failed}</span>
                                                </p>
                                            </div>
                                            <SmallStatusChart passed={report.passed} failed={report.failed} size={80} />
                                        </div>
                                    </CardContent>
                                    <CardFooter className="pt-2">
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" size="sm" className="w-full text-xs h-8">View Details</Button>
                                            </DialogTrigger>
                                            <DetailModal report={report} jiraLink={jiraLink} allProcessedReports={processedReports} />
                                        </Dialog>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-4">
                        <CardTitle>Individual Reports</CardTitle>
                        {selectedReportIds.length > 0 && consolidatedReport && (
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button size="sm">
                                        View Consolidated Report ({selectedReportIds.length})
                                    </Button>
                                </DialogTrigger>
                                <DetailModal report={consolidatedReport} jiraLink={jiraLink} allProcessedReports={processedReports} />
                            </Dialog>
                        )}
                    </div>
                    <CardDescription>View detailed results for each individual test execution.</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="w-full overflow-hidden rounded-md border">
                        <UITooltipProvider>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[40px]">
                                            <Checkbox
                                                checked={processedReports.length > 0 && selectedReportIds.length === processedReports.length}
                                                onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                                aria-label="Select all rows"
                                            />
                                        </TableHead>
                                        <TableHead>Job Name</TableHead>
                                        <TableHead>Domain</TableHead>
                                        <TableHead>Total</TableHead>
                                        <TableHead>Passed</TableHead>
                                        <TableHead>Failed</TableHead>
                                        <TableHead>Status Chart</TableHead>
                                        <TableHead>Execution Date</TableHead>
                                        <TableHead>Detailed Report</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={9}>
                                                <Skeleton className="h-8 w-full" />
                                            </TableCell>
                                        </TableRow>
                                        ))
                                    ) : processedReports.map(summary => (
                                        <TableRow key={summary.id} data-state={selectedReportIds.includes(summary.id) && "selected"}>
                                            <TableCell>
                                                <Checkbox
                                                    checked={selectedReportIds.includes(summary.id)}
                                                    onCheckedChange={(checked) => handleSelectRow(summary.id, !!checked)}
                                                    aria-label={`Select row ${summary.id}`}
                                                />
                                            </TableCell>
                                            <TableCell className='max-w-xs truncate'>
                                                <UITooltip>
                                                    <UITooltipTrigger asChild>
                                                        <span className="cursor-default">{summary.jobName}</span>
                                                    </UITooltipTrigger>
                                                    <UITooltipContent>
                                                        <p>{summary.jobName}</p>
                                                    </UITooltipContent>
                                                </UITooltip>
                                            </TableCell>
                                            <TableCell>{summary.domain}</TableCell>
                                            <TableCell>{summary.totalTests}</TableCell>
                                            <TableCell className='text-green-600'>{summary.passed}</TableCell>
                                            <TableCell className={cn(summary.failed > 0 ? 'text-destructive' : 'text-muted-foreground')}>{summary.failed}</TableCell>
                                            <TableCell>
                                                <SmallStatusChart passed={summary.passed} failed={summary.failed} />
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-xs">
                                                {summary.uploadedAt ? format(parseISO(summary.uploadedAt), 'MMM d, yyyy') : 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                        <Button variant='link' size="sm">View Details</Button>
                                                    </DialogTrigger>
                                                    <DetailModal report={summary} jiraLink={jiraLink} allProcessedReports={processedReports} />
                                                </Dialog>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </UITooltipProvider>
                    </div>
                     {totalReports === 0 && !isLoading && (
                        <Alert className="mt-4">
                            <AlertTitle>No Reports to Display</AlertTitle>
                            <AlertDescription>
                                No Selenium reports found. Please use the upload button to add one.
                            </AlertDescription>
                        </Alert>
                    )}
                     <div className="mt-4 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                            Showing page {currentPage} of {totalPages} ({totalReports} reports total).
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages || totalPages === 0}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

        </div>
    );
}
