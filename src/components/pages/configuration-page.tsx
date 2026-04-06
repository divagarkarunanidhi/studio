'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '../ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Settings, Cpu, FlaskConical, Loader2, ShieldAlert, Bug, GitBranch, RefreshCcw, Bell, Trash2, Plus } from 'lucide-react';
import { AppConfigurationSchema } from '@/lib/types';
import type { AppConfiguration } from '@/lib/types';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Separator } from '../ui/separator';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

export function ConfigurationPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isTestingTeams, setIsTestingTeams] = useState(false);

  const configRef = useMemoFirebase(() => (firestore ? doc(firestore, 'appConfiguration', 'global') : null), [firestore]);
  const { data: configData, isLoading: isConfigLoading } = useDoc<AppConfiguration>(configRef);

  const form = useForm<AppConfiguration>({
    resolver: zodResolver(AppConfigurationSchema),
    defaultValues: {
      geminiApiKey: '',
      mongodbUri: '',
      mongodbDbName: '',
      geminiModel: 'googleai/gemini-1.5-flash',
      geminiRetryModel: 'googleai/gemini-1.5-pro',
      jiraLink: '',
      jiraUser: '',
      jiraApiToken: '',
      jiraProjectKey: '',
      jiraIssueType: 'Bug',
      reusabilityLabels: '',
      confluencePath: '',
      confluencePageId: '',
      confluenceUser: '',
      confluencePassword: '',
      gitlabToken: '',
      gitlabProjectId: '',
      gitlabBranch: 'main',
      gitlabFilePathPrefix: '',
      gitlabPipelineScheduleDescription: '',
      teamsWebhookUrl: '',
      failureRules: [],
      enableTier1Rules: true,
      enableTier2Python: true,
      enableTier3Heuristics: true,
      autoLogoutEnabled: true,
      autoLogoutTime: 5
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "failureRules"
  });

  useEffect(() => {
    if (configData) {
      form.reset(configData);
    }
  }, [configData, form]);

  const onSubmit = async (values: AppConfiguration) => {
    if (!configRef) return;
    setDocumentNonBlocking(configRef, values, { merge: true });
    toast({ title: 'Update Initiated', description: 'Global configuration update has been sent.' });
  };

  const handleTestTeams = async () => {
    const webhook = form.getValues('teamsWebhookUrl');
    if (!webhook) {
        toast({ variant: "destructive", title: "Missing URL", description: "Please provide a Teams Webhook URL." });
        return;
    }
    setIsTestingTeams(true);
    try {
        const response = await fetch('/api/notifications/teams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ webhookUrl: webhook, summary: { solution: "CONFIG TEST", total: 0, passed: 0, failed: 0, jiraStatus: "Test Success", gitlabUpdates: 0, orchestratorStatus: "Test OK" } })
        });
        if (response.ok) toast({ title: 'Test Successful', description: 'Check your Teams channel.' });
        else throw new Error("API call failed.");
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Test Failed', description: e.message });
    } finally {
        setIsTestingTeams(false);
    }
  };

  if (isConfigLoading) {
    return <div className="space-y-6"><Card><CardHeader><CardTitle>Loading Configuration...</CardTitle></CardHeader><CardContent className='space-y-4'><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></CardContent></Card></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Application Configuration</CardTitle>
        <CardDescription>Manage global application settings, API keys, and automated classification rules.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2"><Settings className="h-5 w-5" /> Core Infrastructure</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="geminiApiKey" render={({ field }) => (
                        <FormItem><FormLabel>Gemini API Key</FormLabel><FormControl><Input type="password" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="mongodbUri" render={({ field }) => (
                        <FormItem><FormLabel>MongoDB URI</FormLabel><FormControl><Input type="password" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
            </div>

            <Separator />

            <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-600" /> Failure Classifier Settings</h3>
                <p className="text-sm text-muted-foreground">Enable or disable the three analytical tiers used to categorize failed scenarios.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-muted/20 p-4 rounded-lg border">
                    <FormField control={form.control} name="enableTier1Rules" render={({ field }) => (
                        <FormItem className="flex items-center justify-between space-x-2 rounded-lg border p-3 bg-card shadow-sm">
                            <div className="space-y-0.5">
                                <FormLabel>Tier 1: Rules</FormLabel>
                                <FormDescription className="text-[10px]">Deterministic patterns</FormDescription>
                            </div>
                            <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="enableTier2Python" render={({ field }) => (
                        <FormItem className="flex items-center justify-between space-x-2 rounded-lg border p-3 bg-card shadow-sm">
                            <div className="space-y-0.5">
                                <FormLabel>Tier 2: Python ML</FormLabel>
                                <FormDescription className="text-[10px]">Scikit-Learn engine</FormDescription>
                            </div>
                            <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="enableTier3Heuristics" render={({ field }) => (
                        <FormItem className="flex items-center justify-between space-x-2 rounded-lg border p-3 bg-card shadow-sm">
                            <div className="space-y-0.5">
                                <FormLabel>Tier 3: Heuristics</FormLabel>
                                <FormDescription className="text-[10px]">Pattern fallback</FormDescription>
                            </div>
                            <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                        </FormItem>
                    )} />
                </div>

                <div className="pt-4 space-y-3">
                    <h4 className="text-sm font-medium">Custom Rule Patterns (Tier 1)</h4>
                    {fields.map((field, index) => (
                        <div key={field.id} className="flex items-end gap-3 p-3 border rounded-md bg-muted/20">
                            <FormField control={form.control} name={`failureRules.${index}.pattern`} render={({ field }) => (
                                <FormItem className="flex-1">
                                    <FormLabel className="text-xs">Log Pattern</FormLabel>
                                    <FormControl><Input {...field} placeholder="e.g. timeout" className="h-8 text-xs" /></FormControl>
                                </FormItem>
                            )} />
                            <FormField control={form.control} name={`failureRules.${index}.category`} render={({ field }) => (
                                <FormItem className="w-48">
                                    <FormLabel className="text-xs">Category</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="Functional Issue">Functional Issue</SelectItem>
                                            <SelectItem value="Data Issue">Data Issue</SelectItem>
                                            <SelectItem value="Environment Issue">Environment Issue</SelectItem>
                                            <SelectItem value="Automation script issue">Automation script issue</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </FormItem>
                            )} />
                            <Button type="button" variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => remove(index)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => append({ pattern: '', category: 'Functional Issue' })}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Classification Rule
                    </Button>
                </div>
            </div>

            <Separator />

            <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2"><Bell className="h-5 w-5 text-blue-600" /> Notifications</h3>
                <div className="flex items-center justify-between">
                    <FormField control={form.control} name="teamsWebhookUrl" render={({ field }) => (
                        <FormItem className="flex-1 mr-4"><FormLabel>Teams Webhook URL</FormLabel><FormControl><Input type="password" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <Button type="button" variant="outline" size="sm" className="mt-8" onClick={handleTestTeams} disabled={isTestingTeams}>
                        {isTestingTeams ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <FlaskConical className="h-3 w-3 mr-2" />} Test Teams
                    </Button>
                </div>
            </div>

            <Separator />

            <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2"><Bug className="h-5 w-5 text-primary" /> JIRA Agent Configuration</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="jiraLink" render={({ field }) => (
                        <FormItem><FormLabel>Jira Base URL</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="jiraProjectKey" render={({ field }) => (
                        <FormItem><FormLabel>Project Key</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
            </div>

            <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Saving...' : 'Save All Configurations'}</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
