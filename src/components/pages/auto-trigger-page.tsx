
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
    Mail, 
    GitBranch, 
    Play, 
    Loader2, 
    CheckCircle2, 
    XCircle, 
    RefreshCcw, 
    Settings2, 
    History,
    ShieldCheck,
    AlertCircle,
    Save
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDoc, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, orderBy, limit, addDoc } from '@/firebase/firestore-shim';
import type { AppConfiguration, AutoTriggerLog } from '@/lib/types';
import { setDocumentNonBlocking, addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { format, parseISO } from 'date-fns';

export function AutoTriggerPage() {
    const { toast } = useToast();
    const firestore = useFirestore();
    const [isChecking, setIsChecking] = useState(false);
    
    // Configuration State
    const configRef = useMemoFirebase(() => (firestore ? doc(firestore, 'appConfiguration', 'global') : null), [firestore]);
    const { data: configData, isLoading: isConfigLoading } = useDoc<AppConfiguration>(configRef);

    // History Logs State
    const logsColRef = useMemoFirebase(() => (firestore ? query(collection(firestore, 'autoTriggerLogs'), orderBy('triggeredAt', 'desc'), limit(50)) : null), [firestore]);
    const { data: logs } = useCollection<AutoTriggerLog>(logsColRef);

    const handleUpdateConfig = (key: keyof AppConfiguration, value: any) => {
        if (!configRef) return;
        setDocumentNonBlocking(configRef, { [key]: value }, { merge: true });
        toast({ title: "Updated", description: `${key} saved successfully.` });
    };

    const runManualCheck = async () => {
        if (!configData || isChecking) return;
        setIsChecking(true);
        
        try {
            const processedIds = logs?.map(l => l.emailId) || [];
            
            const response = await fetch('/api/outlook/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    config: configData,
                    gitlabConfig: {
                        gitlabToken: configData.gitlabToken,
                        gitlabProjectId: configData.gitlabProjectId,
                        gitlabPipelineScheduleDescription: configData.gitlabPipelineScheduleDescription
                    },
                    processedEmailIds: processedIds
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                if (result.triggered) {
                    toast({ title: "Pipeline Triggered!", description: result.message });
                    // Log the success to Firestore
                    const logRef = collection(firestore, 'autoTriggerLogs');
                    addDocumentNonBlocking(logRef, {
                        emailId: result.emailId,
                        sender: result.sender,
                        subject: result.subject,
                        triggeredAt: new Date().toISOString(),
                        gitlabStatus: 'Success',
                        message: result.gitlabMessage
                    });
                } else {
                    toast({ description: result.message });
                }
            } else {
                toast({ variant: "destructive", title: "Check Failed", description: result.error || "Could not check Outlook." });
            }
        } catch (e: any) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        } finally {
            setIsChecking(false);
        }
    };

    // Polling effect
    useEffect(() => {
        let timer: any;
        if (configData?.autoTriggerEnabled && !isChecking) {
            // Check every 2 minutes while page is active
            timer = setInterval(() => runManualCheck(), 120000);
        }
        return () => clearInterval(timer);
    }, [configData?.autoTriggerEnabled, isChecking]);

    if (isConfigLoading) {
        return <div className="p-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    return (
        <div className="space-y-6 pb-12">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Mail className="text-primary h-7 w-7" />
                        AutoTrigger Pipeline
                    </h2>
                    <p className="text-muted-foreground text-sm">Monitor Outlook for trigger emails to start GitLab jobs.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center space-x-2 bg-muted p-2 rounded-lg border">
                        <Label className="text-xs font-semibold">Live Monitoring</Label>
                        <Switch 
                            checked={configData?.autoTriggerEnabled || false} 
                            onCheckedChange={(val) => handleUpdateConfig('autoTriggerEnabled', val)}
                        />
                    </div>
                    <Button onClick={runManualCheck} disabled={isChecking}>
                        {isChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                        Check Inbox Now
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm flex items-center gap-2"><Settings2 className="h-4 w-4" /> Trigger Configuration</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold uppercase text-muted-foreground">Outlook Filter</h4>
                                    <div className="space-y-2">
                                        <Label className="text-xs">Target Sender Name</Label>
                                        <Input 
                                            defaultValue={configData?.outlookSenderFilter || 'mareeswari'} 
                                            onBlur={(e) => handleUpdateConfig('outlookSenderFilter', e.target.value)}
                                            placeholder="e.g. mareeswari"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">Subject Keywords</Label>
                                        <Input 
                                            defaultValue={configData?.outlookSubjectFilter || 'Trigger cox regression'} 
                                            onBlur={(e) => handleUpdateConfig('outlookSubjectFilter', e.target.value)}
                                            placeholder="e.g. Trigger cox regression"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold uppercase text-muted-foreground">GitLab Target</h4>
                                    <div className="space-y-2">
                                        <Label className="text-xs">Project ID</Label>
                                        <Input 
                                            defaultValue={configData?.gitlabProjectId || ''} 
                                            onBlur={(e) => handleUpdateConfig('gitlabProjectId', e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">Pipeline Schedule Description</Label>
                                        <Input 
                                            defaultValue={configData?.gitlabPipelineScheduleDescription || ''} 
                                            onBlur={(e) => handleUpdateConfig('gitlabPipelineScheduleDescription', e.target.value)}
                                            placeholder="The name of the schedule to 'play'"
                                        />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4" /> Trigger History</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="h-[400px]">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead className="text-[10px] uppercase">Detected At</TableHead>
                                            <TableHead className="text-[10px] uppercase">Sender</TableHead>
                                            <TableHead className="text-[10px] uppercase">Subject</TableHead>
                                            <TableHead className="text-[10px] uppercase">Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {logs?.map((log) => (
                                            <TableRow key={log.id}>
                                                <TableCell className="text-[11px] font-medium">{format(parseISO(log.triggeredAt), 'MMM d, HH:mm')}</TableCell>
                                                <TableCell className="text-[11px]">{log.sender}</TableCell>
                                                <TableCell className="text-[11px] italic">"{log.subject}"</TableCell>
                                                <TableCell>
                                                    <Badge variant={log.gitlabStatus === 'Success' ? 'secondary' : 'destructive'} className="text-[9px] px-1.5 py-0">
                                                        {log.gitlabStatus}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {(!logs || logs.length === 0) && (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-xs italic">No trigger events recorded yet.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader>
                            <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Outlook Auth Credentials</CardTitle>
                            <CardDescription className="text-[10px]">Application permissions are required (Mail.Read).</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs">Client ID</Label>
                                <Input 
                                    type="password"
                                    defaultValue={configData?.outlookClientId || ''} 
                                    onBlur={(e) => handleUpdateConfig('outlookClientId', e.target.value)}
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Tenant ID</Label>
                                <Input 
                                    type="password"
                                    defaultValue={configData?.outlookTenantId || ''} 
                                    onBlur={(e) => handleUpdateConfig('outlookTenantId', e.target.value)}
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Client Secret</Label>
                                <Input 
                                    type="password"
                                    defaultValue={configData?.outlookClientSecret || ''} 
                                    onBlur={(e) => handleUpdateConfig('outlookClientSecret', e.target.value)}
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Target Mailbox Email</Label>
                                <Input 
                                    defaultValue={configData?.outlookUserEmail || ''} 
                                    onBlur={(e) => handleUpdateConfig('outlookUserEmail', e.target.value)}
                                    placeholder="user@dhl.com"
                                    className="h-8 text-xs"
                                />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <p className="text-[10px] text-muted-foreground flex gap-1.5"><AlertCircle className="h-3 w-3" /> Ensure the Azure App Reg has 'Mail.Read' application permission.</p>
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Automation Status</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-between items-center text-xs">
                                <span>Status:</span>
                                {configData?.autoTriggerEnabled ? (
                                    <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">Monitoring Active</Badge>
                                ) : (
                                    <Badge variant="outline">Paused</Badge>
                                )}
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span>Last Check:</span>
                                <span className="font-mono text-[10px]">{isChecking ? 'Checking...' : (logs?.[0] ? format(parseISO(logs[0].triggeredAt), 'HH:mm:ss') : 'N/A')}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span>Poll Interval:</span>
                                <span className="font-mono text-[10px]">2 Minutes</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
