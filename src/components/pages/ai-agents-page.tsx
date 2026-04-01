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
import { doc } from 'firebase/firestore';
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
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

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
    updatedContent?: string; 
    targetFilePath?: string;
}

const AGENTS_CONFIG: Omit<AgentStatus, 'status' | 'lastRun' | 'logs'>[] = [
    { id: 1, name: "Execution Fetcher", description: "Fetches latest execution JSON from Selenium Data Store (fallback to Confluence)." },
    { id: 2, name: "JSON Report Parser", description: "Analyzes Agent 1 JSON data to identify pass and failure counts using AI." },
    { id: 3, name: "Failure Classifier", description: "Determines if failures are Functional, Data, Environment, or Automation issues." },
    { id: 4, name: "Jira Defect Scout", description: "Automates Jira ticket creation for functional failures with steps and screenshots." },
    { id: 5, name: "Prepare data for data Issue", description: "Identifies test data file from step output and prepares updated JSON with 'Agent: found'." },
    { id: 6, name: "GitLab Data Sync", description: "Automatically commits prepared test data updates back to GitLab repositories." },
    { id: 7, name: "Pipeline Orchestrator", description: "Triggers targeted reruns in GitLab pipelines by calling specified pipeline schedules." },
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
    const [isTestingGitlab, setIsTestingGitlab] = useState(false);
    const [isTestingTeams, setIsTestingTeams] = useState(false);
    
    // View States
    const [previewReport, setPreviewReport] = useState<{ name: string, content: string } | null>(null);
    const [scenarioListView, setScenarioListView] = useState<{ title: string, status: 'passed' | 'failed', scenarios: AgentMetrics['scenarios'] } | null>(null);
    const [classificationListView, setClassificationListView] = useState<{ title: string, classification: string, items: FailureClassificationOutput['classifications'] } | null>(null);
    const [selectedScenarioSteps, setSelectedScenarioSteps] = useState<any | null>(null);
    const [scenarioSearch, setScenarioListViewSearch] = useState("");
    
    // Failure Rules Edit State
    const [newPattern, setNewPattern] = useState("");
    const [newCategory, setNewCategory] = useState<'Functional Issue' | 'Data Issue' | 'Environment Issue' | 'Automation script issue'>('Functional Issue');

    const reportRef = useRef<{ name: string, data: any } | null>(null);
    const scenariosRef = useRef<AgentMetrics['scenarios']>([]);
    const classificationsRef = useRef<FailureClassificationOutput['classifications']>([]);
    const preparedContentRef = useRef<{ content: string, filePath: string } | null>(null);
    
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

    const handleUpdateConfig = (key: string, value: any) => {
        if (!configRef) return;
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
                    projectId: configData.gitlabProjectId
                })
            });
            
            const result = await response.json();
            if (response.ok) {
                toast({ title: "GitLab Test Successful", description: result.message });
            } else {
                toast({ 
                    variant: "destructive", 
                    title: "Test Failed", 
                    description: result.error || "Could not connect to GitLab." 
                });
            }
        } catch (e: any) {
            toast({ variant: "destructive", title: "Network Error", description: e.message });
        } finally {
            setIsTestingGitlab(false);
        }
    };

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
        } else if (agent.id === 3) {
            addLog(agent.id, "Initializing Failure Classifier (Rule-Based Mode)...");
            const failedScenarios = scenariosRef.current?.filter(s => s.status?.toLowerCase() === 'failed') || [];
            const userRules = configData?.failureRules || [];

            if (failedScenarios.length > 0) {
                const results: FailureClassificationOutput['classifications'] = [];
                let fCount = 0, dCount = 0, eCount = 0, aCount = 0;
                
                failedScenarios.forEach(s => {
                    const errorLogs = s.logs || '';
                    let category: 'Functional Issue' | 'Data Issue' | 'Environment Issue' | 'Automation script issue' | null = null;
                    let reason = "";

                    // 1. Check user-defined rules first
                    const matchedRule = userRules.find(rule => errorLogs.includes(rule.pattern));
                    if (matchedRule) {
                        category = matchedRule.category;
                        reason = `Matched User Rule: "${matchedRule.pattern}"`;
                    } else {
                        // 2. Fallback to hardcoded heuristics if no user rule matches
                        if (errorLogs.includes("java.lang.AssertionError: Total Number of Order Failed to Plan :")) { 
                            category = 'Functional Issue'; 
                            reason = "Explicit System Rule: 'Order Failed to Plan'."; 
                        } 
                        else if (errorLogs.toLowerCase().includes("assertionerror") || errorLogs.toLowerCase().includes("mismatch")) { 
                            category = 'Functional Issue'; 
                            reason = "Assertion failure detected."; 
                        }
                        else if (errorLogs.includes("503") || errorLogs.includes("502")) { 
                            category = 'Environment Issue'; 
                            reason = "Network or infrastructure error detected."; 
                        } else {
                            category = 'Data Issue';
                            reason = "Defaulted to Data Issue based on typical failure context.";
                        }
                    }

                    if (category === 'Functional Issue') fCount++; 
                    else if (category === 'Data Issue') dCount++; 
                    else if (category === 'Environment Issue') eCount++;
                    else if (category === 'Automation script issue') aCount++;

                    results.push({ scenarioName: s.name, classification: category || 'Functional Issue', reasoning: reason });
                });
                
                classificationSummary = { functionalCount: fCount, dataCount: dCount, environmentCount: eCount, automationCount: aCount };
                classifications = results;
                classificationsRef.current = classifications;
                addLog(agent.id, `Classification Summary: ${fCount} Functional, ${dCount} Data, ${eCount} Environment, ${aCount} Automation.`);
            } else {
                classificationSummary = { functionalCount: 0, dataCount: 0, environmentCount: 0, automationCount: 0 };
                classifications = [];
                classificationsRef.current = [];
            }
        } else if (agent.id === 4) {
            addLog(agent.id, "Initializing Jira Defect Scout...");
            const functionalFailures = classificationsRef.current?.filter(c => c.classification === 'Functional Issue') || [];
            if (functionalFailures.length > 0) {
                const uniqueFailures = Array.from(new Set(functionalFailures.map(f => f.scenarioName)));
                let successCount = 0;
                for (const scenarioName of uniqueFailures) {
                    try {
                        // 1. Find detailed scenario data for steps and screenshots
                        let scenarioObj: any = null;
                        reportRef.current?.data?.test_results?.some((f: any) => {
                            scenarioObj = f.elements?.find((s: any) => s.name === scenarioName);
                            return !!scenarioObj;
                        });

                        if (!scenarioObj) {
                            addLog(agent.id, `Warning: Detailed data for ${scenarioName} not found.`);
                            continue;
                        }

                        // 2. Build detailed description
                        let description = "AI Automated Failure Report\n\nTest Steps:\n";
                        let screenshotFile: File | null = null;
                        let failureLog = "";

                        scenarioObj.steps?.forEach((step: any, sIdx: number) => {
                            const status = step.result?.status?.toUpperCase() || 'UNKNOWN';
                            description += `${sIdx + 1}. [${status}] ${step.keyword}${step.name}\n`;
                            
                            if (status === 'FAILED') {
                                failureLog = step.result?.error_message || "No logs captured.";
                                
                                // Extract first screenshot from failed step if available
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
                                    screenshotFile = new File([blob], `failure_${scenarioName.replace(/\W+/g, '_')}.png`, { type: img.mime_type });
                                }
                            }
                        });

                        if (failureLog) {
                            description += `\nDetailed Failure Logs:\n${failureLog}`;
                        }

                        const formData = new FormData();
                        formData.append('config', JSON.stringify({ 
                            jiraLink: configData?.jiraLink, 
                            jiraUser: configData?.jiraUser, 
                            jiraApiToken: configData?.jiraApiToken, 
                            jiraProjectKey: configData?.jiraProjectKey,
                            jiraIssueType: configData?.jiraIssueType || 'Bug'
                        }));
                        formData.append('issue', JSON.stringify({ 
                            summary: `AI FAILURE: ${scenarioName}`, 
                            description: description 
                        }));
                        
                        if (screenshotFile) {
                            formData.append('screenshot', screenshotFile);
                        }

                        const jiraRes = await fetch('/api/jira/create', { method: 'POST', body: formData });
                        const jiraResult = await jiraRes.json();
                        if (jiraRes.ok && jiraResult.success) { 
                            addLog(agent.id, `Created Jira Ticket: ${jiraResult.key}`); 
                            successCount++; 
                        } else {
                            addLog(agent.id, `Jira API Error: ${jiraResult.error || 'Unknown'}`);
                        }
                    } catch (e: any) {
                        addLog(agent.id, `Internal error creating Jira for ${scenarioName}: ${e.message}`);
                    }
                }
                extra = `${successCount} Tickets Created`;
            } else { addLog(agent.id, "No functional failures identified."); }
        } else if (agent.id === 5) {
            addLog(agent.id, "Starting: Prepare data for data Issue...");
            const dataFailures = classificationsRef.current?.filter(c => c.classification === 'Data Issue') || [];
            if (dataFailures.length > 0) {
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
                    let totalPrepared = 0;
                    let lastContent = null;
                    for (const f of dataFailures) {
                        try {
                            const prepRes = await fetch('/api/gitlab/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: configData?.gitlabToken, projectId: configData?.gitlabProjectId, branch: configData?.gitlabBranch, filePath: testDataFullGitPath, scenarioName: f.scenarioName }) });
                            const result = await prepRes.json();
                            if (prepRes.ok && result.success) { totalPrepared++; lastContent = JSON.stringify(result.updatedContent, null, 2); }
                        } catch (e) {}
                    }
                    if (totalPrepared > 0) {
                        preparedContentRef.current = { content: lastContent!, filePath: testDataFullGitPath };
                        updatedContent = lastContent!;
                        targetFilePath = testDataFullGitPath;
                        extra = `${totalPrepared} Scenarios Prepared`;
                    } else { executionStatus = 'error'; }
                } else { executionStatus = 'error'; }
            }
        } else if (agent.id === 6) {
            addLog(agent.id, "Initializing GitLab Data Sync...");
            if (preparedContentRef.current) {
                try {
                    const commitRes = await fetch('/api/gitlab/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: configData?.gitlabToken, projectId: configData?.gitlabProjectId, branch: configData?.gitlabBranch, filePath: preparedContentRef.current.filePath, content: preparedContentRef.current.content }) });
                    const result = await commitRes.json();
                    if (commitRes.ok && result.success) { extra = "Data Synchronized"; updatedContent = preparedContentRef.current.content; }
                    else executionStatus = 'error';
                } catch (e) { executionStatus = 'error'; }
            }
        } else if (agent.id === 7) {
            addLog(agent.id, "Initializing Pipeline Orchestrator...");
            const scheduleDesc = configData?.gitlabPipelineScheduleDescription;
            if (scheduleDesc) {
                try {
                    const triggerRes = await fetch('/api/gitlab/trigger-schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: configData?.gitlabToken, projectId: configData?.gitlabProjectId, scheduleDescription: scheduleDesc }) });
                    const result = await triggerRes.json();
                    if (triggerRes.ok && result.success) extra = `Triggered: ${scheduleDesc}`;
                    else executionStatus = 'error';
                } catch (e) { executionStatus = 'error'; }
            }
        } else if (agent.id === 8) {
            addLog(agent.id, "Initializing Notification Trigger...");
            if (configData?.teamsWebhookUrl) {
                const summary = {
                    solution: reportRef.current?.data?.solution || "Project Alpha",
                    reportName: reportRef.current?.name,
                    total: agents.find(a => a.id === 2)?.metrics?.total,
                    passed: agents.find(a => a.id === 2)?.metrics?.passed,
                    failed: agents.find(a => a.id === 2)?.metrics?.failed,
                    jiraStatus: agents.find(a => a.id === 4)?.extraInfo,
                    gitlabUpdates: parseInt(agents.find(a => a.id === 5)?.extraInfo || "0"),
                    orchestratorStatus: agents.find(a => a.id === 7)?.extraInfo
                };
                try {
                    const res = await fetch('/api/notifications/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ webhookUrl: configData.teamsWebhookUrl, summary }) });
                    if (res.ok) extra = "Teams Notification Sent";
                    else executionStatus = 'error';
                } catch (e) { executionStatus = 'error'; }
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
        preparedContentRef.current = null;
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
                                    {idx === 0 && <Database className="h-4 w-4 text-primary" />}
                                    {idx === 1 && <FileJson className="h-4 w-4 text-primary" />}
                                    {idx === 2 && <ShieldAlert className="h-4 w-4 text-primary" />}
                                    {idx === 3 && <Bug className="h-4 w-4 text-primary" />}
                                    {idx === 4 && <ListChecks className="h-4 w-4 text-primary" />}
                                    {idx === 5 && <GitBranch className="h-4 w-4 text-primary" />}
                                    {idx === 6 && <RefreshCcw className="h-4 w-4 text-primary" />}
                                    {idx === 7 && <MessageSquare className="h-4 w-4 text-primary" />}
                                </div>
                                <div className="flex gap-1">
                                    {idx === 2 && (
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-primary">
                                                    <Settings className="h-3.5 w-3.5" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-2xl">
                                                <DialogHeader>
                                                    <DialogTitle>Failure Classification Rules</DialogTitle>
                                                    <DialogDescription>Define patterns in error logs to automatically categorize test failures.</DialogDescription>
                                                </DialogHeader>
                                                <div className="space-y-4 py-4">
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
                                                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100" onClick={() => handleRemoveFailureRule(i)}>
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
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                    {idx === 3 && (
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
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                    {(idx === 4 || idx === 5) && (
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
                                                    <div className="grid gap-2"><Label>Project ID</Label><Input defaultValue={configData?.gitlabProjectId || ''} onBlur={(e) => handleUpdateConfig('gitlabProjectId', e.target.value)} /></div>
                                                    <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Branch</Label><Input defaultValue={configData?.gitlabBranch || 'main'} onBlur={(e) => handleUpdateConfig('gitlabBranch', e.target.value)} /></div><div className="grid gap-2"><Label>Path Prefix</Label><Input defaultValue={configData?.gitlabFilePathPrefix || ''} onBlur={(e) => handleUpdateConfig('gitlabFilePathPrefix', e.target.value)} /></div></div>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                    {idx === 6 && (
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
                                    {idx === 7 && (
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
                                                        <Button variant="outline" size="sm" onClick={handleTestTeams} disabled={isTestingTeams} className="h-8 text-xs">{isTestingTeams ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <FlaskConical className="h-3 w-3 mr-2" />}Test Channel</Button>
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
                            {idx === 0 && agent.extraInfo && (
                                <div className="space-y-2">
                                    <div className="p-1.5 bg-primary/5 border border-primary/10 rounded text-[9px] font-mono flex items-center gap-1.5"><FileCode className="h-3 w-3 text-primary shrink-0" /><span className="truncate text-primary font-bold">{agent.extraInfo}</span></div>
                                    <Button variant="outline" size="sm" className="h-6 text-[10px] w-full" onClick={() => handleViewReport(agent.extraInfo!)}><Eye className="h-3 w-3 mr-1" /> View Fetched JSON</Button>
                                </div>
                            )}
                            {idx === 1 && agent.metrics && (
                                <div className="grid grid-cols-2 gap-2">
                                    <button className="bg-green-500/10 border border-green-200 rounded p-1 text-center" onClick={() => handleOpenScenarioList('Passed Scenarios', 'passed', agent.metrics?.scenarios)}><div className="text-[8px] text-green-600 font-semibold uppercase">Passed</div><div className="text-xs font-bold text-green-700">{agent.metrics.passed}</div></button>
                                    <button className="bg-red-500/10 border border-red-200 rounded p-1 text-center" onClick={() => handleOpenScenarioList('Failed Scenarios', 'failed', agent.metrics?.scenarios)}><div className="text-[8px] text-red-600 font-semibold uppercase">Failed</div><div className="text-xs font-bold text-red-700">{agent.metrics.failed}</div></button>
                                </div>
                            )}
                            {idx === 2 && agent.classificationSummary && (
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button className="bg-red-500/10 border border-red-200 rounded p-1 text-center" onClick={() => handleOpenClassificationList('Functional Issues', 'Functional Issue', agent.classifications)}><div className="text-[7px] text-red-600 font-semibold uppercase">Func</div><div className="text-xs font-bold text-red-700">{agent.classificationSummary.functionalCount}</div></button>
                                    <button className="bg-amber-500/10 border border-amber-200 rounded p-1 text-center" onClick={() => handleOpenClassificationList('Data Issues', 'Data Issue', agent.classifications)}><div className="text-[7px] text-amber-600 font-semibold uppercase">Data</div><div className="text-xs font-bold text-amber-700">{agent.classificationSummary.dataCount}</div></button>
                                    <button className="bg-blue-500/10 border border-blue-200 rounded p-1 text-center" onClick={() => handleOpenClassificationList('Env. Issues', 'Environment Issue', agent.classifications)}><div className="text-[7px] text-blue-600 font-semibold uppercase">Env</div><div className="text-xs font-bold text-blue-700">{agent.classificationSummary.environmentCount}</div></button>
                                    <button className="bg-purple-500/10 border border-purple-200 rounded p-1 text-center" onClick={() => handleOpenClassificationList('Automation Issues', 'Automation script issue', agent.classifications)}><div className="text-[7px] text-purple-600 font-semibold uppercase">Auto</div><div className="text-xs font-bold text-purple-700">{agent.classificationSummary.automationCount}</div></button>
                                </div>
                            )}
                            {(idx >= 3) && agent.extraInfo && (
                                <div className="p-2 bg-primary/5 border border-primary/10 rounded-md text-center flex flex-col gap-2">
                                    <span className="text-[10px] font-bold text-primary truncate">{agent.extraInfo}</span>
                                    {(idx === 4 || idx === 5) && agent.updatedContent && (
                                        <Button variant="outline" size="sm" className="h-6 text-[10px] w-full" onClick={() => setPreviewReport({ name: "Updated JSON", content: agent.updatedContent! })}><Eye className="h-3 w-3 mr-1" /> View JSON</Button>
                                    )}
                                </div>
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

            {/* Preview Dialog */}
            <Dialog open={!!previewReport} onOpenChange={(open) => !open && setPreviewReport(null)}>
                <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b"><DialogTitle>Data Preview: {previewReport?.name}</DialogTitle></DialogHeader>
                    <div className="flex-1 bg-slate-950 p-4 font-mono text-xs overflow-hidden"><ScrollArea className="h-full w-full"><pre className="text-slate-300">{previewReport?.content}</pre></ScrollArea></div>
                    <DialogFooter className="p-4 border-t"><Button variant="outline" onClick={() => handleDownloadReport(previewReport!.name, previewReport!.content)}>Download JSON</Button><Button onClick={() => setPreviewReport(null)}>Close</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Scenario List Dialog */}
            <Dialog open={!!scenarioListView} onOpenChange={(open) => !open && setScenarioListView(null)}>
                <DialogContent className="max-w-3xl h-[70vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-4 border-b"><DialogTitle>{scenarioListView?.title}</DialogTitle></DialogHeader>
                    <div className="p-4 border-b"><Input placeholder="Search scenarios..." value={scenarioSearch} onChange={(e) => setScenarioListViewSearch(e.target.value)} /></div>
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

            {/* Classification List Dialog */}
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
                                    const scenario = scenariosRef.current.find(s => s.name === item.scenarioName);
                                    return (
                                        <div key={i} className="p-4 border rounded-lg bg-card space-y-3 shadow-sm">
                                            <div className="flex justify-between items-start">
                                                <h4 className="text-sm font-bold text-foreground">{item.scenarioName}</h4>
                                                <Badge variant="outline" className="text-[10px] uppercase bg-primary/5">{item.classification}</Badge>
                                            </div>
                                            <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded border-l-4 border-primary">
                                                <span className="font-semibold text-primary uppercase text-[9px] mr-1">AI Reasoning:</span>
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

            {/* Steps Detail Dialog */}
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
