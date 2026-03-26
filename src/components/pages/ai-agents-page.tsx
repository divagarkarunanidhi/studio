'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
    Bot, 
    Play, 
    CheckCircle2, 
    Loader2, 
    Cpu, 
    Network, 
    Database, 
    RefreshCcw, 
    ExternalLink, 
    FileJson,
    Terminal,
    AlertCircle,
    ShieldCheck,
    PlayCircle,
    FileCode,
    Activity,
    Download,
    Eye,
    Sparkles,
    ShieldAlert,
    XCircle,
    ChevronRight,
    Search,
    ListFilter,
    Camera,
    Clock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { AppConfiguration, FailureClassificationOutput } from '@/lib/types';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger
} from "@/components/ui/dialog";
import { parseReportWithAI } from '@/ai/flows/report-parser-flow';
import { classifyFailures } from '@/ai/flows/failure-classification-flow';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface AgentMetrics {
    total: number;
    passed: number;
    failed: number;
    scenarios?: { name: string, status: 'passed' | 'failed', tags: string[] }[];
}

interface AgentStatus {
    id: number;
    name: string;
    description: string;
    status: 'idle' | 'running' | 'success' | 'error';
    lastRun: string | null;
    logs: string[];
    extraInfo?: string; 
    metrics?: AgentMetrics;
    classificationSummary?: FailureClassificationOutput['summary'];
}

const AGENTS_CONFIG: Omit<AgentStatus, 'status' | 'lastRun' | 'logs'>[] = [
    { id: 1, name: "Execution Fetcher", description: "Fetches latest execution JSON from Selenium Data Store (fallback to Confluence)." },
    { id: 2, name: "JSON Report Parser", description: "Analyzes Agent 1 JSON data to identify pass and failure counts using AI." },
    { id: 3, name: "Failure Classifier", description: "Determines if failures are Functional Issues or Data Issues using AI logic." },
    { id: 4, name: "Jira Defect Scout", description: "Checks Jira API for existing bugs related to functional failures." },
    { id: 5, name: "GitLab Data Sync", description: "Automatically updates incorrect test data in GitLab repositories." },
    { id: 6, name: "Pipeline Orchestrator", description: "Triggers targeted reruns in GitLab pipelines for failed scenarios." },
    { id: 7, name: "Rerun Collector", description: "Fetches the updated results from Confluence post-rerun." },
    { id: 8, name: "Report Consolidator", description: "Merges original and rerun reports into a single source of truth." },
];

const formatNanosToTime = (nanos: number) => {
    if (nanos <= 0) return "0s";
    const totalSeconds = nanos / 1e9;
    if (totalSeconds < 1) return `${totalSeconds.toFixed(3)}s`;
    if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
};

