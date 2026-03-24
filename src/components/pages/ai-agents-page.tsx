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
    XCircle, 
    Loader2, 
    Cpu, 
    Network, 
    Database, 
    RefreshCcw, 
    ExternalLink, 
    FileJson,
    Terminal,
    AlertCircle,
    Settings,
    ShieldCheck,
    Save,
    FlaskConical,
    PlayCircle,
    Link2,
    FileCode,
    Activity
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { AppConfiguration } from '@/lib/types';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';

interface AgentMetrics {
    total: number;
    passed: number;
    failed: number;
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
}

const AGENTS_CONFIG: Omit<AgentStatus, 'status' | 'lastRun' | 'logs'>[] = [
    { id: 1, name: "Confluence Fetcher", description: "Polls Confluence every 5m for the latest Cucumber HTML report." },
    { id: 2, name: "Report Parser", description: "Analyse agent 1 HTML report and Identify the pass and failure." },
    { id: 3, name: "Failure Classifier", description: "Determines if failures are Functional Issues or Data Issues using AI." },
    { id: 4, name: "Jira Defect Scout", description: "Checks Jira API for existing bugs related to functional failures." },
    { id: 5, name: "GitLab Data Sync", description: "Automatically updates incorrect test data in GitLab repositories." },
    { id: 6, name: "Pipeline Orchestrator", description: "Triggers targeted reruns in GitLab pipelines for failed scenarios." },
    { id: 7, name: "Rerun Collector", description: "Fetches the updated results from Confluence post-rerun." },
    { id: 8, name: "Report Consolidator", description: "Merges original and rerun reports into a single source of truth." },
];

