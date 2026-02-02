
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';

type TestCase = {
  [key: string]: string;
};

export function TestCaseDetailsPage() {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchTestCases = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/test-cases/latest');
      if (!response.ok) {
        throw new Error('Failed to fetch test cases from server.');
      }
      const data = await response.json();
      if (data && data.testCases && data.testCases.length > 0) {
        const cases = data.testCases;
        setTestCases(cases);
        setHeaders(Object.keys(cases[0]));
      } else {
        setTestCases([]);
        setHeaders([]);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error Loading Test Cases',
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTestCases();
  }, [fetchTestCases]);

  if (isLoading) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center p-8">
            <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p>Loading test case records...</p>
            </div>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      {testCases.length === 0 ? (
         <Card>
            <CardHeader>
                <CardTitle>No Test Case Data</CardTitle>
                <CardDescription>There are no test case records stored on the server. Please go to the Test Case Summary page to upload a file.</CardDescription>
            </CardHeader>
            <CardContent className='flex justify-center py-8'>
                <Button variant="outline" onClick={fetchTestCases}>
                    <RefreshCw className='mr-2 h-4 w-4' />
                    Check for Data
                </Button>
            </CardContent>
         </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle>Test Case Details</CardTitle>
                <CardDescription>
                Displaying {testCases.length} persistent test case records.
                </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={fetchTestCases} title="Refresh Data">
                <RefreshCw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((header) => (
                      <TableHead key={header}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testCases.map((testCase, index) => (
                    <TableRow key={index}>
                      {headers.map((header) => (
                        <TableCell key={header} className="max-w-sm truncate">
                          {testCase[header] || '-'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
