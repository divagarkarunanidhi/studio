
'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { AppConfiguration, Defect } from '@/lib/types';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { FileUploader } from '../ui/file-uploader';
import { Loader2, Upload, ChevronDown, ChevronRight, CheckCircle, XCircle, Clock, Download, GitCompareArrows, TrendingUp, TrendingDown } from 'lucide-react';
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
      return 0;
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
    if (nanos === 0) return "0s";
    const seconds = nanos / 1e9;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
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

const SmallStatusChart = ({ passed, failed }: { passed: number; failed: number }) => {
    const data = [
        { name: 'Passed', value: passed, fill: '#22c55e' }, // Green
        { name: 'Failed', value: failed, fill: '#ef4444' }, // Red
    ].filter(d => d.value > 0);

    if (data.length === 0) return <div className="h-8 w-8 bg-muted rounded-full" />;

    return (
        <div className="h-8 w-8 flex items-center justify-center">
            <ChartContainer config={{}} className="h-full w-full">
                <PieChart width={32} height={32}>
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
                        outerRadius={14}
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
        if (report.id === 'consolidated') return false;
        
        const reportsForSameJob = allProcessedReports.filter(p => p.jobName === report.jobName && p.id !== 'consolidated');
        if (reportsForSameJob.length <= 1) return false;

        const mostRecentReport = reportsForSameJob.sort((a,b) => {
            const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
            const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
            return dateB - dateA;
        })[0];

        return mostRecentReport.id === report.id;
    }, [report, allProcessedReports]);

    const comparisonData = useMemo(() => {
        if (report.id === 'consolidated' || !isMostRecentReport) return null;

        const previousRuns = allProcessedReports
            .filter(p => p.jobName === report.jobName && p.id !== 'consolidated' && p.uploadedAt && report.uploadedAt && new Date(p.uploadedAt) < new Date(report.uploadedAt))
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
        { name: 'Passed', value: report.passed, fill: 'hsl(var(--chart-1))' },
        { name: 'Failed', value: report.failed, fill: 'hsl(var(--chart-2))' },
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
                    Job: {report.jobName} | Environment: {report.environment} | Run on: {report.uploadedAt ? format(parseISO(report.uploadedAt), "MMM d, yyyy 'at' h:mm a") : 'N/A'}
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
    const [jiraLink, setJiraLink] = useState<string>("");
    const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);

    useEffect(() => {
        const fetchConfig = async () => {
            if (!firestore) return;
            const configRef = doc(firestore, 'appConfiguration', 'global');
            const configSnap = await getDoc(configRef);
            if (configSnap.exists()) {
                const configData = configSnap.data() as AppConfiguration;
                setJiraLink(configData.jiraLink);
            }
        };
        fetchConfig();
    }, [firestore]);

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
    
    const consolidatedReport = useMemo((): ReportSummary | null => {
        if (selectedReportIds.length === 0) return null;
    
        const selected = processedReports.filter(r => selectedReportIds.includes(r.id));
        if (selected.length === 0) return null;
    
        const emptyAcc: ReportSummary = {
            id: "consolidated",
            solution: "Consolidated Report",
            jobName: `${selected.length} Reports Combined`,
            totalTests: 0,
            passed: 0,
            failed: 0,
            scenarios: [],
            totalExecutionTime: 0,
            rawReport: {
                _id: "consolidated",
                fileName: "consolidated",
                solution: "consolidated",
                environment: "consolidated",
                Config: "consolidated",
                "Report Path": "N/A",
                test_results: [],
                uploaderId: "",
                uploadedAt: new Date().toISOString(),
            },
            domain: "Consolidated",
            environment: "Consolidated",
            uploadedAt: new Date().toISOString(),
        };
    
        const consolidated = selected.reduce((acc, report) => {
            acc.totalTests += report.totalTests;
            acc.passed += report.passed;
            acc.failed += report.failed;
            acc.totalExecutionTime += report.totalExecutionTime;
            acc.scenarios.push(...report.scenarios);
            
            report.rawReport.test_results.forEach(feature => {
                const existingFeature = acc.rawReport.test_results.find(f => f.uri === feature.uri);
                if (existingFeature) {
                    existingFeature.elements.push(...feature.elements);
                } else {
                    acc.rawReport.test_results.push({ ...feature });
                }
            });
            
            return acc;
        }, emptyAcc);
        
        return consolidated;
    }, [selectedReportIds, processedReports]);
    
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
                <div className='flex items-center gap-4'>
                    <h2 className="text-2xl font-bold">Selenium Executions</h2>
                    {selectedReportIds.length > 0 && consolidatedReport && (
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button>View Consolidated Report ({selectedReportIds.length})</Button>
                            </DialogTrigger>
                            <DetailModal report={consolidatedReport} jiraLink={jiraLink} allProcessedReports={processedReports} />
                        </Dialog>
                    )}
                </div>
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
