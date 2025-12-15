
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '../dashboard/stat-card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ServerCrash, CheckCircle, XCircle, SkipForward } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Progress } from '../ui/progress';

interface SeleniumSummary {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
  lastRun: string;
}

interface SeleniumExecution {
  id: string;
  testSuite: string;
  status: 'Passed' | 'Failed' | 'Skipped';
  duration: string;
  browser: string;
  timestamp: string;
}

interface SeleniumData {
  summary: SeleniumSummary;
  recentExecutions: SeleniumExecution[];
}

export function SeleniumLiveDashboardPage() {
  const [data, setData] = useState<SeleniumData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/templatejson.json');
        if (!response.ok) {
          throw new Error(`Failed to fetch data: ${response.statusText}`);
        }
        const jsonData = await response.json();
        setData(jsonData);
      } catch (e: any) {
        setError(e.message || 'An unknown error occurred while fetching dashboard data.');
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading Selenium Dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <ServerCrash className="h-4 w-4" />
        <AlertTitle>Error Loading Dashboard</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert>
        <ServerCrash className="h-4 w-4" />
        <AlertTitle>No Data Found</AlertTitle>
        <AlertDescription>Could not find the necessary data to display the dashboard.</AlertDescription>
      </Alert>
    );
  }

  const { summary, recentExecutions } = data;

  const getStatusBadge = (status: SeleniumExecution['status']) => {
    switch (status) {
      case 'Passed':
        return <Badge variant="default" className="bg-green-500 hover:bg-green-600">{status}</Badge>;
      case 'Failed':
        return <Badge variant="destructive">{status}</Badge>;
      case 'Skipped':
        return <Badge variant="secondary">{status}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Execution Summary</CardTitle>
                <CardDescription>
                    Overview of the latest test run as of {format(parseISO(summary.lastRun), "MMM d, yyyy 'at' h:mm a")}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Total Tests" value={summary.totalTests} icon={<CheckCircle />} />
                    <StatCard title="Passed" value={summary.passed} icon={<CheckCircle className="text-green-500"/>} />
                    <StatCard title="Failed" value={summary.failed} icon={<XCircle className="text-red-500"/>} />
                    <StatCard title="Skipped" value={summary.skipped} icon={<SkipForward className="text-yellow-500"/>} />
                </div>
                 <div className="mt-6">
                    <div className="flex justify-between mb-1">
                        <span className="text-base font-medium text-primary">Pass Rate</span>
                        <span className="text-sm font-medium text-primary">{summary.passRate.toFixed(2)}%</span>
                    </div>
                    <Progress value={summary.passRate} className="w-full" />
                </div>
            </CardContent>
        </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Executions</CardTitle>
          <CardDescription>A list of the most recent test suite executions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test Suite</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Browser</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentExecutions.map((execution) => (
                  <TableRow key={execution.id}>
                    <TableCell className="font-medium">{execution.testSuite}</TableCell>
                    <TableCell>{getStatusBadge(execution.status)}</TableCell>
                    <TableCell>{execution.duration}</TableCell>
                    <TableCell>{execution.browser}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {format(parseISO(execution.timestamp), 'h:mm:ss a')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

    