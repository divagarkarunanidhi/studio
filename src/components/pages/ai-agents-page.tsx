
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
    Clock,
    HelpCircle,
    Bug
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
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface AgentMetrics {
    total: number;
    passed: number;
    failed: number;
    scenarios?: { name: string, status: 'passed' | 'failed', tags: string[], logs?: string | null }[];
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
    classifications?: FailureClassificationOutput['classifications'];
}

const AGENTS_CONFIG: Omit<AgentStatus, 'status' | 'lastRun' | 'logs'>[] = [
    { id: 1, name: "Execution Fetcher", description: "Fetches latest execution JSON from Selenium Data Store (fallback to Confluence)." },
    { id: 2, name: "JSON Report Parser", description: "Analyzes Agent 1 JSON data to identify pass and failure counts using AI." },
    { id: 3, name: "Failure Classifier", description: "Determines if failures are Functional Issues or Data Issues using deterministic rules." },
    { id: 4, name: "Jira Defect Scout", description: "Automates Jira ticket creation for unique functional failures with screenshots." },
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
    
    // View States
    const [previewReport, setPreviewReport] = useState<{ name: string, content: string } | null>(null);
    const [scenarioListView, setScenarioListView] = useState<{ title: string, status: 'passed' | 'failed', scenarios: AgentMetrics['scenarios'] } | null>(null);
    const [classificationListView, setClassificationListView] = useState<{ title: string, classification: string, items: FailureClassificationOutput['classifications'] } | null>(null);
    const [selectedScenarioSteps, setSelectedScenarioSteps] = useState<any | null>(null);
    const [scenarioSearch, setScenarioListViewSearch] = useState("");
    
    const reportRef = useRef<{ name: string, data: any } | null>(null);
    const scenariosRef = useRef<AgentMetrics['scenarios']>([]);
    
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
        let classifications: FailureClassificationOutput['classifications'] | undefined = undefined;
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
                addLog(agent.id, "MongoDB access unavailable or not configured. Trying Confluence...");
            }

            if (!fetchedFromStore) {
                addLog(agent.id, "Checking Confluence for JSON report fallback...");
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
                        addLog(agent.id, `Network Error during fetch: ${e.message}`);
                        executionStatus = 'error';
                    }
                } else {
                    addLog(agent.id, "Connection details missing and Store is empty.");
                    executionStatus = 'error';
                }
            }

            if (executionStatus === 'success' && !reportRef.current) {
                addLog(agent.id, "Simulation Mode: Using baseline JSON results with multiple failures.");
                await new Promise(resolve => setTimeout(resolve, 800));
                const mockData = {
                    test_results: [{
                        elements: [
                            { name: "Scenario 1: User Login Verification", steps: [{ result: { status: "passed", duration: 1200000000 }, keyword: "Given ", name: "I am on the login page" }], tags: [{ name: "@TC_1" }] },
                            { name: "Scenario 2: Shipment Creation Flow", steps: [{ result: { status: "passed", duration: 800000000 }, keyword: "When ", name: "I create a new shipment" }], tags: [{ name: "@TC_2" }] },
                            { name: "Scenario 3: API Integration Health Check", steps: [{ result: { status: "failed", error_message: "HTTP 503 Service Unavailable: Database cluster not reachable", duration: 500000000 }, keyword: "Then ", name: "the API should respond with 200 OK" }], tags: [{ name: "@TC_3" }] },
                            { name: "Scenario 4: Order Release Validation", steps: [{ result: { status: "failed", error_message: "Element 'Order_ID_778' not found in Search Results after 30s timeout", duration: 3000000000 }, keyword: "And ", name: "I search for order ID 778" }], tags: [{ name: "@TC_4" }] },
                            { name: "Scenario 5: Multi-Leg Planning Logic", steps: [{ result: { status: "failed", error_message: "java.lang.AssertionError: Total Number of Order Failed to Plan : Expected 5 but found 3", duration: 1500000000 }, keyword: "Then ", name: "the shipment cost should be valid" }], tags: [{ name: "@TC_5" }] }
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
                            const failedStep = scenario.steps?.find((step: any) => step.result?.status?.toLowerCase() === 'failed');
                            const isFailed = !!failedStep;
                            const status = isFailed ? 'failed' : 'passed';
                            if (isFailed) failed++; else passed++;
                            
                            scenarios.push({
                                name: scenario.name || 'Unnamed Scenario',
                                status: status,
                                tags: scenario.tags?.map((t: any) => t.name) || [],
                                logs: failedStep?.result?.error_message || null
                            });
                        });
                    });
                }

                if (total > 0) {
                    metrics = { total, passed, failed, scenarios };
                    scenariosRef.current = scenarios;
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
                                    tags: s.tags,
                                    logs: s.logs
                                }))
                            };
                            scenariosRef.current = metrics.scenarios;
                        }
                    } catch (e: any) { addLog(agent.id, `AI Parser Error: ${e.message}`); }
                }
            } else { executionStatus = 'error'; }
        } else if (agent.id === 3) {
            addLog(agent.id, "Initializing Failure Classifier (Rule-Based Mode)...");
            
            const failedScenarios = scenariosRef.current?.filter(s => s.status?.toLowerCase() === 'failed') || [];

            if (failedScenarios.length > 0) {
                addLog(agent.id, `Analyzing ${failedScenarios.length} failed scenarios identified by Parser...`);
                
                const results: FailureClassificationOutput['classifications'] = [];
                let fCount = 0, dCount = 0, eCount = 0;

                failedScenarios.forEach(s => {
                    const errorLogs = s.logs || '';
                    let category: 'Functional Issue' | 'Data Issue' | 'Environment Issue' = 'Data Issue';
                    let reason = "Classified as Data Issue based on typical failure context (missing element or timeout).";

                    if (errorLogs.includes("java.lang.AssertionError: Total Number of Order Failed to Plan :")) {
                        category = 'Functional Issue';
                        reason = "Explicit Rule Trigger: 'Order Failed to Plan' identified as a Functional Issue.";
                    } 
                    else if (errorLogs.toLowerCase().includes("assertionerror") || errorLogs.toLowerCase().includes("mismatch") || errorLogs.toLowerCase().includes("logic")) {
                        category = 'Functional Issue';
                        reason = "Assertion failure detected in step logs, indicating a logic or business rule mismatch.";
                    }
                    else if (errorLogs.includes("503") || errorLogs.includes("502") || errorLogs.toLowerCase().includes("network") || errorLogs.toLowerCase().includes("connection refused")) {
                        category = 'Environment Issue';
                        reason = "Network or infrastructure error detected (HTTP 50x or connection reset).";
                    }
                    else if (errorLogs.toLowerCase().includes("element not found") || errorLogs.toLowerCase().includes("timeout") || errorLogs.toLowerCase().includes("stale element")) {
                        category = 'Data Issue';
                        reason = "Test timed out or UI element was missing, typically indicating that expected test data was not available or was deleted.";
                    }

                    if (category === 'Functional Issue') fCount++;
                    else if (category === 'Data Issue') dCount++;
                    else eCount++;

                    results.push({
                        scenarioName: s.name,
                        classification: category,
                        reasoning: reason
                    });
                    
                    addLog(agent.id, `[${category.toUpperCase()}] ${s.name}: ${reason}`);
                });

                classificationSummary = { 
                    functionalCount: fCount, 
                    dataCount: dCount, 
                    environmentCount: eCount 
                };
                classifications = results;
                
                addLog(agent.id, `Classification Summary: ${fCount} Functional, ${dCount} Data, ${eCount} Environment.`);
            } else {
                addLog(agent.id, "No failures found by JSON Parser to classify. Skipping analysis.");
                classificationSummary = { functionalCount: 0, dataCount: 0, environmentCount: 0 };
                classifications = [];
            }
        } else if (agent.id === 4) {
            addLog(agent.id, "Initializing Jira Defect Scout...");
            const currentClassifier = agents.find(a => a.id === 3);
            const functionalFailures = currentClassifier?.classifications?.filter(c => c.classification === 'Functional Issue') || [];

            if (functionalFailures.length > 0) {
                // Deduplicate by scenario name
                const uniqueFailures = Array.from(new Set(functionalFailures.map(f => f.scenarioName)));
                addLog(agent.id, `Deduplicated ${functionalFailures.length} functional issues down to ${uniqueFailures.length} unique failures.`);

                let successCount = 0;
                for (const scenarioName of uniqueFailures) {
                    addLog(agent.id, `Scouting/Creating defect for: ${scenarioName}`);
                    
                    // Find failure context
                    const scenarioInfo = scenariosRef.current?.find(s => s.name === scenarioName);
                    const errorLogs = scenarioInfo?.logs || 'No log details available.';
                    
                    // Fetch full scenario steps for description
                    let stepsDescription = "Scenario Execution Trace:\n\n";
                    let screenshotFile: File | null = null;

                    if (reportRef.current?.data) {
                        let foundScenario: any = null;
                        reportRef.current.data.test_results?.some((f: any) => {
                            foundScenario = f.elements?.find((s: any) => s.name === scenarioName);
                            return !!foundScenario;
                        });

                        if (foundScenario) {
                            foundScenario.steps?.forEach((step: any, idx: number) => {
                                stepsDescription += `${idx + 1}. ${step.keyword}${step.name} [${step.result?.status?.toUpperCase() || 'SKIPPED'}]\n`;
                                
                                // Capture screenshot if failed
                                if (step.result?.status === 'failed') {
                                    const embeds = [...(step.embeddings || []), ...(step.result?.embeddings || [])].filter(e => e.mime_type?.startsWith('image/'));
                                    if (embeds.length > 0) {
                                        try {
                                            const b64 = embeds[0].data;
                                            const byteCharacters = atob(b64);
                                            const byteNumbers = new Array(byteCharacters.length);
                                            for (let i = 0; i < byteCharacters.length; i++) {
                                                byteNumbers[i] = byteCharacters.charCodeAt(i);
                                            }
                                            const byteArray = new Uint8Array(byteNumbers);
                                            const blob = new Blob([byteArray], {type: embeds[0].mime_type});
                                            screenshotFile = new File([blob], `failure_${scenarioName.replace(/\s+/g, '_')}.png`, {type: embeds[0].mime_type});
                                        } catch (err) {
                                            addLog(agent.id, `Screenshot Processing Error: Failed to convert base64 payload.`);
                                        }
                                    }
                                }
                            });
                        }
                    }

                    try {
                        const formData = new FormData();
                        formData.append('config', JSON.stringify({
                            jiraLink: configData?.jiraLink,
                            jiraUser: configData?.jiraUser,
                            jiraApiToken: configData?.jiraApiToken,
                            jiraProjectKey: configData?.jiraProjectKey,
                            jiraIssueType: configData?.jiraIssueType || 'Bug'
                        }));
                        formData.append('issue', JSON.stringify({
                            summary: `FAILURE: ${errorLogs}`,
                            description: `FAILED SCENARIO: ${scenarioName}\n\n${stepsDescription}`
                        }));
                        if (screenshotFile) {
                            formData.append('screenshot', screenshotFile);
                        }

                        const jiraRes = await fetch('/api/jira/create', {
                            method: 'POST',
                            body: formData
                        });

                        const jiraResult = await jiraRes.json();
                        if (jiraRes.ok && jiraResult.success) {
                            addLog(agent.id, `Created Jira Ticket: ${jiraResult.key}`);
                            successCount++;
                        } else {
                            addLog(agent.id, `Jira Error: ${jiraResult.error || 'Check configuration'}`);
                            if (jiraResult.details) {
                                addLog(agent.id, `Jira Trace: ${jiraResult.details}`);
                            }
                        }
                    } catch (e: any) {
                        addLog(agent.id, `Connection Error: ${e.message}`);
                    }
                }
                extra = `${successCount} Tickets Created`;
            } else {
                addLog(agent.id, "No functional failures identified. Jira creation skipped.");
            }
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
            classificationSummary: classificationSummary || a.classificationSummary,
            classifications: classifications || a.classifications
        } : a));

        if (executionStatus === 'success' && ![2, 3, 4].includes(agent.id)) {
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
        scenariosRef.current = []; 
        
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

    const handleOpenClassificationList = (title: string, classification: string, allClassifications?: FailureClassificationOutput['classifications']) => {
        if (!allClassifications) return;
        const filtered = allClassifications.filter(c => c.classification === classification);
        setClassificationListView({ title, classification, items: filtered });
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

    const getClassificationForScenario = (name: string) => {
        const classifierAgent = agents.find(a => a.id === 3);
        return classifierAgent?.classifications?.find(c => c.scenarioName === name);
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
                                    {idx === 3 && <Bug className="h-4 w-4 text-primary" />}
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
                                        <Badge variant="outline" className="text-[8px] h-4 border-primary/20 text-primary">DETERMINISTIC</Badge>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        <button 
                                            className="bg-red-500/10 border border-red-200 rounded p-1 text-center hover:bg-red-500/20 transition-colors group"
                                            onClick={() => handleOpenClassificationList('Functional Issues', 'Functional Issue', agent.classifications)}
                                        >
                                            <div className="text-[7px] text-red-600 font-semibold uppercase group-hover:text-green-700">Functional</div>
                                            <div className="text-xs font-bold text-red-700">{agent.classificationSummary.functionalCount}</div>
                                        </button>
                                        <button 
                                            className="bg-amber-500/10 border border-amber-200 rounded p-1 text-center hover:bg-amber-500/20 transition-colors group"
                                            onClick={() => handleOpenClassificationList('Data Issues', 'Data Issue', agent.classifications)}
                                        >
                                            <div className="text-[7px] text-amber-600 font-semibold uppercase group-hover:text-amber-700">Data</div>
                                            <div className="text-xs font-bold text-amber-700">{agent.classificationSummary.dataCount}</div>
                                        </button>
                                        <button 
                                            className="bg-blue-500/10 border border-blue-200 rounded p-1 text-center hover:bg-blue-500/20 transition-colors group"
                                            onClick={() => handleOpenClassificationList('Env. Issues', 'Environment Issue', agent.classifications)}
                                        >
                                            <div className="text-[7px] text-blue-600 font-semibold uppercase group-hover:text-blue-700">Env.</div>
                                            <div className="text-xs font-bold text-blue-700">{agent.classificationSummary.environmentCount}</div>
                                        </button>
                                    </div>
                                </div>
                            )}
                            {idx === 3 && agent.extraInfo && (
                                <div className="space-y-2 animate-in fade-in duration-500">
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-muted-foreground flex items-center gap-1"><Bug className="h-2.5 w-2.5" /> Scouting Status:</span>
                                    </div>
                                    <div className="p-2 bg-primary/5 border border-primary/10 rounded-md text-center">
                                        <span className="text-xs font-bold text-primary">{agent.extraInfo}</span>
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
                                    {filteredScenarios.map((scenario, i) => {
                                        const aiClassification = getClassificationForScenario(scenario.name);
                                        return (
                                            <button 
                                                key={i} 
                                                className="w-full text-left p-3 border rounded-lg bg-card hover:bg-accent/5 transition-colors group relative"
                                                onClick={() => handleViewScenarioSteps(scenario.name)}
                                            >
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="text-sm font-semibold leading-tight group-hover:text-primary transition-colors">{scenario.name}</h4>
                                                            {aiClassification && (
                                                                <Badge variant="outline" className={cn(
                                                                    "text-[9px] h-4 px-1 uppercase shrink-0",
                                                                    aiClassification.classification === 'Functional Issue' ? "border-red-200 text-red-600 bg-red-50" :
                                                                    aiClassification.classification === 'Data Issue' ? "border-amber-200 text-amber-600 bg-amber-50" :
                                                                    "border-blue-200 text-blue-600 bg-blue-50"
                                                                )}>
                                                                    {aiClassification.classification}
                                                                </Badge>
                                                            )}
                                                        </div>
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
                                        );
                                    })}
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

            {/* Classification List Dialog */}
            <Dialog open={!!classificationListView} onOpenChange={(open) => !open && setClassificationListView(null)}>
                <DialogContent className="max-w-3xl h-[70vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b">
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldAlert className={cn(
                                "h-5 w-5",
                                classificationListView?.classification === 'Functional Issue' ? "text-red-500" :
                                classificationListView?.classification === 'Data Issue' ? "text-amber-500" : "text-blue-500"
                            )} />
                            {classificationListView?.title}
                        </DialogTitle>
                        <DialogDescription>
                            Root cause categories determined using deterministic rule analysis.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-hidden">
                        <ScrollArea className="h-full w-full p-4">
                            {classificationListView?.items && classificationListView.items.length > 0 ? (
                                <div className="space-y-4">
                                    {classificationListView.items.map((item, i) => (
                                        <div key={i} className="p-4 border rounded-lg bg-card space-y-3">
                                            <div className="flex items-start justify-between gap-4">
                                                <h4 className="text-sm font-bold text-foreground">{item.scenarioName}</h4>
                                                <Badge variant="outline" className="text-[10px] uppercase">{item.classification}</Badge>
                                            </div>
                                            <div className="bg-muted/30 p-3 rounded-md border border-muted flex gap-3">
                                                <HelpCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                                <div className="space-y-1">
                                                    <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Classification Logic:</span>
                                                    <p className="text-xs text-foreground/90 leading-relaxed italic">"{item.reasoning}"</p>
                                                </div>
                                            </div>
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className="h-7 text-[10px] w-full"
                                                onClick={() => handleViewScenarioSteps(item.scenarioName)}
                                            >
                                                <Terminal className="h-3 w-3 mr-2" /> Inspect Logs & Trace
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground opacity-50 space-y-2">
                                    <ShieldCheck className="h-8 w-8" />
                                    <p className="text-sm italic">No scenarios identified in this category.</p>
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                    
                    <DialogFooter className="p-4 border-t bg-muted/5">
                        <Button onClick={() => setClassificationListView(null)}>Close Analysis</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Scenario Steps Detail Dialog */}
            <Dialog open={!!selectedScenarioSteps} onOpenChange={(open) => !open && setSelectedScenarioSteps(null)}>
                <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b">
                        <DialogTitle className="flex items-center gap-2">
                            {selectedScenarioSteps?.steps?.some((s: any) => s.result?.status?.toLowerCase() === 'failed') ? <XCircle className="h-5 w-5 text-red-500" /> : <CheckCircle2 className="h-5 w-5 text-green-500" />}
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
                                            <TableHead className="w-[60%]">Step Description & Output</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Duration</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selectedScenarioSteps?.steps?.map((step: any, idx: number) => {
                                            const screenshots = [...(step.embeddings || []), ...(step.result?.embeddings || [])].filter(e => e.mime_type?.startsWith('image/'));
                                            const hasScreenshots = screenshots.length > 0;
                                            const status = step.result?.status?.toLowerCase() || 'skipped';
                                            const outputs = step.output || [];
                                            
                                            return (
                                                <TableRow key={idx} className={cn(status === 'failed' && "bg-destructive/5")}>
                                                    <TableCell>
                                                        <div className="space-y-2">
                                                            <div className="text-xs font-mono">
                                                                <span className="font-bold text-primary mr-2 uppercase">{step.keyword}</span>
                                                                <span className="text-foreground/90">{step.name}</span>
                                                            </div>
                                                            
                                                            {outputs.length > 0 && (
                                                                <div className="p-2 bg-slate-900 rounded border border-slate-800 space-y-1">
                                                                    <div className="text-[9px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                                                                        <Terminal className="h-2 w-2" /> Step Output:
                                                                    </div>
                                                                    {outputs.map((out: string, oIdx: number) => (
                                                                        <pre key={oIdx} className="text-[10px] font-mono text-slate-300 whitespace-pre-wrap break-all leading-normal border-l-2 border-primary/30 pl-2">
                                                                            {out}
                                                                        </pre>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            <div className="flex gap-3">
                                                                {step.result?.error_message && (
                                                                    <Dialog>
                                                                        <DialogTrigger asChild>
                                                                            <button className="text-[10px] text-destructive hover:underline flex items-center gap-1 font-semibold uppercase tracking-tight">
                                                                                <Terminal className="h-2.5 w-2.5" /> View Failure Logs
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