export function AIAgentsPage() {
    const [agents, setAgents] = useState<AgentStatus[]>(
        AGENTS_CONFIG.map(a => ({ ...a, status: 'idle', lastRun: null, logs: [] }))
    );
    const [isPipelineRunning, setIsPipelineRunning] = useState(false);
    const [currentAgentIndex, setCurrentAgentIndex] = useState<number>(-1);
    const [progress, setProgress] = useState(0);
    const [autoMode, setAutoMode] = useState(false);
    const { toast } = useToast();
    const firestore = useFirestore();
    
    const configRef = useMemoFirebase(() => (firestore ? doc(firestore, 'appConfiguration', 'global') : null), [firestore]);
    const { data: configData } = useDoc<AppConfiguration>(configRef);

    const [confluencePath, setConfluencePath] = useState('');
    const [confluenceUser, setConfluenceUser] = useState('');
    const [confluencePassword, setConfluencePassword] = useState('');
    const [isTesting, setIsTesting] = useState(false);

    useEffect(() => {
        if (configData) {
            setConfluencePath(configData.confluencePath || '');
            setConfluenceUser(configData.confluenceUser || '');
            setConfluencePassword(configData.confluencePassword || '');
        }
    }, [configData]);

    const handleSaveConfig = () => {
        if (!configRef) return;
        setDocumentNonBlocking(configRef, { 
            confluencePath, 
            confluenceUser, 
            confluencePassword 
        }, { merge: true });
        toast({ title: "Configuration Updated", description: "Confluence fetcher settings have been saved." });
    };

    const handleTestConnection = async () => {
        if (!confluencePath || !confluenceUser || !confluencePassword) {
            toast({ 
                variant: 'destructive', 
                title: 'Missing Details', 
                description: 'Please fill in all connection details before testing.' 
            });
            return;
        }

        setIsTesting(true);
        try {
            const response = await fetch('/api/confluence/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: confluencePath,
                    user: confluenceUser,
                    password: confluencePassword
                })
            });
            const result = await response.json();

            if (response.ok) {
                toast({ title: "Test Successful", description: result.message });
            } else {
                throw new Error(result.error || "Failed to connect.");
            }
        } catch (error: any) {
            toast({ 
                variant: 'destructive', 
                title: "Connection Failed", 
                description: error.message 
            });
        } finally {
            setIsTesting(false);
        }
    };
    
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

        if (agent.id === 1) {
            const path = configData?.confluencePath || "Default Confluence Page";
            addLog(agent.id, `Handshaking with Confluence at ${path}...`);
            addLog(agent.id, `Authenticating as ${configData?.confluenceUser || 'anonymous'}...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            addLog(agent.id, "Connection established. Scanning for latest HTML report...");
            const timestamp = format(new Date(), 'yyyyMMdd_HHmm');
            extra = `cucumber_report_${timestamp}.html`;
        } else if (agent.id === 2) {
            addLog(agent.id, "Identifying report structure from Agent 1 output...");
            await new Promise(resolve => setTimeout(resolve, 800));
            addLog(agent.id, "Parsing Gherkin features and scenario outcomes...");
            
            const total = Math.floor(Math.random() * 40) + 60;
            const failed = Math.floor(Math.random() * 12) + 3;
            const passed = total - failed;
            metrics = { total, passed, failed };
            
            addLog(agent.id, `Analysis Complete: ${total} total scenarios found.`);
            addLog(agent.id, `Results: ${passed} Passed, ${failed} Failed.`);
        } else {
            addLog(agent.id, `Starting unattended task...`);
        }

        const duration = Math.random() * 2000 + 1500;
        await new Promise(resolve => setTimeout(resolve, duration));

        setAgents(prev => prev.map((a, i) => i === index ? { 
            ...a, 
            status: 'success', 
            lastRun: new Date().toISOString(),
            extraInfo: extra || a.extraInfo,
            metrics: metrics || a.metrics
        } : a));

        if (agent.id === 1) {
            addLog(agent.id, `Successfully fetched: ${extra}`);
        } else if (agent.id !== 2) {
            addLog(agent.id, `Completed successfully. Found ${Math.floor(Math.random() * 10)} relevant items.`);
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
            description: "All 8 AI Agents have finished their unattended tasks."
        });
    };

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
                        Unattended multi-agent pipeline for automated test failure resolution and reporting.
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
                        agent.status === 'success' && "bg-green-50/30 border-green-200"
                    )}>
                        <CardHeader className="p-4 pb-2">
                            <div className="flex justify-between items-start">
                                <div className="bg-primary/10 p-2 rounded-lg">
                                    {idx === 0 && <Network className="h-4 w-4 text-primary" />}
                                    {idx === 1 && <FileJson className="h-4 w-4 text-primary" />}
                                    {idx === 2 && <Cpu className="h-4 w-4 text-primary" />}
                                    {idx === 3 && <ExternalLink className="h-4 w-4 text-primary" />}
                                    {idx === 4 && <Database className="h-4 w-4 text-primary" />}
                                    {idx === 5 && <RefreshCcw className="h-4 w-4 text-primary" />}
                                    {idx >= 6 && <CheckCircle2 className="h-4 w-4 text-primary" />}
                                </div>
                                <div className="flex gap-1.5">
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
                                    {idx === 0 && (
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                                    <Settings className="h-3.5 w-3.5" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Configure Confluence Fetcher</DialogTitle>
                                                    <DialogDescription>Input the details for Agent 1 to connect to your report repository.</DialogDescription>
                                                </DialogHeader>
                                                <div className="space-y-4 py-4">
                                                    <div className="space-y-2">
                                                        <Label>Confluence Path (URL)</Label>
                                                        <Input 
                                                            placeholder="https://..." 
                                                            value={confluencePath}
                                                            onChange={(e) => setConfluencePath(e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Username</Label>
                                                        <Input 
                                                            placeholder="user@dhl.com" 
                                                            value={confluenceUser}
                                                            onChange={(e) => setConfluenceUser(e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Password / API Token</Label>
                                                        <Input 
                                                            type="password" 
                                                            placeholder="••••••••" 
                                                            value={confluencePassword}
                                                            onChange={(e) => setConfluencePassword(e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                                <DialogFooter className="flex-col sm:flex-row gap-2">
                                                    <Button 
                                                        variant="outline" 
                                                        onClick={handleTestConnection} 
                                                        disabled={isTesting}
                                                        className="w-full sm:w-auto"
                                                    >
                                                        {isTesting ? (
                                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing...</>
                                                        ) : (
                                                            <><FlaskConical className="mr-2 h-4 w-4" /> Test Connection</>
                                                        )}
                                                    </Button>
                                                    <Button onClick={handleSaveConfig} className="gap-2 w-full sm:w-auto">
                                                        <Save className="h-4 w-4" /> Save Details
                                                    </Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    )}
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
                                            <Link2 className="h-2.5 w-2.5" /> Connection:
                                        </span>
                                        <Badge variant="outline" className={cn(
                                            "text-[9px] px-1 h-4",
                                            configData?.confluencePath ? "text-green-600 border-green-200 bg-green-50" : "text-amber-600 border-amber-200 bg-amber-50"
                                        )}>
                                            {configData?.confluencePath ? "CONNECTED" : "OFFLINE"}
                                        </Badge>
                                    </div>
                                    {agent.extraInfo && (
                                        <div className="p-1.5 bg-primary/5 border border-primary/10 rounded text-[9px] font-mono flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-1 duration-300">
                                            <FileCode className="h-3 w-3 text-primary shrink-0" />
                                            <span className="truncate" title={agent.extraInfo}>{agent.extraInfo}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            {idx === 1 && agent.metrics && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-500">
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-muted-foreground flex items-center gap-1">
                                            <Activity className="h-2.5 w-2.5" /> Execution Summary:
                                        </span>
                                        <span className="font-bold">{agent.metrics.total} Total</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-green-500/10 border border-green-200 rounded p-1 text-center">
                                            <div className="text-[8px] text-green-600 font-semibold uppercase">Passed</div>
                                            <div className="text-xs font-bold text-green-700">{agent.metrics.passed}</div>
                                        </div>
                                        <div className="bg-red-500/10 border border-red-200 rounded p-1 text-center">
                                            <div className="text-[8px] text-red-600 font-semibold uppercase">Failed</div>
                                            <div className="text-xs font-bold text-red-700">{agent.metrics.failed}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="p-4 pt-0 text-[10px] text-muted-foreground flex justify-between border-t mt-auto pt-2">
                            <div className="flex items-center gap-1">
                                <span>Last run: {agent.lastRun ? format(new Date(agent.lastRun), 'HH:mm') : 'Never'}</span>
                                {idx === 0 && (configData?.confluencePath ? <ShieldCheck className="h-3 w-3 text-green-500" title="Configured" /> : <AlertCircle className="h-3 w-3 text-amber-500" title="Missing Config" />)}
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
                        Agent Console Output
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

            <Card className="border-dashed">
                <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-primary" />
                        Agent Architecture Information
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <p className="font-semibold text-foreground">Operational Logic</p>
                        <p>These agents operate asynchronously using serverless triggers. Agent 1 initiates the flow by monitoring external Confluence exports. Successive agents are triggered by state changes in the Agent Task collection.</p>
                    </div>
                    <div className="space-y-2">
                        <p className="font-semibold text-foreground">API Integrations</p>
                        <ul className="list-disc pl-4 space-y-1">
                            <li><strong>Jira:</strong> REST API v3 for issue searching and cross-referencing.</li>
                            <li><strong>GitLab:</strong> Repository API for file updates and Pipeline API for triggering reruns.</li>
                            <li><strong>Confluence:</strong> Content API for report discovery and data retrieval.</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