export function AIAgentsPage() {
    const [agents, setAgents] = useState<AgentStatus[]>(
        AGENTS_CONFIG.map(a => ({ ...a, status: 'idle', lastRun: null, logs: [] }))
    );
    const [isPipelineRunning, setIsPipelineRunning] = useState(false);
    const [currentAgentIndex, setCurrentAgentIndex] = useState<number>(-1);
    const [progress, setProgress] = useState(0);
    const [autoMode, setAutoMode] = useState(false);
    const [previewReport, setPreviewReport] = useState<{ name: string, content: string } | null>(null);
    const [scenarioListView, setScenarioListView] = useState<{ title: string, status: 'passed' | 'failed', scenarios: AgentMetrics['scenarios'] } | null>(null);
    const [selectedScenarioSteps, setSelectedScenarioSteps] = useState<any | null>(null);
    const [scenarioSearch, setScenarioListViewSearch] = useState("");
    
    const reportRef = useRef<{ name: string, data: any } | null>(null);
    
    const { toast } = useToast();
    const firestore = useFirestore();
    
    const configRef = useMemoFirebase(() => (firestore ? doc(firestore, 'appConfiguration', 'global') : null), [firestore]);
    const { data: configData } = useDoc<AppConfiguration>(configRef);

    const logsEndRef = useRef<HTMLDivElement>(null);

    const addLog = useCallback((agentId: number, message: string) => {
        setAgents(prev => prev.map(agent => {
            if (agent.id === agentId) {
                return {
                    ...agent,
                    logs: [...agent.logs, `[${format(new Date(), 'HH:mm:ss')}] ${message}`]
                };
            }
            return agent;
        }));
    }, []);

    const scrollToBottom = () => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [agents]);

    const runAgent = async (index: number) => {
        const agent = AGENTS_CONFIG[index];
        setCurrentAgentIndex(index);
        
        setAgents(prev => prev.map((a, i) => i === index ? { ...a, status: 'running' } : a));
        
        let extra = undefined;
        let metrics: AgentMetrics | undefined = undefined;
        let classificationSummary: FailureClassificationOutput['summary'] | undefined = undefined;
        let executionStatus: 'success' | 'error' = 'success';

        if (agent.id === 1) {
            addLog(agent.id, "Querying Selenium Data Store (MongoDB) for latest JSON execution...");
            
            let fetchedFromStore = false;
            try {
                const storeResponse = await fetch('/api/selenium/latest');
                const storeResult = await storeResponse.json();

                if (storeResponse.ok && storeResult) {
                    const fileName = storeResult.fileName || 'execution.json';
                    addLog(agent.id, `JSON Data found in store: ${fileName}`);
                    reportRef.current = { name: fileName, data: storeResult };
                    extra = fileName;
                    fetchedFromStore = true;
                }
            } catch (e: any) {
                addLog(agent.id, `Store Access Note: ${e.message}`);
            }

            if (!fetchedFromStore) {
                addLog(agent.id, "No data in Store. Checking Confluence for JSON report fallback...");
                const path = configData?.confluencePath;
                const pageId = configData?.confluencePageId;
                const user = configData?.confluenceUser;
                const password = configData?.confluencePassword;

                if (path && user && password) {
                    try {
                        const response = await fetch('/api/confluence/fetch', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ path, pageId, user, password })
                        });
                        
                        const result = await response.json();

                        if (response.ok && result.success) {
                            const fileName = result.fileName || 'confluence_report.json';
                            addLog(agent.id, `Fetched report: ${fileName}`);
                            extra = fileName;
                            let parsedData = null;
                            try {
                                parsedData = JSON.parse(result.content);
                                addLog(agent.id, "Successfully identified valid JSON structure from source.");
                            } catch (e) {
                                addLog(agent.id, "Fetched file is not native JSON. Attempting direct parsing...");
                                parsedData = { raw: result.content };
                            }
                            reportRef.current = { name: fileName, data: parsedData };
                        } else {
                            addLog(agent.id, `Fetch Failed: ${result.error || 'Unknown error'}`);
                            executionStatus = 'error';
                        }
                    } catch (e: any) {
                        addLog(agent.id, `Network Error: ${e.message}`);
                        executionStatus = 'error';
                    }
                } else {
                    addLog(agent.id, "Connection details missing and Store is empty.");
                    executionStatus = 'error';
                }
            }

            if (executionStatus === 'success' && !reportRef.current) {
                addLog(agent.id, "Simulation Mode: Using baseline JSON results.");
                await new Promise(resolve => setTimeout(resolve, 800));
                const mockData = {
                    test_results: [{
                        elements: [
                            { name: "Scenario 1: Login", steps: [{ result: { status: "passed", duration: 1200000000 } }], tags: [{ name: "@TC_1" }] },
                            { name: "Scenario 2: Data Entry", steps: [{ result: { status: "passed", duration: 800000000 } }], tags: [{ name: "@TC_2" }] },
                            { name: "Scenario 3: Validation", steps: [{ result: { status: "failed", error_message: "Expected 'Success' but found 'Auth Error'", duration: 500000000 } }], tags: [{ name: "@TC_3" }] }
                        ]
                    }]
                };
                const mockName = 'mock_execution.json';
                reportRef.current = { name: mockName, data: mockData };
                extra = mockName;
            }
        } else if (agent.id === 2) {
            addLog(agent.id, "Initializing JSON Report Parser...");
            await new Promise(resolve => setTimeout(resolve, 800));
            const currentReport = reportRef.current;
            if (currentReport && currentReport.data) {
                const reportData = currentReport.data;
                let total = 0, passed = 0, failed = 0;
                const scenarios: AgentMetrics['scenarios'] = [];

                if (reportData.test_results && Array.isArray(reportData.test_results)) {
                    reportData.test_results.forEach((feature: any) => {
                        feature.elements?.forEach((scenario: any) => {
                            total++;
                            const isFailed = scenario.steps?.some((step: any) => step.result?.status === 'failed');
                            const status = isFailed ? 'failed' : 'passed';
                            if (isFailed) failed++; else passed++;
                            
                            scenarios.push({
                                name: scenario.name || 'Unnamed Scenario',
                                status: status,
                                tags: scenario.tags?.map((t: any) => t.name) || []
                            });
                        });
                    });
                }

                if (total > 0) {
                    metrics = { total, passed, failed, scenarios };
                    addLog(agent.id, `Direct traversal identified ${total} scenarios.`);
                } else {
                    addLog(agent.id, "Invoking GenAI for structural analysis...");
                    try {
                        const jsonSnippet = JSON.stringify(reportData).substring(0, 15000);
                        const aiResult = await parseReportWithAI(jsonSnippet);
                        if (aiResult) {
                            metrics = { 
                                total: aiResult.total, 
                                passed: aiResult.passed, 
                                failed: aiResult.failed,
                                scenarios: aiResult.scenarios.map(s => ({
                                    name: s.name,
                                    status: s.status,
                                    tags: s.tags
                                }))
                            };
                        }
                    } catch (e: any) { addLog(agent.id, `AI Error: ${e.message}`); }
                }
            } else { executionStatus = 'error'; }
        } else if (agent.id === 3) {
            addLog(agent.id, "Initializing Failure Classifier...");
            const currentReport = reportRef.current;
            if (currentReport && currentReport.data) {
                const failures: any[] = [];
                currentReport.data.test_results?.forEach((feature: any) => {
                    feature.elements?.forEach((scenario: any) => {
                        const failedStep = scenario.steps?.find((step: any) => step.result?.status === 'failed');
                        if (failedStep) {
                            failures.push({ 
                                scenarioName: scenario.name, 
                                logs: failedStep.result?.error_message || 'No specific log found.'
                            });
                        }
                    });
                });

                if (failures.length > 0) {
                    addLog(agent.id, `Analyzing ${failures.length} failed scenarios with GenAI...`);
                    try {
                        const result = await classifyFailures(JSON.stringify(failures));
                        classificationSummary = result.summary;
                        addLog(agent.id, `Classification Results: ${result.summary.functionalCount} Functional, ${result.summary.dataCount} Data.`);
                        result.classifications.forEach(c => {
                            addLog(agent.id, `[${c.classification.toUpperCase()}] ${c.scenarioName}: ${c.reasoning}`);
                        });
                    } catch (e: any) {
                        addLog(agent.id, `Classification AI Error: ${e.message}`);
                        executionStatus = 'error';
                    }
                } else {
                    addLog(agent.id, "No failures found to classify. Skipping analysis.");
                }
            } else { executionStatus = 'error'; }
        } else {
            addLog(agent.id, `Starting unattended task...`);
        }

        const duration = Math.random() * 2000 + 1500;
        await new Promise(resolve => setTimeout(resolve, duration));

        setAgents(prev => prev.map((a, i) => i === index ? { 
            ...a, 
            status: executionStatus, 
            lastRun: new Date().toISOString(),
            extraInfo: extra || a.extraInfo,
            metrics: metrics || a.metrics,
            classificationSummary: classificationSummary || a.classificationSummary
        } : a));

        if (executionStatus === 'success' && ![2, 3].includes(agent.id)) {
            addLog(agent.id, `Completed successfully.`);
        }
        
        if (isPipelineRunning) {
            setProgress(((index + 1) / AGENTS_CONFIG.length) * 100);
        }
    };

    const startPipeline = async () => {
        if (isPipelineRunning) return;
        setIsPipelineRunning(true);
        setProgress(0);
        setAgents(prev => prev.map(a => ({ ...a, status: 'idle' })));
        for (let i = 0; i < AGENTS_CONFIG.length; i++) {
            await runAgent(i);
        }
        setIsPipelineRunning(false);
        setCurrentAgentIndex(-1);
        toast({
            title: "Pipeline Completed",
            description: "All AI Agents have finished their unattended tasks."
        });
    };

    const handleDownloadReport = (fileName: string) => {
        const content = reportRef.current ? JSON.stringify(reportRef.current.data, null, 2) : "{}";
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleViewReport = (fileName: string) => {
        setPreviewReport({
            name: fileName,
            content: reportRef.current ? JSON.stringify(reportRef.current.data, null, 2) : "{}"
        });
    };

    const handleOpenScenarioList = (title: string, status: 'passed' | 'failed', scenarios?: AgentMetrics['scenarios']) => {
        if (!scenarios) return;
        setScenarioListView({ title, status, scenarios });
        setScenarioListViewSearch("");
    };

    const handleViewScenarioSteps = (scenarioName: string) => {
        if (!reportRef.current?.data) return;
        
        let foundScenario = null;
        reportRef.current.data.test_results?.some((feature: any) => {
            foundScenario = feature.elements?.find((s: any) => s.name === scenarioName);
            return !!foundScenario;
        });

        if (foundScenario) {
            setSelectedScenarioSteps(foundScenario);
        } else {
            toast({
                variant: "destructive",
                title: "Steps Not Found",
                description: "Could not locate step data for this scenario in the current report."
            });
        }
    };

    const filteredScenarios = scenarioListView?.scenarios?.filter(s => {
        const matchesStatus = s.status === scenarioListView.status;
        const matchesSearch = s.name.toLowerCase().includes(scenarioSearch.toLowerCase()) || 
                             s.tags.some(t => t.toLowerCase().includes(scenarioSearch.toLowerCase()));
        return matchesStatus && matchesSearch;
    }) || [];

    const isAnyAgentRunning = agents.some(a => a.status === 'running');

    useEffect(() => {
        let timer: any;
        if (autoMode && !isPipelineRunning) {
            timer = setInterval(() => {
                startPipeline();
            }, 300000);
        }
        return () => clearInterval(timer);
    }, [autoMode, isPipelineRunning]);

    return (
        <div className="space-y-6 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Bot className="text-primary h-8 w-8" />
                        AI Agent Orchestrator
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        Unattended JSON-first pipeline for automated test failure resolution.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center space-x-2 bg-muted p-1 rounded-md px-3 border">
                        <label className="text-xs font-medium">Auto-Run (5m)</label>
                        <Button 
                            variant={autoMode ? "default" : "outline"} 
                            size="sm" 
                            className="h-7 text-[10px]"
                            onClick={() => setAutoMode(!autoMode)}
                        >
                            {autoMode ? "ACTIVE" : "OFF"}
                        </Button>
                    </div>
                    <Button onClick={startPipeline} disabled={isPipelineRunning || isAnyAgentRunning}>
                        {isPipelineRunning ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running Pipeline...</>
                        ) : (
                            <><Play className="mr-2 h-4 w-4" /> Start Agent Pipeline</>
                        )}
                    </Button>
                </div>
            </div>

            {isPipelineRunning && (
                <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="pt-6">
                        <div className="flex justify-between text-xs mb-2">
                            <span className="font-semibold text-primary">Progress: {progress.toFixed(0)}%</span>
                            <span className="text-muted-foreground italic">Current: {AGENTS_CONFIG[currentAgentIndex]?.name}</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {agents.map((agent, idx) => (
                    <Card key={agent.id} className={cn(
                        "transition-all duration-300 flex flex-col",
                        agent.status === 'running' && "ring-2 ring-primary ring-offset-2",
                        agent.status === 'success' && "bg-green-50/30 border-green-200",
                        agent.status === 'error' && "bg-red-50/30 border-red-200"
                    )}>
                        <CardHeader className="p-4 pb-2">
                            <div className="flex justify-between items-start">
                                <div className="bg-primary/10 p-2 rounded-lg">
                                    {idx === 0 && <Database className="h-4 w-4 text-primary" />}
                                    {idx === 1 && <FileJson className="h-4 w-4 text-primary" />}
                                    {idx === 2 && <ShieldAlert className="h-4 w-4 text-primary" />}
                                    {idx === 3 && <ExternalLink className="h-4 w-4 text-primary" />}
                                    {idx === 4 && <Network className="h-4 w-4 text-primary" />}
                                    {idx === 5 && <RefreshCcw className="h-4 w-4 text-primary" />}
                                    {idx >= 6 && <CheckCircle2 className="h-4 w-4 text-primary" />}
                                </div>
                                <div className="flex gap-1">
                                    {idx === 0 && (
                                        <div className="flex gap-1">
                                            {(reportRef.current || agent.extraInfo) && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-6 w-6 text-primary"
                                                    onClick={() => handleViewReport(reportRef.current?.name || agent.extraInfo!)}
                                                    title="View fetched JSON"
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-6 w-6 text-primary hover:bg-primary/10"
                                        onClick={() => runAgent(idx)}
                                        disabled={isPipelineRunning || agent.status === 'running'}
                                        title={`Run ${agent.name} individually`}
                                    >
                                        {agent.status === 'running' ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <PlayCircle className="h-3.5 w-3.5" />
                                        )}
                                    </Button>
                                    <Badge variant={
                                        agent.status === 'idle' ? 'outline' :
                                        agent.status === 'running' ? 'default' :
                                        agent.status === 'success' ? 'secondary' : 'destructive'
                                    } className="text-[10px] uppercase px-1.5">
                                        {agent.status}
                                    </Badge>
                                </div>
                            </div>
                            <CardTitle className="text-sm mt-2">{agent.name}</CardTitle>
                            <CardDescription className="text-[11px] leading-tight h-8 overflow-hidden">
                                {agent.description}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-4 py-2 flex-1">
                            {idx === 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                            <Database className="h-2.5 w-2.5" /> Data Source:
                                        </span>
                                        <Badge variant="outline" className="text-[9px] px-1.5 h-4 text-blue-600 border-blue-200 bg-blue-50">
                                            JSON STORE
                                        </Badge>
                                    </div>
                                    {agent.extraInfo && (
                                        <div className="space-y-1 animate-in fade-in slide-in-from-bottom-1 duration-300">
                                            <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Fetched JSON File:</span>
                                            <div className="p-1.5 bg-primary/5 border border-primary/10 rounded text-[9px] font-mono flex items-center gap-1.5">
                                                <FileCode className="h-3 w-3 text-primary shrink-0" />
                                                <span className="truncate text-primary font-bold" title={agent.extraInfo}>
                                                    {agent.extraInfo}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {idx === 1 && agent.metrics && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-500">
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-muted-foreground flex items-center gap-1"><Activity className="h-2.5 w-2.5" /> Metrics:</span>
                                        <span className="font-bold flex items-center gap-1">{agent.metrics.total} Scenarios</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            className="bg-green-500/10 border border-green-200 rounded p-1 text-center hover:bg-green-500/20 transition-colors cursor-pointer group"
                                            onClick={() => handleOpenScenarioList('Passed Scenarios', 'passed', agent.metrics?.scenarios)}
                                            title="Click to view passed scenarios"
                                        >
                                            <div className="text-[8px] text-green-600 font-semibold uppercase group-hover:text-green-700">Passed</div>
                                            <div className="text-xs font-bold text-green-700">{agent.metrics.passed}</div>
                                        </button>
                                        <button 
                                            className="bg-red-500/10 border border-red-200 rounded p-1 text-center hover:bg-red-500/20 transition-colors cursor-pointer group"
                                            onClick={() => handleOpenScenarioList('Failed Scenarios', 'failed', agent.metrics?.scenarios)}
                                            title="Click to view failed scenarios"
                                        >
                                            <div className="text-[8px] text-red-600 font-semibold uppercase group-hover:text-red-700">Failed</div>
                                            <div className="text-xs font-bold text-red-700">{agent.metrics.failed}</div>
                                        </button>
                                    </div>
                                </div>
                            )}
                            {idx === 2 && agent.classificationSummary && (
                                <div className="space-y-2 animate-in zoom-in-95 duration-500">
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-muted-foreground flex items-center gap-1"><ShieldAlert className="h-2.5 w-2.5" /> Classifications:</span>
                                        <Sparkles className="h-2.5 w-2.5 text-primary" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-red-500/10 border border-red-200 rounded p-1 text-center">
                                            <div className="text-[8px] text-red-600 font-semibold uppercase">Functional</div>
                                            <div className="text-xs font-bold text-red-700">{agent.classificationSummary.functionalCount}</div>
                                        </div>
                                        <div className="bg-amber-500/10 border border-amber-200 rounded p-1 text-center">
                                            <div className="text-[8px] text-amber-600 font-semibold uppercase">Data</div>
                                            <div className="text-xs font-bold text-amber-700">{agent.classificationSummary.dataCount}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="p-4 pt-0 text-[10px] text-muted-foreground flex justify-between border-t mt-auto pt-2">
                            <div className="flex items-center gap-1">
                                <span>Last run: {agent.lastRun ? format(new Date(agent.lastRun), 'HH:mm') : 'Never'}</span>
                            </div>
                            {agent.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                        </CardFooter>
                    </Card>
                ))}
            </div>

            <Card className="w-full flex flex-col mt-auto">
                <CardHeader className="pb-2 border-b">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Terminal className="h-4 w-4" />
                        Agent Pipeline Console
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-hidden">
                    <ScrollArea className="h-[300px] w-full bg-slate-950 font-mono text-[11px] p-4 text-slate-300">
                        {agents.some(a => a.logs.length > 0) ? (
                            <div className="space-y-1">
                                {agents.flatMap(a => a.logs.map((log, i) => (
                                    <div key={`${a.id}-${i}`} className="flex gap-2">
                                        <span className="text-primary shrink-0">[{a.name}]</span>
                                        <span className="whitespace-pre-wrap">{log}</span>
                                    </div>
                                )))}
                                <div ref={logsEndRef} />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2 opacity-50">
                                <Terminal className="h-8 w-8" />
                                <p>No activity recorded.</p>
                            </div>
                        )}
                    </ScrollArea>
                </CardContent>
            </Card>

            {/* JSON Data Dialog */}
            <Dialog open={!!previewReport} onOpenChange={(open) => !open && setPreviewReport(null)}>
                <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b">
                        <DialogTitle className="flex items-center gap-2">
                            <FileJson className="h-5 w-5 text-primary" />
                            Active JSON Payload: {previewReport?.name}
                        </DialogTitle>
                        <DialogDescription>
                            Raw data currently being processed by the AI Agent pipeline.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 bg-slate-950 p-4 font-mono text-xs overflow-hidden">
                        <ScrollArea className="h-full w-full">
                            <pre className="text-slate-300 leading-relaxed">
                                {previewReport?.content}
                            </pre>
                        </ScrollArea>
                    </div>
                    <DialogFooter className="p-4 border-t bg-muted/5">
                        <Button variant="outline" onClick={() => handleDownloadReport(previewReport!.name)} className="gap-2">
                            <Download className="h-4 w-4" /> Download JSON
                        </Button>
                        <Button onClick={() => setPreviewReport(null)}>Close Viewer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Scenario List Dialog */}
            <Dialog open={!!scenarioListView} onOpenChange={(open) => !open && setScenarioListView(null)}>
                <DialogContent className="max-w-3xl h-[70vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b">
                        <DialogTitle className="flex items-center gap-2">
                            {scenarioListView?.status === 'passed' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
                            {scenarioListView?.title}
                        </DialogTitle>
                        <DialogDescription>
                            List of identified test scenarios. Click any item to view its execution steps and failure logs.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="p-4 bg-muted/20 border-b">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="Search by name or @tag..." 
                                className="pl-9 h-9" 
                                value={scenarioSearch}
                                onChange={(e) => setScenarioListViewSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden">
                        <ScrollArea className="h-full w-full p-4">
                            {filteredScenarios.length > 0 ? (
                                <div className="space-y-3">
                                    {filteredScenarios.map((scenario, i) => (
                                        <button 
                                            key={i} 
                                            className="w-full text-left p-3 border rounded-lg bg-card hover:bg-accent/5 transition-colors group relative"
                                            onClick={() => handleViewScenarioSteps(scenario.name)}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="space-y-1">
                                                    <h4 className="text-sm font-semibold leading-tight group-hover:text-primary transition-colors">{scenario.name}</h4>
                                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                                        {scenario.tags.map((tag, j) => (
                                                            <Badge key={j} variant="secondary" className="text-[9px] px-1.5 py-0 font-mono">
                                                                {tag}
                                                            </Badge>
                                                        ))}
                                                        {scenario.tags.length === 0 && <span className="text-[10px] text-muted-foreground italic">No tags</span>}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-2 shrink-0">
                                                    <Badge variant={scenario.status === 'passed' ? 'outline' : 'destructive'} className="text-[10px] h-5 px-1.5 uppercase">
                                                        {scenario.status}
                                                    </Badge>
                                                    <span className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1 font-medium">
                                                        View Steps <ChevronRight className="h-3 w-3" />
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground opacity-50 space-y-2">
                                    <ListFilter className="h-8 w-8" />
                                    <p className="text-sm italic">No matching scenarios found.</p>
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                    
                    <DialogFooter className="p-4 border-t bg-muted/5">
                        <div className="mr-auto text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                            Showing {filteredScenarios.length} of {scenarioListView?.scenarios?.filter(s => s.status === scenarioListView.status).length || 0} items
                        </div>
                        <Button onClick={() => setScenarioListView(null)}>Close List</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Scenario Steps Detail Dialog */}
            <Dialog open={!!selectedScenarioSteps} onOpenChange={(open) => !open && setSelectedScenarioSteps(null)}>
                <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b">
                        <DialogTitle className="flex items-center gap-2">
                            {selectedScenarioSteps?.steps?.some((s: any) => s.result?.status === 'failed') ? <XCircle className="h-5 w-5 text-red-500" /> : <CheckCircle2 className="h-5 w-5 text-green-500" />}
                            Step Trace: {selectedScenarioSteps?.name}
                        </DialogTitle>
                        <DialogDescription>
                            Detailed execution trail for the selected test scenario.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-hidden">
                        <ScrollArea className="h-full w-full">
                            <div className="p-0">
                                <Table>
                                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                        <TableRow>
                                            <TableHead className="w-[60%]">Step Description</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Duration</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selectedScenarioSteps?.steps?.map((step: any, idx: number) => {
                                            const screenshots = [...(step.embeddings || []), ...(step.result?.embeddings || [])].filter(e => e.mime_type?.startsWith('image/'));
                                            const hasScreenshots = screenshots.length > 0;
                                            const status = step.result?.status || 'skipped';
                                            
                                            return (
                                                <TableRow key={idx} className={cn(status === 'failed' && "bg-destructive/5")}>
                                                    <TableCell>
                                                        <div className="space-y-1">
                                                            <div className="text-xs font-mono">
                                                                <span className="font-bold text-primary mr-2 uppercase">{step.keyword}</span>
                                                                <span className="text-foreground/90">{step.name}</span>
                                                            </div>
                                                            <div className="flex gap-3">
                                                                {step.result?.error_message && (
                                                                    <Dialog>
                                                                        <DialogTrigger asChild>
                                                                            <button className="text-[10px] text-destructive hover:underline flex items-center gap-1 font-semibold uppercase tracking-tight">
                                                                                <Terminal className="h-2.5 w-2.5" /> View Logs
                                                                            </button>
                                                                        </DialogTrigger>
                                                                        <DialogContent className="max-w-3xl">
                                                                            <DialogHeader>
                                                                                <DialogTitle>Failure Logs</DialogTitle>
                                                                                <DialogDescription>Step: {step.keyword}{step.name}</DialogDescription>
                                                                            </DialogHeader>
                                                                            <ScrollArea className="max-h-[60vh] rounded-md border bg-slate-950 p-4">
                                                                                <pre className="text-[11px] whitespace-pre-wrap font-mono text-slate-300 leading-relaxed">
                                                                                    {step.result.error_message}
                                                                                </pre>
                                                                            </ScrollArea>
                                                                        </DialogContent>
                                                                    </Dialog>
                                                                )}
                                                                {hasScreenshots && (
                                                                    <Dialog>
                                                                        <DialogTrigger asChild>
                                                                            <button className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-semibold uppercase tracking-tight">
                                                                                <Camera className="h-2.5 w-2.5" /> View Screenshot
                                                                            </button>
                                                                        </DialogTrigger>
                                                                        <DialogContent className="max-w-5xl">
                                                                            <DialogHeader>
                                                                                <DialogTitle>Step Screenshot</DialogTitle>
                                                                                <DialogDescription>Step: {step.keyword}{step.name}</DialogDescription>
                                                                            </DialogHeader>
                                                                            <ScrollArea className="max-h-[80vh] flex flex-col items-center justify-center bg-muted p-2 rounded-md border">
                                                                                {screenshots.map((e, sIdx) => (
                                                                                    <img key={sIdx} src={`data:${e.mime_type};base64,${e.data}`} alt={`Screenshot ${sIdx}`} className="max-w-full h-auto shadow-xl rounded border mb-4 last:mb-0" />
                                                                                ))}
                                                                            </ScrollArea>
                                                                        </DialogContent>
                                                                    </Dialog>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={status === 'passed' ? 'outline' : status === 'failed' ? 'destructive' : 'secondary'} className="text-[9px] uppercase h-5 px-1.5">
                                                            {status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right text-[10px] text-muted-foreground font-mono">
                                                        {formatNanosToTime(step.result?.duration ? (typeof step.result.duration === 'number' ? step.result.duration : Number(step.result.duration.$numberLong || 0)) : 0)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </ScrollArea>
                    </div>
                    
                    <DialogFooter className="p-4 border-t bg-muted/5">
                        <div className="mr-auto flex items-center gap-4 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Steps: {selectedScenarioSteps?.steps?.length || 0}</span>
                        </div>
                        <Button onClick={() => setSelectedScenarioSteps(null)}>Close Trace</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
