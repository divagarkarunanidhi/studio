
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { Settings, Cpu, FlaskConical, Loader2, ShieldAlert, Bug, GitBranch, RefreshCcw } from 'lucide-react';
import { AppConfigurationSchema } from '@/lib/types';
import type { AppConfiguration } from '@/lib/types';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Separator } from '../ui/separator';
import { Switch } from '../ui/switch';

export function ConfigurationPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isTestingMongo, setIsTestingMongo] = useState(false);
  const [isTestingConfluence, setIsTestingConfluence] = useState(false);
  const [isTestingJira, setIsTestingJira] = useState(false);
  const [isTestingGitlab, setIsTestingGitlab] = useState(false);

  const configRef = useMemoFirebase(() => doc(firestore, 'appConfiguration', 'global'), [firestore]);
  const { data: configData, isLoading: isConfigLoading, error: configError } = useDoc<AppConfiguration>(configRef);

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
      autoLogoutEnabled: true,
      autoLogoutTime: 5
    },
  });

  useEffect(() => {
    if (configData) {
      form.reset(configData);
    }
  }, [configData, form]);

  const onSubmit = async (values: AppConfiguration) => {
    if (!configRef) return;
    
    setDocumentNonBlocking(configRef, values, { merge: true });
    
    toast({
        title: 'Update Initiated',
        description: 'Global configuration update has been sent to the server.',
    });
  };

  const handleTestMongo = async () => {
    setIsTestingMongo(true);
    toast({
        title: "Testing Connection...",
        description: "Attempting to connect to MongoDB with saved credentials."
    });
    try {
        const response = await fetch('/api/test-mongo');
        const result = await response.json();

        if (response.ok) {
            toast({
                title: 'Success!',
                description: result.message,
            });
        } else {
            toast({
                variant: 'destructive',
                title: 'Connection Failed',
                description: result.error || 'Could not connect to MongoDB.',
            });
        }
    } catch (error) {
        toast({
            variant: 'destructive',
            title: 'Connection Test Error',
            description: 'An unexpected error occurred while testing the connection.',
        });
    } finally {
        setIsTestingMongo(false);
    }
  };

  const handleTestConfluence = async () => {
    const values = form.getValues();
    if (!values.confluencePath || !values.confluenceUser || !values.confluencePassword) {
        toast({
            variant: 'destructive',
            title: 'Missing Details',
            description: 'Please provide all Confluence settings before testing.'
        });
        return;
    }

    setIsTestingConfluence(true);
    try {
        const response = await fetch('/api/confluence/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: values.confluencePath,
                user: values.confluenceUser,
                password: values.confluencePassword
            })
        });
        const result = await response.json();

        if (response.ok) {
            toast({ title: 'Connection Successful', description: result.message });
        } else {
            throw new Error(result.error || 'Failed to connect.');
        }
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Test Failed',
            description: error.message
        });
    } finally {
        setIsTestingConfluence(false);
    }
  };

  const handleTestJira = async () => {
    const values = form.getValues();
    if (!values.jiraLink || !values.jiraUser || !values.jiraApiToken || !values.jiraProjectKey) {
        toast({
            variant: 'destructive',
            title: 'Missing Details',
            description: 'Please provide all Jira settings before testing.'
        });
        return;
    }

    setIsTestingJira(true);
    try {
        const response = await fetch('/api/jira/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jiraLink: values.jiraLink,
                jiraUser: values.jiraUser,
                jiraApiToken: values.jiraApiToken,
                jiraProjectKey: values.jiraProjectKey
            })
        });
        const result = await response.json();

        if (response.ok) {
            toast({ title: 'Connection Successful', description: result.message });
        } else {
            throw new Error(result.error || 'Failed to connect.');
        }
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Test Failed',
            description: error.message
        });
    } finally {
        setIsTestingJira(false);
    }
  };

  const handleTestGitlab = async () => {
    const values = form.getValues();
    if (!values.gitlabToken || !values.gitlabProjectId) {
        toast({
            variant: 'destructive',
            title: 'Missing Details',
            description: 'Please provide GitLab Token and Project ID before testing.'
        });
        return;
    }

    setIsTestingGitlab(true);
    try {
        const response = await fetch('/api/gitlab/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: values.gitlabToken,
                projectId: values.gitlabProjectId
            })
        });
        const result = await response.json();

        if (response.ok) {
            toast({ title: 'GitLab Connection Successful', description: result.message });
        } else {
            throw new Error(result.error || 'Failed to connect to GitLab.');
        }
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'GitLab Test Failed',
            description: error.message
        });
    } finally {
        setIsTestingGitlab(false);
    }
  };

  if (isConfigLoading) {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Application Configuration</CardTitle>
                    <CardDescription>Manage global application settings and API keys.</CardDescription>
                </CardHeader>
                <CardContent className='space-y-4'>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-32" />
                </CardContent>
            </Card>
        </div>
    );
  }

  if (configError) {
    return (
        <Alert variant="destructive">
            <Settings className="h-4 w-4" />
            <AlertTitle>Failed to load configuration</AlertTitle>
            <AlertDescription>
                Could not retrieve the application settings from Firestore. Please check your connection and permissions.
            </AlertDescription>
        </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Application Configuration</CardTitle>
        <CardDescription>
          Manage global application settings, API keys, and session policies. These values are stored securely in Firestore.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Core Infrastructure
                    </h3>
                    <Button type="button" variant="ghost" size="sm" onClick={handleTestMongo} disabled={isTestingMongo}>
                        {isTestingMongo ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <FlaskConical className="h-3 w-3 mr-2" />}
                        Test MongoDB
                    </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="geminiApiKey"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Gemini API Key</FormLabel>
                        <FormControl>
                            <Input type="password" placeholder="Enter your Gemini API Key" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="jiraLink"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>JIRA Base URL</FormLabel>
                        <FormControl>
                            <Input placeholder="https://your-company.atlassian.net" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="mongodbUri"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>MongoDB URI</FormLabel>
                        <FormControl>
                            <Input type="password" placeholder="Enter your MongoDB Connection String" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="mongodbDbName"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>MongoDB Database Name</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., TAASBugSenseAI" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
            </div>

            <Separator />

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Bug className="h-5 w-5 text-primary" />
                        JIRA Agent Configuration
                    </h3>
                    <Button type="button" variant="ghost" size="sm" onClick={handleTestJira} disabled={isTestingJira}>
                        {isTestingJira ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <FlaskConical className="h-3 w-3 mr-2" />}
                        Test Jira Connection
                    </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="jiraUser"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Jira Email / Username</FormLabel>
                        <FormControl>
                            <Input placeholder="user@dhl.com" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="jiraApiToken"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Jira API Token</FormLabel>
                        <FormControl>
                            <Input type="password" placeholder="Enter your Atlassian API Token" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="jiraProjectKey"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Jira Project Key</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., PROJ" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="jiraIssueType"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Jira Issue Type</FormLabel>
                        <FormControl>
                            <Input placeholder="Bug" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
            </div>

            <Separator />

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <GitBranch className="h-5 w-5 text-indigo-600" />
                        GitLab Sync Configuration
                    </h3>
                    <Button type="button" variant="ghost" size="sm" onClick={handleTestGitlab} disabled={isTestingGitlab}>
                        {isTestingGitlab ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <FlaskConical className="h-3 w-3 mr-2" />}
                        Test GitLab Connection
                    </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="gitlabToken"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>GitLab Private Token</FormLabel>
                        <FormControl>
                            <Input type="password" placeholder="Enter your GitLab Personal Access Token" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="gitlabProjectId"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Project ID or Path</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g. group/project-name" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="gitlabBranch"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Target Branch</FormLabel>
                        <FormControl>
                            <Input placeholder="main" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="gitlabFilePathPrefix"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>File Path Prefix (Optional)</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g. Selenium/BACARDI/testData" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormDescription>Prefix added to extracted filenames when searching GitLab.</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
            </div>

            <Separator />

            <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <RefreshCcw className="h-5 w-5 text-primary" />
                    Agent 7: Pipeline Orchestrator Settings
                </h3>
                <FormField
                    control={form.control}
                    name="gitlabPipelineScheduleDescription"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>GitLab Pipeline Schedule Description</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g. Self-Healing Rerun" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormDescription>
                            The exact description (name) of the GitLab Pipeline Schedule to trigger.
                        </FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            <Separator />

            <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-destructive" />
                    Security & Session Management
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                    control={form.control}
                    name="autoLogoutEnabled"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                            <div className="space-y-0.5">
                                <FormLabel>Automatic Logout</FormLabel>
                                <FormDescription>
                                    Force user logout after a period of total inactivity.
                                </FormDescription>
                            </div>
                            <FormControl>
                                <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="autoLogoutTime"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Inactivity Timeout (Minutes)</FormLabel>
                            <FormControl>
                                <Input 
                                    type="number" 
                                    {...field} 
                                    onChange={e => field.onChange(parseInt(e.target.value, 10) || 1)}
                                    disabled={!form.watch('autoLogoutEnabled')}
                                />
                            </FormControl>
                            <FormDescription>
                                The number of minutes before an idle user is logged out.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
            </div>

            <Separator />

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Cpu className="h-5 w-5" />
                        AI Agent Settings (Unattended Agents)
                    </h3>
                    <Button type="button" variant="ghost" size="sm" onClick={handleTestConfluence} disabled={isTestingConfluence}>
                        {isTestingConfluence ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <FlaskConical className="h-3 w-3 mr-2" />}
                        Test Confluence
                    </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="confluencePath"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Agent 1: Confluence Base URL / Domain</FormLabel>
                        <FormControl>
                            <Input placeholder="https://taasdhl.atlassian.net/wiki" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormDescription>The root URL of your Confluence instance.</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="confluencePageId"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Confluence Page ID</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., 196739" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormDescription>The numeric ID of the page containing report attachments.</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="confluenceUser"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Confluence Username</FormLabel>
                        <FormControl>
                            <Input placeholder="user@dhl.com" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="confluencePassword"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Confluence Password / Token</FormLabel>
                        <FormControl>
                            <Input type="password" placeholder="Enter password or API token" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
            </div>

            <Separator />

            <div className="space-y-4">
                <h3 className="text-lg font-semibold">Model & Feature Tuning</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="geminiModel"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Primary Gemini Model</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., googleai/gemini-1.5-flash" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="geminiRetryModel"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Fallback/Retry Gemini Model</FormLabel>
                        <FormControl>
                            <Input placeholder="e.g., googleai/gemini-1.5-pro" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
                <FormField
                control={form.control}
                name="reusabilityLabels"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Reusability Labels</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g., FordKOCPilot,ToshibaPilot,FradleyPilot,Bacardi" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>

            <div className="flex items-center gap-4 pt-4 border-t">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving...' : 'Save All Configurations'}
                </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
