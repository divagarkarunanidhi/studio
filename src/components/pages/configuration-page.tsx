'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from '@/firebase/firestore-shim';
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
import { Separator } from '../ui/separator';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const DEFAULT_MONGO_URI = 'mongodb://localhost:27017';
const DEFAULT_MONGO_DB_NAME = 'bugsense';

export function ConfigurationPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isTestingTeams, setIsTestingTeams] = useState(false);
  const [isTestingDhl, setIsTestingDhl] = useState(false);
  const [isSavingMongo, setIsSavingMongo] = useState(false);

  const configRef = useMemoFirebase(() => (firestore ? doc(firestore, 'appConfiguration', 'global') : null), [firestore]);
  const { data: configData, isLoading: isConfigLoading } = useDoc<AppConfiguration>(configRef);

  const form = useForm<AppConfiguration>({
    resolver: zodResolver(AppConfigurationSchema),
    defaultValues: {
      aiProvider: 'googleai',
      geminiApiKey: '',
      mongodbUri: DEFAULT_MONGO_URI,
      mongodbDbName: DEFAULT_MONGO_DB_NAME,
      geminiModel: 'gemini-1.5-flash',
      geminiRetryModel: 'gemini-1.5-pro',
      dhlApiKey: '',
      dhlEndpoint: '',
      dhlModel: 'gemini-2.0-flash-lite',
      dhlRetryModel: 'gemini-2.0-flash-lite',
      dhlInsecureTls: false,
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
    let cancelled = false;
    (async () => {
      // Load the active MongoDB connection details from the server.
      let activeUri = DEFAULT_MONGO_URI;
      let activeDb = DEFAULT_MONGO_DB_NAME;
      try {
        const mongoRes = await fetch('/api/mongo-config');
        if (mongoRes.ok) {
          const data = await mongoRes.json();
          if (data?.config?.uri) activeUri = data.config.uri;
          if (data?.config?.dbName) activeDb = data.config.dbName;
        }
      } catch {
        // ignore — fall back to defaults
      }

      try {
        const res = await fetch('/api/configuration');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data?.config) {
            form.reset({
              ...data.config,
              mongodbUri: activeUri,
              mongodbDbName: activeDb,
            });
            return;
          }
        }
        if (!cancelled && configData) {
          form.reset({
            ...configData,
            mongodbUri: activeUri,
            mongodbDbName: activeDb,
          });
        } else if (!cancelled) {
          form.setValue('mongodbUri', activeUri);
          form.setValue('mongodbDbName', activeDb);
        }
      } catch {
        if (!cancelled && configData) {
          form.reset({
            ...configData,
            mongodbUri: activeUri,
            mongodbDbName: activeDb,
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [configData, form]);

  const handleSaveMongoConnection = async () => {
    const uri = (form.getValues('mongodbUri') || '').trim();
    const dbName = (form.getValues('mongodbDbName') || '').trim();
    if (!uri || !dbName) {
      toast({
        variant: 'destructive',
        title: 'Missing values',
        description: 'Both MongoDB URI and Database name are required.',
      });
      return;
    }
    setIsSavingMongo(true);
    try {
      const res = await fetch('/api/mongo-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri, dbName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Save failed (${res.status}).`);
      }
      toast({
        title: 'MongoDB connection updated',
        description: 'New URI tested and saved. The server will use it from the next request.',
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
    } finally {
      setIsSavingMongo(false);
    }
  };

  const onSubmit = async (values: AppConfiguration) => {
    // The MongoDB connection is managed by the dedicated endpoint above.
    // Strip those fields from the global config payload so we don't overwrite
    // them from this form.
    const { mongodbUri: _u, mongodbDbName: _d, ...rest } = values;
    const payload = rest as AppConfiguration;

    try {
      const res = await fetch('/api/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Save failed (${res.status}).`);
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save Failed', description: e.message });
      return;
    }

    toast({ title: 'Configuration Saved', description: 'Stored in MongoDB.' });
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

  const handleTestDhl = async () => {
    const apiKey = form.getValues('dhlApiKey');
    const endpoint = form.getValues('dhlEndpoint');
    const model = form.getValues('dhlModel');
    const insecureTls = form.getValues('dhlInsecureTls');

    if (!apiKey || !endpoint || !model) {
      toast({
        variant: 'destructive',
        title: 'Missing configuration',
        description: 'Provide DHL API Key, Endpoint, and Model before testing.',
      });
      return;
    }

    setIsTestingDhl(true);
    try {
      const response = await fetch('/api/dhl/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, endpoint, model, insecureTls }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || `Test failed (${response.status}).`);
      }

      toast({ title: 'Test Successful', description: result.message || 'DHL connection verified.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Test Failed', description: e.message });
    } finally {
      setIsTestingDhl(false);
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
                        <FormItem>
                            <FormLabel>MongoDB URI</FormLabel>
                            <FormControl>
                                <Input {...field} value={field.value || ''} placeholder="mongodb://localhost:27017" />
                            </FormControl>
                            <FormDescription>
                                Active connection string used by every server route. Click "Save MongoDB Connection" to test &amp; apply.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <FormField control={form.control} name="mongodbDbName" render={({ field }) => (
                        <FormItem>
                            <FormLabel>MongoDB Database</FormLabel>
                            <FormControl>
                                <Input {...field} value={field.value || ''} placeholder="bugsense" />
                            </FormControl>
                            <FormDescription>Database name on the configured server.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>
                <div className="flex justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={handleSaveMongoConnection} disabled={isSavingMongo}>
                        {isSavingMongo ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <RefreshCcw className="h-3 w-3 mr-2" />}
                        Save MongoDB Connection
                    </Button>
                </div>
            </div>

            <Separator />

            <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2"><Settings className="h-5 w-5" /> AI Provider</h3>
              <p className="text-sm text-muted-foreground">Choose between Google Gemini and DHL GenAI Gateway. Restart the dev server after switching providers.</p>

                <FormField control={form.control} name="aiProvider" render={({ field }) => (
                    <FormItem className="max-w-xs">
                        <FormLabel>Provider</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || 'googleai'}>
                            <FormControl>
                                <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="googleai">Google Gemini</SelectItem>
                                <SelectItem value="dhl">DHL GenAI Gateway</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )} />

                {form.watch('aiProvider') === 'dhl' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/20 p-4 rounded-lg border">
                        <FormField control={form.control} name="dhlApiKey" render={({ field }) => (
                            <FormItem className="md:col-span-2"><FormLabel>DHL API Key</FormLabel><FormControl><Input type="password" {...field} value={field.value || ''} placeholder="bd92a756e99f3906e095d006c27fdfdbcf60ab4f..." /></FormControl><FormDescription>Your DHL GenAI Gateway API Key.</FormDescription><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="dhlEndpoint" render={({ field }) => (
                          <FormItem className="md:col-span-2"><FormLabel>DHL Endpoint</FormLabel><FormControl><Input {...field} value={field.value || ''} placeholder="https://apihub-sandbox.dhl.com/genai-test/vertexai" /></FormControl><FormDescription>Vertex-compatible base URL from DHL Apigee GenAI Gateway.</FormDescription><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="dhlModel" render={({ field }) => (
                          <FormItem><FormLabel>Primary Model</FormLabel><FormControl><Input {...field} value={field.value || ''} placeholder="gemini-2.0-flash-lite" /></FormControl><FormDescription>e.g. <code>gemini-2.0-flash-lite</code> or another DHL-enabled Gemini model.</FormDescription><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="dhlRetryModel" render={({ field }) => (
                          <FormItem><FormLabel>Retry Model</FormLabel><FormControl><Input {...field} value={field.value || ''} placeholder="gemini-2.0-flash-lite" /></FormControl><FormDescription>Used when the primary model returns 429/503.</FormDescription><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="dhlInsecureTls" render={({ field }) => (
                          <FormItem className="md:col-span-2 flex items-center justify-between space-x-2 rounded-lg border p-3 bg-card shadow-sm">
                            <div className="space-y-0.5">
                              <FormLabel>Skip TLS Verification</FormLabel>
                              <FormDescription className="text-[11px]">Use only on trusted corporate networks with TLS interception.</FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )} />
                          <div className="md:col-span-2 flex justify-end">
                            <Button type="button" variant="outline" size="sm" onClick={handleTestDhl} disabled={isTestingDhl}>
                              {isTestingDhl ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <FlaskConical className="h-3 w-3 mr-2" />}
                              Test Connection
                            </Button>
                          </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/20 p-4 rounded-lg border">
                        <FormField control={form.control} name="geminiModel" render={({ field }) => (
                            <FormItem><FormLabel>Primary Model</FormLabel><FormControl><Input {...field} value={field.value || ''} placeholder="gemini-1.5-flash" /></FormControl><FormDescription>Bare name, e.g. <code>gemini-1.5-flash</code> or <code>gemini-2.0-flash</code>.</FormDescription><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="geminiRetryModel" render={({ field }) => (
                            <FormItem><FormLabel>Retry Model</FormLabel><FormControl><Input {...field} value={field.value || ''} placeholder="gemini-1.5-pro" /></FormControl><FormDescription>Used when the primary model returns 429/503.</FormDescription><FormMessage /></FormItem>
                        )} />
                    </div>
                )}
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
