
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
    Database, 
    RefreshCcw, 
    FileJson,
    Terminal,
    Eye,
    ShieldAlert,
    XCircle,
    ChevronRight,
    Search,
    ListFilter,
    Camera,
    Clock,
    HelpCircle,
    Bug,
    Settings,
    FlaskConical,
    PlayCircle,
    FileCode,
    Activity,
    Download,
    ListChecks,
    GitBranch,
    MessageSquare,
    Info,
    Plus,
    Trash2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from '@/firebase/firestore-shim';
import type { AppConfiguration, FailureClassificationOutput, FailureRule } from '@/lib/types';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
    DialogClose
} from "@/components/ui/dialog";
import { parseReportWithAI } from '@/ai/flows/report-parser-flow';
import { classifyFailures } from '@/ai/flows/failure-classification-flow';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';

interface AgentMetrics {
    total: number;
    passed: number;
    failed: number;
    scenarios?: { name: string, status: 'passed' | 'failed', tags: string[], logs?: string | null }[];
}

interface ExistingDefect {
    key: string;
    summary: string;
    status: string;
    assignee: string | null;
    priority: string;
    scenarioName: string;
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
    updatedContent?: string; 
    targetFilePath?: string;
    existingDefects?: ExistingDefect[];
}

const AGENTS_CONFIG: Omit<AgentStatus, 'status' | 'lastRun' | 'logs'>[] = [
    { id: 1, name: "Execution Fetcher", description: "Fetches latest execution JSON from Selenium Data Store (fallback to Confluence)." },
    { id: 2, name: "JSON Report Parser", description: "Analyzes Agent 1 JSON data to identify pass and failure counts using AI." },
    { id: 9, name: "Check for Existing Defect", description: "Connects to Jira to find existing linked defects for failed test cases." },
    { id: 3, name: "Failure Classifier", description: "Analyzes failures using AI Analytics and Machine Learning patterns to categorize issues." },
    { id: 4, name: "Data Healing Agent", description: "Identifies test data file and performs OTM date gap auto-healing (Min 4-day gap)." },
    { id: 5, name: "GitLab Data Sync", description: "Automatically commits prepared test data updates back to GitLab repositories." },
    { id: 6, name: "Pipeline Orchestrator", description: "Triggers targeted reruns in GitLab pipelines by calling specified pipeline schedules." },
    { id: 7, name: "Jira Defect Scout", description: "Automates Jira ticket creation for functional failures with steps and screenshots." },
    { id: 8, name: "Notification Trigger", description: "Sends comprehensive pipeline execution summary to Microsoft Teams channel." },
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
    const [isTestingJira, setIsTestingJira] = useState(false);
    const [isTestingJiraSearch, setIsTestingJiraSearch] = useState(false);
    const [isTestingGitlab, setIsTestingGitlab] = useState(false);
    const [isManualCommitting, setIsManualCommitting] = useState(false);
    const [isManualCreatingDefects, setIsManualCreatingDefects] = useState(false);
    const [isTestingTeams, setIsTestingTeams] = useState(false);
    
    // View States
    const [previewReport, setPreviewReport] = useState<{ name: string, content: string } | null>(null);
    const [scenarioListView, setScenarioListView] = useState<{ title: string, status: 'passed' | 'failed', scenarios: AgentMetrics['scenarios'] } | null>(null);
    const [classificationListView, setClassificationListView] = useState<{ title: string, classification: string, items: FailureClassificationOutput['classifications'] } | null>(null);
    const [selectedScenarioSteps, setSelectedScenarioSteps] = useState<any | null>(null);
    const [scenarioSearch, setScenarioListViewSearch] = useState("");
    const [notificationPreview, setNotificationPreview] = useState<any | null>(null);
    
    // Failure Rules Edit State
    const [newPattern, setNewPattern] = useState("");
    const [newCategory, setNewCategory] = useState<'Functional Issue' | 'Data Issue' | 'Environment Issue' | 'Automation script issue'>('Functional Issue');

    const reportRef = useRef<{ name: string, data: any } | null>(null);
    const scenariosRef = useRef<AgentMetrics['scenarios']>([]);
    const classificationsRef = useRef<FailureClassificationOutput['classifications']>([]);
    const existingDefectsRef = useRef<ExistingDefect[]>([]);
    const preparedContentRef = useRef<{ content: string, filePath: string } | null>(null);
    const pendingJiraDefectsRef = useRef<{ summary: string, description: string, screenshot: File | null }[]>([]);
    const agentsRef = useRef<AgentStatus[]>([]);
    const pipelineStartRef = useRef<string | null>(null);
    
    const { toast } = useToast();
    const firestore = useFirestore();
    
    const configRef = useMemoFirebase(() => (firestore ? doc(firestore, 'appConfiguration', 'global') : null), [firestore]);
    const { data: remoteConfigData } = useDoc<AppConfiguration>(configRef);
    const [configOverrides, setConfigOverrides] = useState<Partial<AppConfiguration>>({});
    const configData = useMemo(
        () => (remoteConfigData ? { ...remoteConfigData, ...configOverrides } : remoteConfigData),
        [remoteConfigData, configOverrides]
    );

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
        agentsRef.current = agents;
    }, [agents]);

    const handleUpdateConfig = (key: string, value: any) => {
        if (!configRef) return;
        setConfigOverrides(prev => ({ ...prev, [key]: value }));
        setDocumentNonBlocking(configRef, { [key]: value }, { merge: true });
        toast({
            title: "Settings Updated",
            description: "Configuration has been saved."
        });
    };

    const handleAddFailureRule = () => {
        if (!newPattern) return;
        const currentRules = configData?.failureRules || [];
        const updatedRules = [...currentRules, { pattern: newPattern, category: newCategory }];
        handleUpdateConfig('failureRules', updatedRules);
        setNewPattern("");
    };

    const handleRemoveFailureRule = (index: number) => {
        const currentRules = configData?.failureRules || [];
        const updatedRules = currentRules.filter((_, i) => i !== index);
        handleUpdateConfig('failureRules', updatedRules);
    };

    const handleTestJira = async () => {
        if (!configData?.jiraLink || !configData?.jiraUser || !configData?.jiraApiToken || !configData?.jiraProjectKey) {
            toast({
                variant: "destructive",
                title: "Incomplete Config",
                description: "Please fill in all Jira configuration fields before testing."
            });
            return;
        }

        setIsTestingJira(true);
        try {
            const response = await fetch('/api/jira/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jiraLink: configData.jiraLink,
                    jiraUser: configData.jiraUser,
                    jiraApiToken: configData.jiraApiToken,
                    jiraProjectKey: configData.jiraProjectKey
                })
            });
            
            const result = await response.json();
            if (response.ok) {
                toast({ title: "Test Successful", description: result.message });
            } else {
                toast({ 
                    variant: "destructive", 
                    title: "Test Failed", 
                    description: result.error || "Could not connect to Jira." 
                });
            }
        } catch (e: any) {
            toast({ variant: "destructive", title: "Network Error", description: e.message });
        } finally {
            setIsTestingJira(false);
        }
    };

    const handleTestJiraSearch = async () => {
        const link = configData?.jiraSearchLink;
        const user = configData?.jiraSearchUser;
        const token = configData?.jiraSearchApiToken;
        const project = configData?.jiraSearchProjectKey;
        if (!link || !user || !token || !project) {
            toast({
                variant: "destructive",
                title: "Incomplete Config",
                description: "Please fill in all Jira Search configuration fields before testing."
            });
            return;
        }

        setIsTestingJiraSearch(true);
        try {
            const response = await fetch('/api/jira/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jiraLink: link,
                    jiraUser: user,
                    jiraApiToken: token,
                    jiraProjectKey: project
                })
            });
            const result = await response.json();
            if (response.ok) {
                toast({ title: "Test Successful", description: result.message });
            } else {
                toast({ variant: "destructive", title: "Test Failed", description: result.error || "Could not connect to Jira." });
            }
        } catch (e: any) {
            toast({ variant: "destructive", title: "Network Error", description: e.message });
        } finally {
            setIsTestingJiraSearch(false);
        }
    };

    const handleTestGitlab = async () => {
        if (!configData?.gitlabToken || !configData?.gitlabProjectId) {
            toast({
                variant: "destructive",
                title: "Incomplete Config",
                description: "Please provide GitLab Token and Project ID before testing."
            });
            return;
        }

        setIsTestingGitlab(true);
        try {
            const response = await fetch('/api/gitlab/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: configData.gitlabToken,
                    projectId: configData.gitlabProjectId,
                    baseUrl: configData.gitlabBaseUrl,
                    insecureTls: configData.gitlabInsecureTls ?? false,
                })
            });
            
            const result = await response.json();
            if (response.ok) {
                toast({ title: "GitLab Test Successful", description: result.message });
            } else {
                const parts: string[] = [];
                if (result.error) parts.push(result.error);
                if (result.url) parts.push(`URL: ${result.url}`);
                if (result.cause?.code) parts.push(`Cause: ${result.cause.code}${result.cause.message ? ` - ${result.cause.message}` : ''}`);
                else if (result.code) parts.push(`Code: ${result.code}`);
                if (result.body && typeof result.body === 'object') {
                    try {
                        parts.push(`Body: ${JSON.stringify(result.body)}`);
                    } catch {/* ignore */}
                } else if (typeof result.body === 'string' && result.body.trim()) {
                    parts.push(`Body: ${result.body.substring(0, 500)}`);
                }
                console.error('GitLab test failed:', result);
                toast({
                    variant: "destructive",
                    title: `Test Failed${result.status ? ` (HTTP ${result.status})` : ''}`,
                    description: parts.join('\n') || "Could not connect to GitLab.",
                    duration: 12000,
                });
            }
        } catch (e: any) {
            console.error('GitLab test network error:', e);
            toast({
                variant: "destructive",
                title: "Network Error",
                description: `${e?.name ? `${e.name}: ` : ''}${e?.message || String(e)}`,
                duration: 12000,
            });
        } finally {
            setIsTestingGitlab(false);
        }
    };

    const buildNotificationSummary = useCallback(() => {
        const liveAgents = agentsRef.current.length ? agentsRef.current : agents;
        const reportSrc = reportRef.current;
        const a2 = liveAgents.find(a => a.id === 2);
        const a3 = liveAgents.find(a => a.id === 3);
        const a4 = liveAgents.find(a => a.id === 4);
        const a5 = liveAgents.find(a => a.id === 5);
        const a6 = liveAgents.find(a => a.id === 6);
        const a7 = liveAgents.find(a => a.id === 7);

        const classBuckets: Record<string, number> = {};
        (a3?.classifications || []).forEach(c => {
            const k = c.classification || 'Unclassified';
            classBuckets[k] = (classBuckets[k] || 0) + 1;
        });

        const failedScenarios = (a2?.metrics?.scenarios || [])
            .filter(s => s.status === 'failed')
            .slice(0, 10)
            .map(s => s.name);

        const startedAt = pipelineStartRef.current;
        const finishedAt = new Date().toISOString();
        const durationMs = startedAt ? (Date.now() - new Date(startedAt).getTime()) : null;

        return {
            solution: reportSrc?.data?.solution || "Project Alpha",
            reportName: reportSrc?.name,
            startedAt,
            finishedAt,
            durationMs,
            total: a2?.metrics?.total ?? 0,
            passed: a2?.metrics?.passed ?? 0,
            failed: a2?.metrics?.failed ?? 0,
            classificationCounts: classBuckets,
            classificationSummary: a3?.classificationSummary,
            failedScenarios,
            preparedDataFile: a4?.targetFilePath || preparedContentRef.current?.filePath || null,
            preparedDataInfo: a4?.extraInfo || null,
            gitlabUpdates: parseInt(a5?.extraInfo || "0") || 0,
            gitlabCommitInfo: a5?.extraInfo || null,
            orchestratorStatus: a6?.extraInfo || 'Not Triggered',
            pipelineUrl: (a6?.logs || []).find(l => l.includes('URL:'))?.replace(/.*URL:\s*/, '') || null,
            jiraStatus: a7?.extraInfo || 'Skipped',
            agents: liveAgents.map(a => ({
                id: a.id,
                name: a.name,
                status: a.status,
                lastRun: a.lastRun,
                extraInfo: a.extraInfo || null,
                metrics: a.metrics ? {
                    total: a.metrics.total,
                    passed: a.metrics.passed,
                    failed: a.metrics.failed,
                } : null,
                recentLogs: (a.logs || []).slice(-5),
            })),
        };
    }, [agents]);

    const handleTestTeams = async () => {
        if (!configData?.teamsWebhookUrl) {
            toast({ variant: "destructive", title: "Incomplete Config", description: "Please provide a Teams Webhook URL." });
            return;
        }
        setIsTestingTeams(true);
        try {
            const response = await fetch('/api/notifications/teams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    webhookUrl: configData.teamsWebhookUrl,
                    summary: {
                        solution: "TEST PROJECT",
                        total: 10, passed: 9, failed: 1,
                        jiraStatus: "Test Success",
                        gitlabUpdates: 1,
                        orchestratorStatus: "Test Mode"
                    }
                })
            });
            const result = await response.json();
            if (response.ok) toast({ title: "Teams Test Sent", description: "Please check your Teams channel." });
            else toast({ variant: "destructive", title: "Teams Error", description: result.error });
        } catch (e: any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
        finally { setIsTestingTeams(false); }
    };

    const runAgent = async (index: number) => {
        const agent = AGENTS_CONFIG[index];
        setCurrentAgentIndex(index);
        
        setAgents(prev => prev.map((a, i) => i === index ? { ...a, status: 'running' } : a));
        
        let extra = undefined;
        let metrics: AgentMetrics | undefined = undefined;
        let classificationSummary: FailureClassificationOutput['summary'] | undefined = undefined;
        let classifications: FailureClassificationOutput['classifications'] | undefined = undefined;
        let updatedContent: string | undefined = undefined;
        let targetFilePath: string | undefined = undefined;
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
                    solution: "Simulation Project",
                    test_results: [{
                        elements: [
                            { name: "Scenario 1: User Login Verification", steps: [{ result: { status: "passed", duration: 1200000000 }, keyword: "Given ", name: "I am on the login page", output: ["testDataFile : /taasrunner/builds/dsc-transport-oci/testData/testdata_BACARDI_TEST.json"] }], tags: [{ name: "@TC_1" }] },
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
        } else if (agent.id === 9) {
            addLog(agent.id, "Checking Jira for existing linked defects...");
            const failedScenarios = scenariosRef.current?.filter(s => s.status?.toLowerCase() === 'failed') || [];
            const searchJiraLink = configData?.jiraSearchLink || configData?.jiraLink;
            const searchJiraUser = configData?.jiraSearchUser || configData?.jiraUser;
            const searchJiraToken = configData?.jiraSearchApiToken || configData?.jiraApiToken;
            const searchJiraProject = configData?.jiraSearchProjectKey || configData?.jiraProjectKey;
            if (failedScenarios.length > 0 && searchJiraLink && searchJiraUser && searchJiraToken && searchJiraProject) {
                const existingDefects: ExistingDefect[] = [];
                try {
                    const response = await fetch('/api/jira/search-defects', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jiraLink: searchJiraLink,
                            jiraUser: searchJiraUser,
                            jiraApiToken: searchJiraToken,
                            jiraProjectKey: searchJiraProject,
                            scenarioNames: failedScenarios.map(s => {
                                // Include tags in the name so the API can extract Jira keys from them
                                const tagStr = (s.tags || []).join(' ');
                                return tagStr ? `${s.name} ${tagStr}` : s.name;
                            })
                        })
                    });
                    const result = await response.json();
                    if (response.ok && result.defects) {
                        const solutionName = (reportRef.current?.data?.solution || '').toLowerCase();
                        result.defects.forEach((d: any) => {
                            // Only consider defects whose summary contains the solution name
                            if (solutionName && !(d.summary || '').toLowerCase().includes(solutionName)) return;
                            existingDefects.push({
                                key: d.key,
                                summary: d.summary,
                                status: d.status,
                                assignee: d.assignee,
                                priority: d.priority,
                                scenarioName: d.scenarioName
                            });
                        });
                        const totalFromJira = result.defects.length;
                        addLog(agent.id, `Found ${totalFromJira} defect(s) from Jira, ${existingDefects.length} match solution "${reportRef.current?.data?.solution || ''}".`);
                        extra = `${new Set(existingDefects.map((d: ExistingDefect) => d.key)).size} Existing Defect(s) Found`;
                    } else {
                        addLog(agent.id, result.error || "No existing defects found.");
                        extra = "0 Existing Defects";
                    }
                } catch (e: any) {
                    addLog(agent.id, `Jira search error: ${e.message}`);
                    executionStatus = 'error';
                }

                existingDefectsRef.current = existingDefects;
                setAgents(prev => prev.map((a) => a.id === agent.id ? { ...a, existingDefects } : a));
            } else if (failedScenarios.length === 0) {
                addLog(agent.id, "No failed scenarios to check for existing defects.");
                extra = "No failures to check";
            } else {
                addLog(agent.id, "Jira configuration incomplete. Cannot search for existing defects.");
                executionStatus = 'error';
            }
        } else if (agent.id === 3) {
            addLog(agent.id, "Initializing Advanced Failure Classifier (Multi-Tier Engine)...");
            let failedScenarios = scenariosRef.current?.filter(s => s.status?.toLowerCase() === 'failed') || [];
            
            // Exclude scenarios that already have linked defects from Check for Existing Defect agent
            const scenariosWithDefects = new Set(
                existingDefectsRef.current.map(d => d.scenarioName)
            );
            if (scenariosWithDefects.size > 0) {
                const before = failedScenarios.length;
                failedScenarios = failedScenarios.filter(s => {
                    // Check if any defect's scenarioName contains this scenario's name
                    return !existingDefectsRef.current.some(d => 
                        d.scenarioName.includes(s.name) || s.name.includes(d.scenarioName)
                    );
                });
                const skipped = before - failedScenarios.length;
                if (skipped > 0) {
                    addLog(agent.id, `Skipping ${skipped} scenario(s) with existing linked defects.`);
                }
            }
            const userRules = configData?.failureRules || [];
            const enableTier1 = configData?.enableTier1Rules ?? true;

            if (failedScenarios.length > 0) {
                const results: FailureClassificationOutput['classifications'] = [];
                let fCount = 0, dCount = 0, eCount = 0, aCount = 0;
                
                const scenariosToAnalyzeByServer: { name: string, logs: string }[] = [];

                failedScenarios.forEach(s => {
                    const errorLogs = s.logs || '';
                    
                    // 1. Tier 1: Check user-defined rules first if enabled
                    let matchedRule = null;
                    if (enableTier1) {
                        matchedRule = userRules.find(rule => errorLogs.includes(rule.pattern));
                    }

                    if (matchedRule) {
                        const category = matchedRule.category;
                        const reason = `Matched Tier 1 (Custom Rule): "${matchedRule.pattern}"`;
                        if (category === 'Functional Issue') fCount++; 
                        else if (category === 'Data Issue') dCount++; 
                        else if (category === 'Environment Issue') eCount++;
                        else if (category === 'Automation script issue') aCount++;
                        results.push({ scenarioName: s.name, classification: category, reasoning: reason });
                    } else {
                        // 2. Queue for Server-Side Tiers (Python ML / Heuristics)
                        scenariosToAnalyzeByServer.push({ name: s.name, logs: errorLogs });
                    }
                });

                if (scenariosToAnalyzeByServer.length > 0) {
                    addLog(agent.id, `Applying Tier 2/3 engines to ${scenariosToAnalyzeByServer.length} unclassified failures...`);
                    try {
                        const response = await classifyFailures(JSON.stringify(scenariosToAnalyzeByServer));
                        if (response) {
                            response.classifications.forEach(match => {
                                const category = match.classification;
                                if (category === 'Functional Issue') fCount++; 
                                else if (category === 'Data Issue') dCount++; 
                                else if (category === 'Environment Issue') eCount++;
                                else if (category === 'Automation script issue') aCount++;
                                results.push(match);
                            });
                        }
                    } catch (e: any) {
                        addLog(agent.id, `Server Analytics Error: ${e.message}.`);
                    }
                }
                
                classificationSummary = { functionalCount: fCount, dataCount: dCount, environmentCount: eCount, automationCount: aCount };
                classifications = results;
                classificationsRef.current = classifications;
                addLog(agent.id, `Analysis Complete: ${fCount} Functional, ${dCount} Data, ${eCount} Env, ${aCount} Automation.`);
            } else {
                classificationSummary = { functionalCount: 0, dataCount: 0, environmentCount: 0, automationCount: 0 };
                classifications = [];
                classificationsRef.current = [];
            }
        } else if (agent.id === 4) {
            addLog(agent.id, "Starting OTM Data & Date Sequence Analysis...");
            // Only heal data for scenarios that were processed by the Failure Classifier (excludes those with existing linked defects)
            const classifiedNames = new Set((classificationsRef.current || []).map(c => c.scenarioName));
            const totalFailed = scenariosRef.current?.filter(s => s.status?.toLowerCase() === 'failed') || [];
            const allFailures = totalFailed.filter(s => classifiedNames.has(s.name));
            const skippedCount = totalFailed.length - allFailures.length;
            if (skippedCount > 0) {
                addLog(agent.id, `Skipping ${skippedCount} scenario(s) with existing linked defects.`);
            }
            if (classifiedNames.size > 0 && allFailures.length > 0) {
                let testDataFullGitPath = null;
                if (reportRef.current?.data) {
                    reportRef.current.data.test_results?.some((feature: any) => {
                        return feature.elements?.some((scenario: any) => {
                            const firstStep = scenario.steps?.[0];
                            if (firstStep && firstStep.output) {
                                const outputLine = firstStep.output.find((line: string) => line.includes('testDataFile :'));
                                if (outputLine) {
                                    const match = outputLine.match(/testDataFile\s*:\s*(.*\/)?([^\/]+\.json)/);
                                    if (match && match[2]) {
                                        const prefix = configData?.gitlabFilePathPrefix || '';
                                        testDataFullGitPath = prefix ? `${prefix.replace(/\/$/, '')}/${match[2]}` : match[2];
                                        return true;
                                    }
                                }
                            }
                            return false;
                        });
                    });
                }
                if (testDataFullGitPath) {
                    addLog(agent.id, `Targeting test data file: ${testDataFullGitPath}`);
                    const scenarioNames = allFailures.map(f => f.name);

                    // Pre-fetch rate records for planning failure scenarios
                    let rateRecordsToInject: Record<string, string> = {};
                    const planFailScenarios = allFailures.filter(f => 
                        f.logs && f.logs.includes('Total Number of Order Failed to Plan')
                    );
                    if (planFailScenarios.length > 0) {
                        addLog(agent.id, `Detected ${planFailScenarios.length} scenario(s) with planning failures. Querying RateRecord...`);
                        const fileBaseName = (testDataFullGitPath as string).split('/').pop() || '';
                        const envMatch = fileBaseName.match(/testdata[_-](.+?)\.json/i);
                        const environment = envMatch ? envMatch[1] : fileBaseName.replace(/\.json$/i, '');
                        const solution = reportRef.current?.data?.solution || '';
                        try {
                            const rateRes = await fetch('/api/mongo/planning-history', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    environment,
                                    solution,
                                    scenarioNames: planFailScenarios.map(f => f.name),
                                }),
                            });
                            const rateResult = await rateRes.json();
                            if (rateRes.ok && rateResult.success && rateResult.results?.length > 0) {
                                rateResult.results.forEach((r: any) => {
                                    rateRecordsToInject[r.scenarioName] = r.rateRecord;
                                    addLog(agent.id, `  [${r.scenarioName}] Planning history found — Rate Record: ${r.rateRecord}`);
                                });
                                const foundNames = new Set(rateResult.results.map((r: any) => r.scenarioName));
                                planFailScenarios.filter(f => !foundNames.has(f.name)).forEach(f => {
                                    addLog(agent.id, `  [${f.name}] No planning history found.`);
                                });
                            } else if (rateRes.ok && rateResult.results?.length === 0) {
                                planFailScenarios.forEach(f => {
                                    addLog(agent.id, `  [${f.name}] No planning history found.`);
                                });
                            } else if (!rateRes.ok) {
                                addLog(agent.id, `Planning history lookup failed: ${rateResult.error || 'Unknown error'}`);
                            }
                        } catch (rateErr: any) {
                            addLog(agent.id, `Planning history query error: ${rateErr.message}`);
                        }
                    }

                    try {
                        const prepRes = await fetch('/api/gitlab/update', { 
                            method: 'POST', 
                            headers: { 'Content-Type': 'application/json' }, 
                            body: JSON.stringify({ 
                                token: configData?.gitlabToken, 
                                projectId: configData?.gitlabProjectId, 
                                branch: configData?.gitlabBranch, 
                                baseUrl: configData?.gitlabBaseUrl,
                                insecureTls: configData?.gitlabInsecureTls ?? false,
                                filePath: testDataFullGitPath, 
                                scenarioNames,
                                rateRecords: Object.keys(rateRecordsToInject).length > 0 ? rateRecordsToInject : undefined,
                            }) 
                        });
                        let result: any = {};
                        try {
                            result = await prepRes.json();
                        } catch {
                            const textBody = await prepRes.text();
                            console.error('Agent 4 non-JSON response:', prepRes.status, textBody);
                            addLog(agent.id, `Preparation Error (HTTP ${prepRes.status}): ${textBody.substring(0, 500)}`);
                            executionStatus = 'error';
                        }
                        if (executionStatus !== 'error' && prepRes.ok && result.success) { 
                            let msg = `Successfully processed ${result.updateCount} scenarios.`;
                            if (result.datesHealedCount && result.datesHealedCount > 0) {
                                msg += ` Healed ${result.datesHealedCount} OTM date gaps (enforced 4-day minimum).`;
                            }
                            if (result.rateRecordInjected && result.rateRecordInjected > 0) {
                                msg += ` Injected Rate Record for ${result.rateRecordInjected} scenario(s).`;
                            }
                            addLog(agent.id, msg);

                            // Log per-scenario date healing details
                            if (result.scenarioHealDetails && result.scenarioHealDetails.length > 0) {
                                result.scenarioHealDetails.forEach((detail: any) => {
                                    if (detail.datesHealed.length > 0) {
                                        addLog(agent.id, `  [${detail.name}] Dates healed: ${detail.datesHealed.join(', ')}`);
                                    }
                                    if (detail.datesCorrect.length > 0) {
                                        addLog(agent.id, `  [${detail.name}] Dates already correct: ${detail.datesCorrect.join(', ')}`);
                                    }
                                    if (detail.datesHealed.length === 0 && detail.datesCorrect.length === 0) {
                                        addLog(agent.id, `  [${detail.name}] No date fields found.`);
                                    }
                                });
                            }

                            // Reclassify scenarios where no data was healed as "Functional Issue"
                            const healedScenarioNames = new Set<string>();
                            if (result.scenarioHealDetails) {
                                result.scenarioHealDetails.forEach((detail: any) => {
                                    if (detail.datesHealed.length > 0) {
                                        healedScenarioNames.add(detail.name);
                                    }
                                });
                            }
                            // Also consider rate-record-injected scenarios as healed
                            if (rateRecordsToInject) {
                                Object.keys(rateRecordsToInject).forEach(name => healedScenarioNames.add(name));
                            }
                            // Reclassify unhealed scenarios from "Data Issue" to "Functional Issue"
                            let reclassifiedCount = 0;
                            classificationsRef.current = (classificationsRef.current || []).map(c => {
                                if (c.classification === 'Data Issue' && !healedScenarioNames.has(c.scenarioName)) {
                                    reclassifiedCount++;
                                    return { ...c, classification: 'Functional Issue' };
                                }
                                return c;
                            });
                            if (reclassifiedCount > 0) {
                                addLog(agent.id, `Reclassified ${reclassifiedCount} scenario(s) as "Functional Issue" (no data was healed).`);
                            }

                            const contentStr = JSON.stringify(result.updatedContent, null, 2);
                            preparedContentRef.current = { content: contentStr, filePath: testDataFullGitPath };
                            updatedContent = contentStr;
                            targetFilePath = testDataFullGitPath;
                            extra = `${result.updateCount} Repaired | ${result.datesHealedCount || 0} Dates Healed`;
                        } else if (executionStatus !== 'error') {
                            const errorMsg = result.error || `Unexpected response (HTTP ${prepRes.status})`;
                            addLog(agent.id, `Preparation Error: ${errorMsg}`);
                            if (result.details) addLog(agent.id, `Details: ${result.details}`);
                            console.error('Agent 4 Preparation Error:', JSON.stringify(result, null, 2));
                            executionStatus = 'error';
                        }
                    } catch (e: any) {
                        addLog(agent.id, `GitLab Sync Error: ${e.message}`);
                        executionStatus = 'error';
                    }
                } else { 
                    addLog(agent.id, "No test data file path detected in execution outputs.");
                    executionStatus = 'error'; 
                }
            } else {
                addLog(agent.id, "No failures found to process.");
            }
        } else if (agent.id === 5) {
            addLog(agent.id, "Initializing GitLab Data Sync...");
            if (preparedContentRef.current) {
                if (configData?.gitlabAutoCommit !== false) {
                    try {
                        const commitRes = await fetch('/api/gitlab/commit', { 
                            method: 'POST', 
                            headers: { 'Content-Type': 'application/json' }, 
                            body: JSON.stringify({ 
                                token: configData?.gitlabToken, 
                                projectId: configData?.gitlabProjectId, 
                                branch: configData?.gitlabBranch, 
                                baseUrl: configData?.gitlabBaseUrl,
                                insecureTls: configData?.gitlabInsecureTls ?? false,
                                filePath: preparedContentRef.current.filePath, 
                                content: preparedContentRef.current.content 
                            }) 
                        });
                        const result = await commitRes.json();
                        if (commitRes.ok && result.success) { 
                            addLog(agent.id, `Committed changes to ${preparedContentRef.current.filePath}. Hash: ${result.commitHash?.substring(0,8)}`);
                            extra = "Data Synchronized"; 
                            updatedContent = preparedContentRef.current.content; 
                        } else {
                            addLog(agent.id, `GitLab Commit Error: ${result.error}`);
                            executionStatus = 'error';
                        }
                    } catch (e) { executionStatus = 'error'; }
                } else {
                    addLog(agent.id, `Auto-commit disabled. Changes prepared for: ${preparedContentRef.current.filePath}`);
                    addLog(agent.id, "Use the 'Commit Now' button to push changes to GitLab.");
                    extra = "Pending Commit";
                    updatedContent = preparedContentRef.current.content;
                }
            } else {
                addLog(agent.id, "No prepared content found to sync.");
            }
        } else if (agent.id === 6) {
            addLog(agent.id, "Initializing Pipeline Orchestrator...");
            const scheduleDesc = configData?.gitlabPipelineScheduleDescription;
            if (scheduleDesc) {
                try {
                    const triggerRes = await fetch('/api/gitlab/trigger-schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: configData?.gitlabToken, projectId: configData?.gitlabProjectId, baseUrl: configData?.gitlabBaseUrl, insecureTls: configData?.gitlabInsecureTls ?? false, scheduleDescription: scheduleDesc }) });
                    const result = await triggerRes.json();
                    if (triggerRes.ok && result.success) {
                        addLog(agent.id, `Schedule '${scheduleDesc}' triggered successfully.`);
                        if (result.pipeline) {
                            addLog(agent.id, `Pipeline #${result.pipeline.id} — Status: ${result.pipeline.status} | Branch: ${result.pipeline.ref}`);
                            if (result.pipeline.webUrl) {
                                addLog(agent.id, `URL: ${result.pipeline.webUrl}`);
                            }
                            extra = `Pipeline #${result.pipeline.id} (${result.pipeline.status})`;
                        } else {
                            extra = `Triggered: ${scheduleDesc}`;
                        }
                    } else {
                        addLog(agent.id, `Trigger Error: ${result.error || 'Unknown'}`);
                        executionStatus = 'error';
                    }
                } catch (e: any) { 
                    addLog(agent.id, `Pipeline trigger failed: ${e.message}`);
                    executionStatus = 'error'; 
                }
            } else {
                addLog(agent.id, "Pipeline Schedule Description not configured.");
            }
        } else if (agent.id === 7) {
            addLog(agent.id, "Initializing Jira Defect Scout...");
            const functionalFailures = classificationsRef.current?.filter(c => c.classification === 'Functional Issue') || [];
            if (functionalFailures.length > 0) {
                // Group scenarios by their normalized failure logs to consolidate duplicated issues
                const failureGroups = new Map<string, { representative: string, others: string[], originalLog: string }>(); 
                
                functionalFailures.forEach(f => {
                    const scenarioSummary = scenariosRef.current?.find(s => s.name === f.scenarioName);
                    const rawLog = (scenarioSummary?.logs || "").trim();
                    
                    // Normalize logs by masking timestamps, UUIDs, and numbers to identify root causes
                    const normalizedKey = rawLog
                        .replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<timestamp>') 
                        .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '<uuid>') 
                        .replace(/\d+/g, '#') 
                        .trim() || `SCENARIO_KEY_${f.scenarioName}`;

                    const existing = failureGroups.get(normalizedKey);
                    if (existing) {
                        existing.others.push(f.scenarioName);
                    } else {
                        failureGroups.set(normalizedKey, { 
                            representative: f.scenarioName, 
                            others: [], 
                            originalLog: rawLog 
                        });
                    }
                });

                addLog(agent.id, `Consolidated ${functionalFailures.length} scenarios into ${failureGroups.size} unique root-cause issues.`);

                // Build defect payloads
                const defectPayloads: { summary: string, description: string, screenshot: File | null }[] = [];
                for (const [groupKey, groupData] of Array.from(failureGroups.entries())) {
                    const representativeName = groupData.representative;
                    const allAffectedNames = [representativeName, ...groupData.others];
                    
                    let scenarioObj: any = null;
                    reportRef.current?.data?.test_results?.some((f: any) => {
                        scenarioObj = f.elements?.find((s: any) => s.name === representativeName);
                        return !!scenarioObj;
                    });

                    if (!scenarioObj) {
                        addLog(agent.id, `Warning: Detailed trace for representative ${representativeName} not found.`);
                        continue;
                    }

                    let description = "AI Automated Failure Report (Consolidated)\n\n";
                    description += "--- REPRODUCIBLE STEPS (Representative Scenario) ---\n";
                    
                    let screenshotFile: File | null = null;
                    let failureLog = groupData.originalLog;

                    scenarioObj.steps?.forEach((step: any, sIdx: number) => {
                        const status = step.result?.status?.toUpperCase() || 'UNKNOWN';
                        description += `${sIdx + 1}. [${status}] ${step.keyword}${step.name}\n`;
                        
                        if (status === 'FAILED') {
                            const embeddings = [
                                ...(step.embeddings || []), 
                                ...(step.result?.embeddings || [])
                            ].filter((e: any) => e.mime_type?.startsWith('image/'));
                            
                            if (embeddings.length > 0 && !screenshotFile) {
                                const img = embeddings[0];
                                const byteCharacters = atob(img.data);
                                const byteNumbers = new Array(byteCharacters.length);
                                for (let i = 0; i < byteCharacters.length; i++) {
                                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                                }
                                const byteArray = new Uint8Array(byteNumbers);
                                const blob = new Blob([byteArray], { type: img.mime_type });
                                screenshotFile = new File([blob], `failure_${representativeName.replace(/\W+/g, '_')}.png`, { type: img.mime_type });
                            }
                        }
                    });

                    if (failureLog) {
                        description += `\n\n--- DETAILED FAILURE LOG ---\n${failureLog}`;
                    }

                    // Mention impacted test cases at the end of the description
                    description += `\n\n--- IMPACTED TEST CASES (${allAffectedNames.length}) ---\n`;
                    allAffectedNames.forEach((name, i) => {
                        description += `${i + 1}. ${name}\n`;
                    });

                    const isConsolidated = allAffectedNames.length > 1;
                    const jiraSummary = `${isConsolidated ? '[Consolidated] ' : ''}AI FAILURE: ${representativeName}${isConsolidated ? ` (+${allAffectedNames.length - 1} more)` : ''}`;

                    defectPayloads.push({ summary: jiraSummary, description, screenshot: screenshotFile });
                }

                if (configData?.jiraAutoCreate !== false) {
                    // Auto-create mode: create tickets immediately
                    let successCount = 0;
                    for (const payload of defectPayloads) {
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
                                summary: payload.summary, 
                                description: payload.description 
                            }));
                            if (payload.screenshot) formData.append('screenshot', payload.screenshot);

                            const jiraRes = await fetch('/api/jira/create', { method: 'POST', body: formData });
                            const jiraResult = await jiraRes.json();
                            if (jiraRes.ok && jiraResult.success) { 
                                addLog(agent.id, `Created Jira Ticket: ${jiraResult.key} — ${payload.summary.substring(0, 60)}...`); 
                                successCount++; 
                            } else {
                                addLog(agent.id, `Jira API Error: ${jiraResult.error || 'Unknown'}`);
                            }
                        } catch (e: any) {
                            addLog(agent.id, `Internal error during Jira creation: ${e.message}`);
                        }
                    }
                    extra = `${successCount} Unique Tickets Created`;
                } else {
                    // Manual mode: store payloads for user review
                    pendingJiraDefectsRef.current = defectPayloads;
                    addLog(agent.id, `Auto-create disabled. ${defectPayloads.length} defect(s) prepared for review.`);
                    addLog(agent.id, "Use the 'Create Defects' button to submit to Jira.");
                    extra = `${defectPayloads.length} Pending Review`;
                }
            } else { addLog(agent.id, "No functional failures identified."); }
        } else if (agent.id === 8) {
            addLog(agent.id, "Initializing Notification Trigger...");
            if (configData?.teamsWebhookUrl) {
                const summary = buildNotificationSummary();
                try {
                    const res = await fetch('/api/notifications/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ webhookUrl: configData.teamsWebhookUrl, summary }) });
                    if (res.ok) {
                        extra = "Comprehensive Teams Report Sent";
                        addLog(agent.id, `Sent report covering ${summary.agents.length} agents.`);
                    } else {
                        const errBody = await res.text();
                        addLog(agent.id, `Teams API error ${res.status}: ${errBody.slice(0, 300)}`);
                        executionStatus = 'error';
                    }
                } catch (e: any) {
                    addLog(agent.id, `Teams notification failed: ${e?.message || e}`);
                    executionStatus = 'error';
                }
            } else { addLog(agent.id, "Teams Webhook URL not configured."); executionStatus = 'error'; }
        }

        const duration = Math.random() * 2000 + 1000;
        await new Promise(resolve => setTimeout(resolve, duration));

        setAgents(prev => prev.map((a, i) => i === index ? { 
            ...a, 
            status: executionStatus, 
            lastRun: new Date().toISOString(),
            extraInfo: extra || a.extraInfo,
            metrics: metrics || a.metrics,
            classificationSummary: classificationSummary || a.classificationSummary,
            classifications: classifications || a.classifications,
            updatedContent: updatedContent || a.updatedContent,
            targetFilePath: targetFilePath || a.targetFilePath
        } : a));

        if (isPipelineRunning) setProgress(((index + 1) / AGENTS_CONFIG.length) * 100);
    };

    const startPipeline = async () => {
        if (isPipelineRunning) return;
        setIsPipelineRunning(true);
        setProgress(0);
        setAgents(prev => prev.map(a => ({ ...a, status: 'idle' })));
        scenariosRef.current = []; 
        classificationsRef.current = [];
        existingDefectsRef.current = [];
        preparedContentRef.current = null;
        pendingJiraDefectsRef.current = [];
        pipelineStartRef.current = new Date().toISOString();
        for (let i = 0; i < AGENTS_CONFIG.length; i++) await runAgent(i);
        setIsPipelineRunning(false);
        setCurrentAgentIndex(-1);
        toast({ title: "Pipeline Completed", description: "All AI Agents have finished." });
    };

    const handleDownloadReport = (fileName: string, content?: string) => {
        const data = content || (reportRef.current ? JSON.stringify(reportRef.current.data, null, 2) : "{}");
        const blob = new Blob([data], { type: 'application/json' });
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
        setPreviewReport({ name: fileName, content: reportRef.current ? JSON.stringify(reportRef.current.data, null, 2) : "{}" });
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
        reportRef.current.data.test_results?.some((feature: any) => { foundScenario = feature.elements?.find((s: any) => s.name === scenarioName); return !!foundScenario; });
        if (foundScenario) setSelectedScenarioSteps(foundScenario);
    };

    const filteredScenarios = useMemo(() => {
        if (!scenarioListView || !scenarioListView.scenarios) return [];
        const searchStr = scenarioSearch.toLowerCase().trim();
        return scenarioListView.scenarios.filter(s => {
            const matchesStatus = s.status === scenarioListView.status;
            if (!searchStr) return matchesStatus;
            const matchesName = s.name.toLowerCase().includes(searchStr);
            const matchesTags = s.tags.some(tag => tag.toLowerCase().includes(searchStr));
            return matchesStatus && (matchesName || matchesTags);
        });
    }, [scenarioListView, scenarioSearch]);

    const isAnyAgentRunning = agents.some(a => a.status === 'running');

    useEffect(() => {
        let timer: any;
        if (autoMode && !isPipelineRunning) timer = setInterval(() => startPipeline(), 300000);
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
                    <p className="text-muted-foreground text-sm">Unattended JSON-first pipeline for automated failure analysis.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center space-x-2 bg-muted p-1 rounded-md px-3 border">
                        <label className="text-xs font-medium">Auto-Run (5m)</label>
                        <Button variant={autoMode ? "default" : "outline"} size="sm" className="h-7 text-[10px]" onClick={() => setAutoMode(!autoMode)}>{autoMode ? "ACTIVE" : "OFF"}</Button>
                    </div>
                    <Button onClick={startPipeline} disabled={isPipelineRunning || isAnyAgentRunning}>
                        {isPipelineRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running Pipeline...</> : <><Play className="mr-2 h-4 w-4" /> Start Agent Pipeline</>}
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
                    <Card key={agent.id} className={cn("transition-all duration-300 flex flex-col", agent.status === 'running' && "ring-2 ring-primary ring-offset-2", agent.status === 'success' && "bg-green-50/30 border-green-200", agent.status === 'error' && "bg-red-50/30 border-red-200")}>
                        <CardHeader className="p-4 pb-2">
                            <div className="flex justify-between items-start">
                                <div className="bg-primary/10 p-2 rounded-lg">
                                    {agent.id === 1 && <Database className="h-4 w-4 text-primary" />}
                                    {agent.id === 2 && <FileJson className="h-4 w-4 text-primary" />}
                                    {agent.id === 9 && <Search className="h-4 w-4 text-primary" />}
                                    {agent.id === 3 && <ShieldAlert className="h-4 w-4 text-primary" />}
                                    {agent.id === 4 && <ListChecks className="h-4 w-4 text-primary" />}
                                    {agent.id === 5 && <GitBranch className="h-4 w-4 text-primary" />}
                                    {agent.id === 6 && <RefreshCcw className="h-4 w-4 text-primary" />}
                                    {agent.id === 7 && <Bug className="h-4 w-4 text-primary" />}
                                    {agent.id === 8 && <MessageSquare className="h-4 w-4 text-primary" />}
                                </div>
                                <div className="flex gap-1">
                                    {agent.id === 3 && (
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-primary">
                                                    <Settings className="h-3.5 w-3.5" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-2xl">
                                                <DialogHeader>
                                                    <DialogTitle>Failure Classification Settings</DialogTitle>
                                                    <DialogDescription>Configure the multi-tiered analysis engine.</DialogDescription>
                                                </DialogHeader>
                                                <div className="space-y-6 py-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                        <div className="flex items-center justify-between p-2 border rounded-md bg-muted/30">
                                                            <div className="space-y-0.5"><Label className="text-xs">Tier 1: Rules</Label></div>
                                                            <Switch checked={configData?.enableTier1Rules ?? true} onCheckedChange={(val) => handleUpdateConfig('enableTier1Rules', val)} />
                                                        </div>
                                                        <div className="flex items-center justify-between p-2 border rounded-md bg-muted/30">
                                                            <div className="space-y-0.5"><Label className="text-xs">Tier 2: Python</Label></div>
                                                            <Switch checked={configData?.enableTier2Python ?? true} onCheckedChange={(val) => handleUpdateConfig('enableTier2Python', val)} />
                                                        </div>
                                                        <div className="flex items-center justify-between p-2 border rounded-md bg-muted/30">
                                                            <div className="space-y-0.5"><Label className="text-xs">Tier 3: Heuristics</Label></div>
                                                            <Switch checked={configData?.enableTier3Heuristics ?? true} onCheckedChange={(val) => handleUpdateConfig('enableTier3Heuristics', val)} />
                                                        </div>
                                                    </div>

                                                    <Separator />

                                                    <div className="space-y-4">
                                                        <div className="flex items-end gap-2 bg-muted/50 p-3 rounded-lg border">
                                                            <div className="flex-1 space-y-1.5">
                                                                <Label className="text-xs">Error Log Pattern (Substring)</Label>
                                                                <Input 
                                                                    placeholder="e.g. timeout, 503, java.lang.AssertionError" 
                                                                    value={newPattern}
                                                                    onChange={(e) => setNewPattern(e.target.value)}
                                                                    className="h-8 text-xs"
                                                                />
                                                            </div>
                                                            <div className="w-40 space-y-1.5">
                                                                <Label className="text-xs">Assign Category</Label>
                                                                <Select value={newCategory} onValueChange={(val: any) => setNewCategory(val)}>
                                                                    <SelectTrigger className="h-8 text-xs">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="Functional Issue">Functional Issue</SelectItem>
                                                                        <SelectItem value="Data Issue">Data Issue</SelectItem>
                                                                        <SelectItem value="Environment Issue">Environment Issue</SelectItem>
                                                                        <SelectItem value="Automation script issue">Automation script issue</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                            <Button size="sm" className="h-8" onClick={handleAddFailureRule}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
                                                        </div>
                                                        <ScrollArea className="h-64 rounded-md border bg-card">
                                                            <Table>
                                                                <TableHeader className="bg-muted/30">
                                                                    <TableRow>
                                                                        <TableHead className="text-[10px] uppercase">Pattern</TableHead>
                                                                        <TableHead className="text-[10px] uppercase">Target Category</TableHead>
                                                                        <TableHead className="w-10"></TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {(configData?.failureRules || []).map((rule, i) => (
                                                                        <TableRow key={i} className="group">
                                                                            <TableCell className="font-mono text-[10px] py-2">{rule.pattern}</TableCell>
                                                                            <TableCell className="py-2">
                                                                                <Badge variant="outline" className="text-[9px] uppercase px-1.5">{rule.category}</Badge>
                                                                            </TableCell>
                                                                            <TableCell className="py-2">
                                                                                <Button variant="ghost" size="icon" className="text-destructive h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => handleRemoveFailureRule(i)}>
                                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                                </Button>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                    {(configData?.failureRules || []).length === 0 && (
                                                                        <TableRow>
                                                                            <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-8">No custom rules defined yet.</TableCell>
                                                                        </TableRow>
                                                                    )}
                                                                </TableBody>
                                                            </Table>
                                                        </ScrollArea>
                                                    </div>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                    {agent.id === 9 && (
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-primary">
                                                    <Settings className="h-3.5 w-3.5" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-[425px]">
                                                <DialogHeader>
                                                    <div className="flex items-center justify-between">
                                                        <DialogTitle>Jira Search Configuration</DialogTitle>
                                                        <Button variant="outline" size="sm" onClick={handleTestJiraSearch} disabled={isTestingJiraSearch} className="h-8 text-xs">{isTestingJiraSearch ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <FlaskConical className="h-3 w-3 mr-2" />}Test Connection</Button>
                                                    </div>
                                                    <DialogDescription>Configure Jira credentials for searching existing defects.</DialogDescription>
                                                </DialogHeader>
                                                <div className="grid gap-4 py-4">
                                                    <div className="grid gap-2"><Label>Jira Base URL</Label><Input defaultValue={configData?.jiraSearchLink || ''} onBlur={(e) => handleUpdateConfig('jiraSearchLink', e.target.value)} placeholder="https://your-domain.atlassian.net" /></div>
                                                    <div className="grid gap-2"><Label>Jira Email</Label><Input defaultValue={configData?.jiraSearchUser || ''} onBlur={(e) => handleUpdateConfig('jiraSearchUser', e.target.value)} /></div>
                                                    <div className="grid gap-2"><Label>API Token</Label><Input type="password" defaultValue={configData?.jiraSearchApiToken || ''} onBlur={(e) => handleUpdateConfig('jiraSearchApiToken', e.target.value)} /></div>
                                                    <div className="grid gap-2"><Label>Project Key</Label><Input defaultValue={configData?.jiraSearchProjectKey || ''} onBlur={(e) => handleUpdateConfig('jiraSearchProjectKey', e.target.value)} /></div>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                    {agent.id === 7 && (
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-primary">
                                                    <Settings className="h-3.5 w-3.5" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-[425px]">
                                                <DialogHeader>
                                                    <div className="flex items-center justify-between">
                                                        <DialogTitle>Jira Configuration</DialogTitle>
                                                        <Button variant="outline" size="sm" onClick={handleTestJira} disabled={isTestingJira} className="h-8 text-xs">{isTestingJira ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <FlaskConical className="h-3 w-3 mr-2" />}Test Connection</Button>
                                                    </div>
                                                </DialogHeader>
                                                <div className="grid gap-4 py-4">
                                                    <div className="grid gap-2"><Label>Jira Base URL</Label><Input defaultValue={configData?.jiraLink || ''} onBlur={(e) => handleUpdateConfig('jiraLink', e.target.value)} /></div>
                                                    <div className="grid gap-2"><Label>Jira Email</Label><Input defaultValue={configData?.jiraUser || ''} onBlur={(e) => handleUpdateConfig('jiraUser', e.target.value)} /></div>
                                                    <div className="grid gap-2"><Label>API Token</Label><Input type="password" defaultValue={configData?.jiraApiToken || ''} onBlur={(e) => handleUpdateConfig('jiraApiToken', e.target.value)} /></div>
                                                    <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Project Key</Label><Input defaultValue={configData?.jiraProjectKey || ''} onBlur={(e) => handleUpdateConfig('jiraProjectKey', e.target.value)} /></div><div className="grid gap-2"><Label>Issue Type</Label><Input defaultValue={configData?.jiraIssueType || 'Bug'} onBlur={(e) => handleUpdateConfig('jiraIssueType', e.target.value)} /></div></div>
                                                    <div className="flex items-center justify-between rounded-md border p-3">
                                                        <div className="space-y-0.5">
                                                            <Label className="text-sm">Auto-create defects</Label>
                                                            <p className="text-xs text-muted-foreground">Automatically create Jira tickets. When disabled, you can review and manually create.</p>
                                                        </div>
                                                        <Switch checked={configData?.jiraAutoCreate !== false} onCheckedChange={(val) => handleUpdateConfig('jiraAutoCreate', val)} />
                                                    </div>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                    {(agent.id === 4 || agent.id === 5) && (
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-primary">
                                                    <Settings className="h-3.5 w-3.5" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-[425px]">
                                                <DialogHeader>
                                                    <div className="flex items-center justify-between">
                                                        <DialogTitle>GitLab Configuration</DialogTitle>
                                                        <Button variant="outline" size="sm" onClick={handleTestGitlab} disabled={isTestingGitlab} className="h-8 text-xs">{isTestingGitlab ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <FlaskConical className="h-3 w-3 mr-2" />}Test Connection</Button>
                                                    </div>
                                                </DialogHeader>
                                                <div className="grid gap-4 py-4">
                                                    <div className="grid gap-2"><Label>Private Token</Label><Input type="password" defaultValue={configData?.gitlabToken || ''} onBlur={(e) => handleUpdateConfig('gitlabToken', e.target.value)} /></div>
                                                    <div className="grid gap-2"><Label>Base URL</Label><Input placeholder="https://gitlab.com" defaultValue={configData?.gitlabBaseUrl || ''} onBlur={(e) => handleUpdateConfig('gitlabBaseUrl', e.target.value)} /></div>
                                                    <div className="grid gap-2"><Label>Project ID</Label><Input defaultValue={configData?.gitlabProjectId || ''} onBlur={(e) => handleUpdateConfig('gitlabProjectId', e.target.value)} /></div>
                                                    <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Branch</Label><Input defaultValue={configData?.gitlabBranch || 'main'} onBlur={(e) => handleUpdateConfig('gitlabBranch', e.target.value)} /></div><div className="grid gap-2"><Label>Path Prefix</Label><Input defaultValue={configData?.gitlabFilePathPrefix || ''} onBlur={(e) => handleUpdateConfig('gitlabFilePathPrefix', e.target.value)} /></div></div>
                                                    <div className="flex items-center justify-between rounded-md border p-3">
                                                        <div className="space-y-0.5">
                                                            <Label className="text-sm">Auto-commit changes</Label>
                                                            <p className="text-xs text-muted-foreground">Automatically commit healed data to GitLab. When disabled, you can review and manually commit.</p>
                                                        </div>
                                                        <Switch checked={configData?.gitlabAutoCommit !== false} onCheckedChange={(val) => handleUpdateConfig('gitlabAutoCommit', val)} />
                                                    </div>
                                                    <div className="flex items-center justify-between rounded-md border p-3">
                                                        <div className="space-y-0.5">
                                                            <Label className="text-sm">Skip TLS verification</Label>
                                                            <p className="text-xs text-muted-foreground">Bypass SSL certificate check (use only on trusted corporate networks doing TLS interception).</p>
                                                        </div>
                                                        <Switch checked={configData?.gitlabInsecureTls ?? false} onCheckedChange={(val) => handleUpdateConfig('gitlabInsecureTls', val)} />
                                                    </div>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                    {agent.id === 6 && (
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-primary">
                                                    <Settings className="h-3.5 w-3.5" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-[425px]">
                                                <DialogHeader><DialogTitle>Orchestrator Configuration</DialogTitle></DialogHeader>
                                                <div className="grid gap-4 py-4">
                                                    <div className="grid gap-2"><Label>Pipeline Schedule Description</Label><Input defaultValue={configData?.gitlabPipelineScheduleDescription || ''} onBlur={(e) => handleUpdateConfig('gitlabPipelineScheduleDescription', e.target.value)} /></div>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                    {agent.id === 8 && (
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-primary">
                                                    <Settings className="h-3.5 w-3.5" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-[425px]">
                                                <DialogHeader>
                                                    <div className="flex items-center justify-between">
                                                        <DialogTitle>Notification Configuration</DialogTitle>
                                                        <div className="flex items-center gap-2">
                                                            <Button variant="outline" size="sm" onClick={() => setNotificationPreview(buildNotificationSummary())} className="h-8 text-xs"><Eye className="h-3 w-3 mr-2" />Preview Report</Button>
                                                            <Button variant="outline" size="sm" onClick={handleTestTeams} disabled={isTestingTeams} className="h-8 text-xs">{isTestingTeams ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <FlaskConical className="h-3 w-3 mr-2" />}Test Channel</Button>
                                                        </div>
                                                    </div>
                                                </DialogHeader>
                                                <div className="grid gap-4 py-4">
                                                    <div className="grid gap-2"><Label>Teams Webhook URL</Label><Input type="password" defaultValue={configData?.teamsWebhookUrl || ''} onBlur={(e) => handleUpdateConfig('teamsWebhookUrl', e.target.value)} /></div>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={() => runAgent(idx)} disabled={isPipelineRunning || agent.status === 'running'}><PlayCircle className="h-3.5 w-3.5" /></Button>
                                    <Badge variant={agent.status === 'idle' ? 'outline' : agent.status === 'running' ? 'default' : agent.status === 'success' ? 'secondary' : 'destructive'} className="text-[10px] uppercase px-1.5">{agent.status}</Badge>
                                </div>
                            </div>
                            <CardTitle className="text-sm mt-2">{agent.name}</CardTitle>
                            <CardDescription className="text-[11px] leading-tight h-8 overflow-hidden">{agent.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="px-4 py-2 flex-1">
                            {agent.id === 1 && agent.extraInfo && (
                                <div className="space-y-2">
                                    <div className="p-1.5 bg-primary/5 border border-primary/10 rounded text-[9px] font-mono flex items-center gap-1.5"><FileCode className="h-3 w-3 text-primary shrink-0" /><span className="truncate text-primary font-bold">{agent.extraInfo}</span></div>
                                    <Button variant="outline" size="sm" className="h-6 text-[10px] w-full" onClick={() => handleViewReport(agent.extraInfo!)}><Eye className="h-3 w-3 mr-1" /> View Fetched JSON</Button>
                                </div>
                            )}
                            {agent.id === 2 && agent.metrics && (
                                <div className="grid grid-cols-2 gap-2">
                                    <button className="bg-green-500/10 border border-green-200 rounded p-1 text-center" onClick={() => handleOpenScenarioList('Passed Scenarios', 'passed', agent.metrics?.scenarios)}><div className="text-[8px] text-green-600 font-semibold uppercase">Passed</div><div className="text-xs font-bold text-green-700">{agent.metrics.passed}</div></button>
                                    <button className="bg-red-500/10 border border-red-200 rounded p-1 text-center" onClick={() => handleOpenScenarioList('Failed Scenarios', 'failed', agent.metrics?.scenarios)}><div className="text-[8px] text-red-600 font-semibold uppercase">Failed</div><div className="text-xs font-bold text-red-700">{agent.metrics.failed}</div></button>
                                </div>
                            )}
                            {agent.id === 3 && agent.classificationSummary && (
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button className="bg-red-500/10 border border-red-200 rounded p-1 text-center" onClick={() => handleOpenClassificationList('Functional Issues', 'Functional Issue', agent.classifications)}><div className="text-[7px] text-red-600 font-semibold uppercase">Func</div><div className="text-xs font-bold text-red-700">{agent.classificationSummary.functionalCount}</div></button>
                                    <button className="bg-amber-500/10 border border-amber-200 rounded p-1 text-center" onClick={() => handleOpenClassificationList('Data Issues', 'Data Issue', agent.classifications)}><div className="text-[7px] text-amber-600 font-semibold uppercase">Data</div><div className="text-xs font-bold text-amber-700">{agent.classificationSummary.dataCount}</div></button>
                                    <button className="bg-blue-500/10 border border-blue-200 rounded p-1 text-center" onClick={() => handleOpenClassificationList('Env. Issues', 'Environment Issue', agent.classifications)}><div className="text-[7px] text-blue-600 font-semibold uppercase">Env</div><div className="text-xs font-bold text-blue-700">{agent.classificationSummary.environmentCount}</div></button>
                                    <button className="bg-purple-500/10 border border-purple-200 rounded p-1 text-center" onClick={() => handleOpenClassificationList('Automation Issues', 'Automation script issue', agent.classifications)}><div className="text-[7px] text-purple-600 font-semibold uppercase">Auto</div><div className="text-xs font-bold text-purple-700">{agent.classificationSummary.automationCount}</div></button>
                                </div>
                            )}
                            {agent.id === 9 && agent.status === 'success' && (
                                <div className="space-y-1.5">
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <div className="p-1.5 bg-red-500/10 border border-red-200 rounded text-center">
                                            <div className="text-[8px] text-red-600 font-semibold uppercase">Failed Cases</div>
                                            <div className="text-xs font-bold text-red-700">{(() => { const names = new Set((agent.existingDefects || []).map(d => d.scenarioName)); const failedCount = scenariosRef.current?.filter(s => s.status === 'failed')?.length || 0; return Math.max(names.size, failedCount); })()}</div>
                                        </div>
                                        <div className="p-1.5 bg-amber-500/10 border border-amber-200 rounded text-center">
                                            <div className="text-[8px] text-amber-600 font-semibold uppercase">Linked Defects</div>
                                            <div className="text-xs font-bold text-amber-700">{new Set((agent.existingDefects || []).map(d => d.key)).size}</div>
                                        </div>
                                    </div>
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" size="sm" className="h-6 text-[10px] w-full"><Eye className="h-3 w-3 mr-1" /> View Details</Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
                                            <DialogHeader className="p-4 border-b shrink-0"><DialogTitle>Failed Test Cases & Linked Defects</DialogTitle><DialogDescription>Overview of failed scenarios and their existing Jira defects.</DialogDescription></DialogHeader>
                                            <div className="flex-1 overflow-auto">
                                                <div className="space-y-3 p-4 min-w-[800px]">
                                                    {(() => {
                                                        const failedScenarios = scenariosRef.current?.filter(s => s.status === 'failed') || [];
                                                        const defectsByScenario = new Map<string, ExistingDefect[]>();
                                                        (agent.existingDefects || []).forEach(d => {
                                                            const existing = defectsByScenario.get(d.scenarioName) || [];
                                                            existing.push(d);
                                                            defectsByScenario.set(d.scenarioName, existing);
                                                        });
                                                        // Build display list: use failed scenarios, match by checking if scenarioName from defects contains the scenario name
                                                        const entries: { name: string, tags: string[], defects: ExistingDefect[] }[] = [];
                                                        const usedDefectScenarios = new Set<string>();
                                                        
                                                        failedScenarios.forEach(s => {
                                                            const matchedDefects: ExistingDefect[] = [];
                                                            defectsByScenario.forEach((defs, scenarioKey) => {
                                                                if (scenarioKey.includes(s.name) || s.name.includes(scenarioKey)) {
                                                                    matchedDefects.push(...defs);
                                                                    usedDefectScenarios.add(scenarioKey);
                                                                }
                                                            });
                                                            entries.push({ name: s.name, tags: s.tags || [], defects: matchedDefects });
                                                        });
                                                        
                                                        // Add any defect scenarios not matched to a failed scenario
                                                        defectsByScenario.forEach((defs, scenarioKey) => {
                                                            if (!usedDefectScenarios.has(scenarioKey)) {
                                                                entries.push({ name: scenarioKey, tags: [], defects: defs });
                                                            }
                                                        });

                                                        return entries.map((entry, ei) => (
                                                            <div key={ei} className="border rounded-lg overflow-hidden">
                                                                <div className="flex items-center gap-2 p-3 bg-muted/30 border-b">
                                                                    <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                                                    <span className="text-xs font-semibold flex-1">{entry.name}</span>
                                                                    {entry.defects.length > 0 ? (
                                                                        <Badge className="text-[9px] bg-amber-100 text-amber-800 border-amber-300">{entry.defects.length} defect(s)</Badge>
                                                                    ) : (
                                                                        <Badge variant="outline" className="text-[9px] text-muted-foreground">No linked defects</Badge>
                                                                    )}
                                                                </div>
                                                                {entry.defects.length > 0 && (
                                                                    <Table>
                                                                        <TableHeader>
                                                                            <TableRow className="bg-muted/10">
                                                                                <TableHead className="text-[10px] py-1.5">Ticket</TableHead>
                                                                                <TableHead className="text-[10px] py-1.5">Summary</TableHead>
                                                                                <TableHead className="text-[10px] py-1.5">Status</TableHead>
                                                                                <TableHead className="text-[10px] py-1.5">Priority</TableHead>
                                                                                <TableHead className="text-[10px] py-1.5">Assignee</TableHead>
                                                                            </TableRow>
                                                                        </TableHeader>
                                                                        <TableBody>
                                                                            {entry.defects.map((defect, di) => (
                                                                                <TableRow key={di}>
                                                                                    <TableCell className="font-mono text-[10px] text-primary font-bold py-1.5"><a href={`${(configData?.jiraSearchLink || configData?.jiraLink || '').replace(/\/+$/, '')}/browse/${defect.key}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary/80">{defect.key}</a></TableCell>
                                                                                    <TableCell className="text-[10px] max-w-[250px] truncate py-1.5">{defect.summary}</TableCell>
                                                                                    <TableCell className="py-1.5"><Badge variant={defect.status === 'Done' ? 'secondary' : 'outline'} className="text-[9px]">{defect.status}</Badge></TableCell>
                                                                                    <TableCell className="text-[10px] py-1.5">{defect.priority}</TableCell>
                                                                                    <TableCell className="text-[10px] py-1.5">{defect.assignee || 'Unassigned'}</TableCell>
                                                                                </TableRow>
                                                                            ))}
                                                                        </TableBody>
                                                                    </Table>
                                                                )}
                                                            </div>
                                                        ));
                                                    })()}
                                                </div>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            )}
                            {(agent.id >= 4) && agent.extraInfo && (
                                <div className="p-2 bg-primary/5 border border-primary/10 rounded-md text-center flex flex-col gap-2">
                                    <span className="text-[10px] font-bold text-primary truncate">{agent.extraInfo}</span>
                                    {(agent.id === 4 || agent.id === 5) && agent.updatedContent && (
                                        <Button variant="outline" size="sm" className="h-6 text-[10px] w-full" onClick={() => setPreviewReport({ name: "Updated JSON", content: agent.updatedContent! })}><Eye className="h-3 w-3 mr-1" /> View JSON</Button>
                                    )}
                                    {agent.id === 5 && agent.extraInfo === "Pending Commit" && preparedContentRef.current && (
                                        <Button variant="default" size="sm" className="h-6 text-[10px] w-full" disabled={isManualCommitting} onClick={async () => {
                                            setIsManualCommitting(true);
                                            try {
                                                const commitRes = await fetch('/api/gitlab/commit', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        token: configData?.gitlabToken,
                                                        projectId: configData?.gitlabProjectId,
                                                        branch: configData?.gitlabBranch,
                                                        baseUrl: configData?.gitlabBaseUrl,
                                                        insecureTls: configData?.gitlabInsecureTls ?? false,
                                                        filePath: preparedContentRef.current!.filePath,
                                                        content: preparedContentRef.current!.content
                                                    })
                                                });
                                                const result = await commitRes.json();
                                                if (commitRes.ok && result.success) {
                                                    addLog(5, `Committed changes to ${preparedContentRef.current!.filePath}. Hash: ${result.commitHash?.substring(0,8)}`);
                                                    setAgents(prev => prev.map(a => a.id === 5 ? { ...a, extraInfo: 'Data Synchronized' } : a));
                                                    toast({ title: 'Committed', description: 'Changes pushed to GitLab successfully.' });
                                                } else {
                                                    addLog(5, `GitLab Commit Error: ${result.error}`);
                                                    toast({ title: 'Commit Failed', description: result.error, variant: 'destructive' });
                                                }
                                            } catch (e: any) {
                                                addLog(5, `Commit error: ${e.message}`);
                                                toast({ title: 'Commit Failed', description: e.message, variant: 'destructive' });
                                            } finally {
                                                setIsManualCommitting(false);
                                            }
                                        }}>
                                            {isManualCommitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <GitBranch className="h-3 w-3 mr-1" />} Commit Now
                                        </Button>
                                    )}
                                    {agent.id === 7 && agent.extraInfo?.includes("Pending Review") && pendingJiraDefectsRef.current.length > 0 && (
                                        <Button variant="default" size="sm" className="h-6 text-[10px] w-full" disabled={isManualCreatingDefects} onClick={async () => {
                                            setIsManualCreatingDefects(true);
                                            let successCount = 0;
                                            try {
                                                for (const payload of pendingJiraDefectsRef.current) {
                                                    const formData = new FormData();
                                                    formData.append('config', JSON.stringify({
                                                        jiraLink: configData?.jiraLink,
                                                        jiraUser: configData?.jiraUser,
                                                        jiraApiToken: configData?.jiraApiToken,
                                                        jiraProjectKey: configData?.jiraProjectKey,
                                                        jiraIssueType: configData?.jiraIssueType || 'Bug'
                                                    }));
                                                    formData.append('issue', JSON.stringify({
                                                        summary: payload.summary,
                                                        description: payload.description
                                                    }));
                                                    if (payload.screenshot) formData.append('screenshot', payload.screenshot);

                                                    const jiraRes = await fetch('/api/jira/create', { method: 'POST', body: formData });
                                                    const jiraResult = await jiraRes.json();
                                                    if (jiraRes.ok && jiraResult.success) {
                                                        addLog(7, `Created Jira Ticket: ${jiraResult.key} — ${payload.summary.substring(0, 60)}...`);
                                                        successCount++;
                                                    } else {
                                                        addLog(7, `Jira API Error: ${jiraResult.error || 'Unknown'}`);
                                                    }
                                                }
                                                setAgents(prev => prev.map(a => a.id === 7 ? { ...a, extraInfo: `${successCount} Unique Tickets Created` } : a));
                                                pendingJiraDefectsRef.current = [];
                                                toast({ title: 'Defects Created', description: `${successCount} Jira ticket(s) created successfully.` });
                                            } catch (e: any) {
                                                addLog(7, `Error creating defects: ${e.message}`);
                                                toast({ title: 'Creation Failed', description: e.message, variant: 'destructive' });
                                            } finally {
                                                setIsManualCreatingDefects(false);
                                            }
                                        }}>
                                            {isManualCreatingDefects ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Bug className="h-3 w-3 mr-1" />} Create Defects
                                        </Button>
                                    )}
                                </div>
                            )}
                            {agent.id === 8 && (
                                <Button variant="outline" size="sm" className="h-6 text-[10px] w-full mt-2" onClick={() => setNotificationPreview(buildNotificationSummary())}>
                                    <Eye className="h-3 w-3 mr-1" /> Preview Consolidated Report
                                </Button>
                            )}
                        </CardContent>
                        <CardFooter className="p-4 pt-0 text-[10px] text-muted-foreground flex justify-between border-t mt-auto pt-2">
                            <span>Last run: {agent.lastRun ? format(new Date(agent.lastRun), 'HH:mm') : 'Never'}</span>
                            {agent.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                        </CardFooter>
                    </Card>
                ))}
            </div>

            <Card className="w-full flex flex-col mt-auto">
                <CardHeader className="pb-2 border-b"><CardTitle className="text-sm flex items-center gap-2"><Terminal className="h-4 w-4" /> Agent Pipeline Console</CardTitle></CardHeader>
                <CardContent className="p-0 overflow-hidden">
                    <ScrollArea className="h-[300px] w-full bg-slate-950 font-mono text-[11px] p-4 text-slate-300">
                        {agents.some(a => a.logs.length > 0) ? (
                            <div className="space-y-1">
                                {agents.flatMap(a => a.logs.map((log, i) => (
                                    <div key={`${a.id}-${i}`} className="flex gap-2"><span className="text-primary shrink-0">[{a.name}]</span><span className="whitespace-pre-wrap">{log}</span></div>
                                )))}
                                <div ref={logsEndRef} />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2 opacity-50"><Terminal className="h-8 w-8" /><p>No activity recorded.</p></div>
                        )}
                    </ScrollArea>
                </CardContent>
            </Card>

            <Dialog open={!!previewReport} onOpenChange={(open) => !open && setPreviewReport(null)}>
                <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b"><DialogTitle>Data Preview: {previewReport?.name}</DialogTitle></DialogHeader>
                    <div className="flex-1 bg-slate-950 p-4 font-mono text-xs overflow-hidden"><ScrollArea className="h-full w-full"><pre className="text-slate-300">{previewReport?.content}</pre></ScrollArea></div>
                    <DialogFooter className="p-4 border-t"><Button variant="outline" onClick={() => handleDownloadReport(previewReport!.name, previewReport!.content)}>Download JSON</Button><Button onClick={() => setPreviewReport(null)}>Close</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!notificationPreview} onOpenChange={(open) => !open && setNotificationPreview(null)}>
                <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b">
                        <DialogTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Notification Report Preview</DialogTitle>
                        <DialogDescription className="text-xs">Exact payload that will be delivered to Microsoft Teams when this agent runs.</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="flex-1">
                        {notificationPreview && (
                            <div className="p-4 space-y-4 text-xs">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 border rounded-md bg-muted/30"><div className="text-[10px] uppercase text-muted-foreground">Solution</div><div className="font-semibold">{notificationPreview.solution}</div></div>
                                    <div className="p-3 border rounded-md bg-muted/30"><div className="text-[10px] uppercase text-muted-foreground">Source Report</div><div className="font-semibold truncate">{notificationPreview.reportName || 'n/a'}</div></div>
                                    <div className="p-3 border rounded-md bg-muted/30"><div className="text-[10px] uppercase text-muted-foreground">Started</div><div className="font-semibold">{notificationPreview.startedAt ? new Date(notificationPreview.startedAt).toLocaleString() : 'n/a'}</div></div>
                                    <div className="p-3 border rounded-md bg-muted/30"><div className="text-[10px] uppercase text-muted-foreground">Finished</div><div className="font-semibold">{notificationPreview.finishedAt ? new Date(notificationPreview.finishedAt).toLocaleString() : 'n/a'}</div></div>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="p-3 border rounded-md text-center bg-muted/20"><div className="text-[10px] uppercase text-muted-foreground">Total</div><div className="text-lg font-bold">{notificationPreview.total}</div></div>
                                    <div className="p-3 border rounded-md text-center bg-green-500/10 border-green-200"><div className="text-[10px] uppercase text-green-700">Passed</div><div className="text-lg font-bold text-green-700">{notificationPreview.passed}</div></div>
                                    <div className="p-3 border rounded-md text-center bg-red-500/10 border-red-200"><div className="text-[10px] uppercase text-red-700">Failed</div><div className="text-lg font-bold text-red-700">{notificationPreview.failed}</div></div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 border rounded-md"><div className="text-[10px] uppercase text-muted-foreground">GitLab Updates</div><div className="font-semibold">{notificationPreview.gitlabUpdates}</div><div className="text-[10px] text-muted-foreground mt-1">{notificationPreview.gitlabCommitInfo || 'n/a'}</div></div>
                                    <div className="p-3 border rounded-md"><div className="text-[10px] uppercase text-muted-foreground">Prepared Data File</div><div className="font-mono text-[10px] truncate">{notificationPreview.preparedDataFile || 'n/a'}</div><div className="text-[10px] text-muted-foreground mt-1">{notificationPreview.preparedDataInfo || 'n/a'}</div></div>
                                    <div className="p-3 border rounded-md"><div className="text-[10px] uppercase text-muted-foreground">Pipeline Orchestrator</div><div className="font-semibold">{notificationPreview.orchestratorStatus}</div></div>
                                    <div className="p-3 border rounded-md"><div className="text-[10px] uppercase text-muted-foreground">Jira Defect Scout</div><div className="font-semibold">{notificationPreview.jiraStatus}</div></div>
                                </div>
                                {Object.keys(notificationPreview.classificationCounts || {}).length > 0 && (
                                    <div className="border rounded-md p-3">
                                        <div className="text-[10px] uppercase text-muted-foreground mb-2">Failure Classification</div>
                                        <div className="flex flex-wrap gap-2">
                                            {Object.entries(notificationPreview.classificationCounts as Record<string, number>).map(([k, v]) => (
                                                <Badge key={k} variant="outline" className="text-[10px]">{k}: {v}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {notificationPreview.failedScenarios?.length > 0 && (
                                    <div className="border rounded-md p-3">
                                        <div className="text-[10px] uppercase text-muted-foreground mb-2">Failed Scenarios (top 10)</div>
                                        <ul className="space-y-1 list-disc pl-5">
                                            {notificationPreview.failedScenarios.map((n: string, i: number) => (<li key={i}>{n}</li>))}
                                        </ul>
                                    </div>
                                )}
                                <div className="border rounded-md p-3">
                                    <div className="text-[10px] uppercase text-muted-foreground mb-2">Per-Agent Execution Details</div>
                                    <div className="space-y-2">
                                        {notificationPreview.agents?.map((a: any) => (
                                            <div key={a.id} className="border rounded p-2 bg-muted/20">
                                                <div className="flex items-center justify-between">
                                                    <div className="font-semibold text-[11px]">Agent {a.id}: {a.name}</div>
                                                    <Badge variant={a.status === 'success' ? 'secondary' : a.status === 'error' ? 'destructive' : 'outline'} className="text-[9px] uppercase">{a.status}</Badge>
                                                </div>
                                                {a.extraInfo && <div className="text-[10px] text-primary mt-1">{a.extraInfo}</div>}
                                                {a.metrics && <div className="text-[10px] text-muted-foreground mt-1">Total {a.metrics.total} • Passed {a.metrics.passed} • Failed {a.metrics.failed}</div>}
                                                {a.recentLogs?.length > 0 && (
                                                    <div className="mt-2 bg-slate-950 text-slate-300 font-mono text-[9px] rounded p-2 space-y-0.5">
                                                        {a.recentLogs.map((l: string, i: number) => (<div key={i}>{l}</div>))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <details className="border rounded-md p-3">
                                    <summary className="text-[10px] uppercase text-muted-foreground cursor-pointer">Raw JSON Payload</summary>
                                    <pre className="mt-2 bg-slate-950 text-slate-300 font-mono text-[10px] rounded p-2 overflow-x-auto">{JSON.stringify(notificationPreview, null, 2)}</pre>
                                </details>
                            </div>
                        )}
                    </ScrollArea>
                    <DialogFooter className="p-4 border-t gap-2">
                        <Button variant="outline" onClick={() => handleDownloadReport('notification-report-preview.json', JSON.stringify(notificationPreview, null, 2))}>Download JSON</Button>
                        <Button variant="outline" onClick={async () => {
                            if (!configData?.teamsWebhookUrl) { toast({ variant: 'destructive', title: 'Missing Webhook', description: 'Configure Teams Webhook URL first.' }); return; }
                            try {
                                const res = await fetch('/api/notifications/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ webhookUrl: configData.teamsWebhookUrl, summary: notificationPreview }) });
                                if (res.ok) toast({ title: 'Sent', description: 'Report sent to Teams channel.' });
                                else { const t = await res.text(); toast({ variant: 'destructive', title: `Send Failed (${res.status})`, description: t.slice(0, 300) }); }
                            } catch (e: any) { toast({ variant: 'destructive', title: 'Send Failed', description: e?.message || String(e) }); }
                        }}>Send to Teams Now</Button>
                        <Button onClick={() => setNotificationPreview(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!scenarioListView} onOpenChange={(open) => !open && setScenarioListView(null)}>
                <DialogContent className="max-w-3xl h-[70vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b"><DialogTitle>{scenarioListView?.title}</DialogTitle></DialogHeader>
                    <div className="p-4 border-b"><Input placeholder="Search scenarios or tags..." value={scenarioSearch} onChange={(e) => setScenarioListViewSearch(e.target.value)} /></div>
                    <div className="flex-1 overflow-hidden">
                        <ScrollArea className="h-full w-full p-4">
                            <div className="space-y-3">
                                {filteredScenarios.map((scenario, i) => (
                                    <button key={i} className="w-full text-left p-3 border rounded-lg hover:bg-accent/5" onClick={() => handleViewScenarioSteps(scenario.name)}>
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-1">
                                                <h4 className="text-sm font-semibold">{scenario.name}</h4>
                                                <div className="flex flex-wrap gap-1">
                                                    {scenario.tags.map((tag, idx) => (
                                                        <Badge key={idx} variant="outline" className="text-[8px] py-0 px-1 font-mono">{tag}</Badge>
                                                    ))}
                                                </div>
                                            </div>
                                            <Badge variant={scenario.status === 'passed' ? 'outline' : 'destructive'} className="text-[10px] uppercase">{scenario.status}</Badge>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={!!classificationListView} onOpenChange={(open) => !open && setClassificationListView(null)}>
                <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b">
                        <DialogTitle>{classificationListView?.title}</DialogTitle>
                        <DialogDescription>Detailed list of failures categorized as {classificationListView?.classification}</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-hidden">
                        <ScrollArea className="h-full w-full p-4">
                            <div className="space-y-4">
                                {classificationListView?.items.map((item, i) => {
                                    const scenario = scenariosRef.current?.find(s => s.name === item.scenarioName);
                                    return (
                                        <div key={i} className="p-4 border rounded-lg bg-card space-y-3 shadow-sm">
                                            <div className="flex justify-between items-start">
                                                <h4 className="text-sm font-bold text-foreground">{item.scenarioName}</h4>
                                                <Badge variant="outline" className="text-[10px] uppercase bg-primary/5">{item.classification}</Badge>
                                            </div>
                                            <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded border-l-4 border-primary">
                                                <span className="font-semibold text-primary uppercase text-[9px] mr-1">Reasoning:</span>
                                                {item.reasoning}
                                            </div>
                                            {scenario?.logs && (
                                                <div className="space-y-1">
                                                    <div className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                                                        <Terminal className="h-3 w-3" /> Failure Logs
                                                    </div>
                                                    <div className="bg-slate-950 p-3 rounded font-mono text-[10px] text-slate-300 overflow-x-auto border border-white/5">
                                                        <pre className="whitespace-pre-wrap">{scenario.logs}</pre>
                                                    </div>
                                                </div>
                                            )}
                                            <div className="flex justify-end pt-1">
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    className="h-7 text-[10px] bg-primary/5 hover:bg-primary/10 border-primary/20" 
                                                    onClick={() => {
                                                        handleViewScenarioSteps(item.scenarioName);
                                                        setClassificationListView(null);
                                                    }}
                                                >
                                                    <Eye className="h-3 w-3 mr-1" /> View Full Step Trace
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={!!selectedScenarioSteps} onOpenChange={(open) => !open && setSelectedScenarioSteps(null)}>
                <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b"><DialogTitle>Step Trace: {selectedScenarioSteps?.name}</DialogTitle></DialogHeader>
                    <ScrollArea className="flex-1 p-4">
                        <Table>
                            <TableHeader><TableRow><TableHead>Step Definition</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Duration</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {selectedScenarioSteps?.steps?.map((step: any, idx: number) => {
                                    const screenshots = [
                                        ...(step.embeddings || []), 
                                        ...(step.result?.embeddings || [])
                                    ].filter((e: any) => e.mime_type?.startsWith('image/'));
                                    const hasScreenshots = screenshots.length > 0;

                                    return (
                                        <TableRow key={idx}>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <div className="text-xs font-mono"><span className="font-bold text-primary mr-2 uppercase">{step.keyword}</span>{step.name}</div>
                                                    {step.output && step.output.length > 0 && (
                                                        <div className="bg-muted/50 p-1.5 rounded border text-[10px] font-mono text-muted-foreground mt-1">
                                                            {step.output.map((out: string, i: number) => <div key={i}>{out}</div>)}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1.5">
                                                    <Badge variant={step.result?.status === 'passed' ? 'outline' : 'destructive'} className="text-[9px] uppercase w-fit">{step.result?.status}</Badge>
                                                    <div className="flex gap-2">
                                                        {step.result?.error_message && (
                                                            <Dialog>
                                                                <DialogTrigger asChild>
                                                                    <Button variant="link" size="sm" className="h-auto p-0 text-[10px] text-destructive underline flex gap-1">
                                                                        <Terminal className="h-2.5 w-2.5" /> View Logs
                                                                    </Button>
                                                                </DialogTrigger>
                                                                <DialogContent className="max-w-3xl">
                                                                    <DialogHeader><DialogTitle>Failure Log Trace</DialogTitle><DialogDescription>{step.keyword}{step.name}</DialogDescription></DialogHeader>
                                                                    <ScrollArea className="max-h-[60vh] rounded-md border bg-slate-950 p-4 font-mono text-slate-300 text-xs leading-relaxed">
                                                                        <pre className="whitespace-pre-wrap">{step.result.error_message}</pre>
                                                                    </ScrollArea>
                                                                </DialogContent>
                                                            </Dialog>
                                                        )}
                                                        {hasScreenshots && (
                                                            <Dialog>
                                                                <DialogTrigger asChild>
                                                                    <Button variant="link" size="sm" className="h-auto p-0 text-[10px] text-blue-600 underline flex gap-1">
                                                                        <Camera className="h-2.5 w-2.5" /> View Screenshot
                                                                    </Button>
                                                                </DialogTrigger>
                                                                <DialogContent className="max-w-5xl">
                                                                    <DialogHeader><DialogTitle>Step Screenshot</DialogTitle><DialogDescription>{step.keyword}{step.name}</DialogDescription></DialogHeader>
                                                                    <ScrollArea className="max-h-[80vh] flex flex-col items-center justify-center bg-muted p-2 rounded-md border">
                                                                        {screenshots.map((e: any, idx: number) => (
                                                                            <img key={idx} src={`data:${e.mime_type};base64,${e.data}`} alt={`Execution Screenshot ${idx}`} className="max-w-full h-auto shadow-md rounded-sm mb-4 last:mb-0 border border-border" />
                                                                        ))}
                                                                    </ScrollArea>
                                                                </DialogContent>
                                                            </Dialog>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right text-[10px] text-muted-foreground whitespace-nowrap">{formatNanosToTime(step.result?.duration || 0)}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </DialogContent>
            </Dialog>
        </div>
    );
}
