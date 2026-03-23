
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
import { Settings, Cpu } from 'lucide-react';
import { AppConfigurationSchema } from '@/lib/types';
import type { AppConfiguration } from '@/lib/types';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Separator } from '../ui/separator';

export function ConfigurationPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isTesting, setIsTesting] = useState(false);

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
      reusabilityLabels: '',
      confluencePath: '',
      confluenceUser: '',
      confluencePassword: ''
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

  const handleTestConnection = async () => {
    setIsTesting(true);
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
        setIsTesting(false);
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
          Manage global application settings, API keys, and model configurations. These values are stored securely in Firestore.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Core Infrastructure
                </h3>
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
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Cpu className="h-5 w-5" />
                    AI Agent Settings (Unattended Agents)
                </h3>
                <div className="grid grid-cols-1 gap-4">
                    <FormField
                    control={form.control}
                    name="confluencePath"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Agent 1: Confluence Fetcher Path</FormLabel>
                        <FormControl>
                            <Input placeholder="https://confluence.example.com/display/PROJ/Reports" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormDescription>The direct URL to the Confluence page containing Cucumber HTML reports.</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
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
                <Button type="button" variant="outline" onClick={handleTestConnection} disabled={isTesting}>
                    {isTesting ? 'Testing...' : 'Test MongoDB Connection'}
                </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
