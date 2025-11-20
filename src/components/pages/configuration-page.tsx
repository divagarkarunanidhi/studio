
'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '../ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Settings } from 'lucide-react';
import { AppConfigurationSchema } from '@/lib/types';
import type { AppConfiguration } from '@/lib/types';

export function ConfigurationPage() {
  const { toast } = useToast();
  const firestore = useFirestore();

  const configRef = useMemoFirebase(() => doc(firestore, 'appConfiguration', 'global'), [firestore]);
  const { data: configData, isLoading: isConfigLoading, error: configError } = useDoc<AppConfiguration>(configRef);

  const form = useForm<AppConfiguration>({
    resolver: zodResolver(AppConfigurationSchema),
    defaultValues: {
      geminiApiKey: '',
      mongodbUri: '',
      mongodbDbName: '',
      geminiModel: '',
      geminiRetryModel: '',
      jiraLink: ''
    },
  });

  useEffect(() => {
    if (configData) {
      form.reset(configData);
    }
  }, [configData, form]);

  const onSubmit = async (values: AppConfiguration) => {
    try {
      await setDoc(configRef, values, { merge: true });
      toast({
        title: 'Success!',
        description: 'Configuration has been updated.',
      });
    } catch (error: any) {
      console.error('Failed to save configuration:', error);
      toast({
        variant: 'destructive',
        title: 'Error Saving Configuration',
        description: error.message || 'An unknown error occurred.',
      });
    }
  };

  if (isConfigLoading) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Application Configuration</CardTitle>
                <CardDescription>Manage global application settings and API keys.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-32" />
            </CardContent>
        </Card>
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="geminiApiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gemini API Key</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Enter your Gemini API Key" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="mongodbUri"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>MongoDB URI</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Enter your MongoDB Connection String" {...field} />
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
                    <Input placeholder="e.g., TAASBugSenseAI" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="geminiModel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Gemini Model</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., googleai/gemini-2.5-pro" {...field} />
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
                    <Input placeholder="e.g., googleai/gemini-2.0-flash-lite" {...field} />
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
                    <Input placeholder="e.g., https://your-company.atlassian.net/browse" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving...' : 'Save Configuration'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
