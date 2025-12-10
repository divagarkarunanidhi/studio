
'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileText } from 'lucide-react';
import { FileUploader } from '../dashboard/file-uploader';
import { Button } from '../ui/button';

type TestCase = {
  [key: string]: string;
};

const parseCSV = (text: string): string[][] => {
    const result: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    while (i < normalizedText.length) {
        const char = normalizedText[i];

        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < normalizedText.length && normalizedText[i + 1] === '"') {
                    currentField += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                currentField += char;
            }
        } else {
            if (char === ',') {
                currentRow.push(currentField);
                currentField = '';
            } else if (char === '\n') {
                currentRow.push(currentField);
                result.push(currentRow);
                currentRow = [];
                currentField = '';
            } else if (char === '"' && currentField === '') {
                inQuotes = true;
            } else {
                currentField += char;
            }
        }
        i++;
    }

    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        result.push(currentRow);
    }
    
    return result.filter(row => row.some(field => field.trim() !== ''));
};

export function TestCaseDetailsPage() {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const { toast } = useToast();

  const handleDataUploaded = useCallback((csvText: string) => {
    try {
      const rows = parseCSV(csvText);
      if (rows.length < 2) {
        throw new Error('CSV must have a header and at least one data row.');
      }
      
      const headerRow = rows[0].map(h => h.trim());
      setHeaders(headerRow);
      
      const parsedTestCases = rows.slice(1).map((values) => {
        return headerRow.reduce((obj, header, index) => {
          obj[header] = values[index] || '';
          return obj;
        }, {} as TestCase);
      });

      setTestCases(parsedTestCases);
      toast({
        title: 'Success!',
        description: `${parsedTestCases.length} test cases loaded.`,
      });
    } catch (error: any) {
      setTestCases([]);
      setHeaders([]);
      toast({
        variant: 'destructive',
        title: 'Error processing file',
        description: error.message || 'An unknown error occurred.',
      });
    }
  }, [toast]);

  return (
    <div className="space-y-6">
      {testCases.length === 0 ? (
         <div className="flex flex-1 flex-col items-center justify-center p-4">
         <div className="flex flex-col items-center justify-center gap-4 text-center">
           <div className="rounded-lg bg-card p-6 shadow-sm">
             <h2 className="text-2xl font-bold">Upload Test Case Data</h2>
             <p className="mt-2 text-muted-foreground">
               To get started, please upload a CSV file containing your test case details.
             </p>
           </div>
           <div className="flex w-full max-w-lg flex-col items-stretch justify-center gap-4">
            <FileUploader onDataUploaded={handleDataUploaded} templatePath="/test-cases-template.csv" />
           </div>
         </div>
       </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Test Case Details</CardTitle>
            <CardDescription>
              Displaying {testCases.length} uploaded test cases.
            </CardDescription>
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
                          {testCase[header]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-6 flex justify-center">
                <Button variant="outline" onClick={() => { setTestCases([]); setHeaders([]); }}>
                    Upload a different file
                </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
