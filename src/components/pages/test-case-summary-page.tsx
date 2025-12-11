
'use client';

import { useState, useCallback, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import { FileUploader } from '../dashboard/file-uploader';
import { TestCasePieChart } from '../dashboard/test-case-pie-chart';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { FileText } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

type TestCaseData = { [key: string]: string };

const parseCSV = (text: string): { headers: string[], data: TestCaseData[] } => {
    const rows: string[][] = [];
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
                rows.push(currentRow);
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
        rows.push(currentRow);
    }
    
    const nonEmptyRows = rows.filter(row => row.some(field => field.trim() !== ''));
    if (nonEmptyRows.length < 1) {
        return { headers: [], data: [] };
    }

    const headerRow = nonEmptyRows[0].map(h => h.trim());
    const dataRows = nonEmptyRows.slice(1);
    
    let labelCount = 0;
    const processedHeaders = headerRow.map(h => {
        if (h.toLowerCase() === 'label') {
            labelCount++;
            return labelCount > 1 ? `Label${labelCount}` : 'Label';
        }
        return h;
    });

    const data = dataRows.map(row => {
        const rowData: TestCaseData = {};
        processedHeaders.forEach((header, index) => {
            rowData[header] = row[index] || '';
        });
        return rowData;
    });

    return { headers: processedHeaders, data };
};


export function TestCaseSummaryPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const [testCases, setTestCases] = useState<TestCaseData[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [selectedLabelColumn, setSelectedLabelColumn] = useState<string>('');

  const labelColumns = useMemo(() => {
    return headers.filter(h => h.toLowerCase().startsWith('label'));
  }, [headers]);

  const handleDataUploaded = useCallback(async (csvText: string) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to upload data.',
      });
      return;
    }
    try {
      const { headers: parsedHeaders, data: parsedData } = parseCSV(csvText);

      if (parsedData.length === 0) {
        throw new Error('No data found in the CSV file.');
      }
      
      setHeaders(parsedHeaders);
      setTestCases(parsedData);
      
      const firstLabel = parsedHeaders.find(h => h.toLowerCase().startsWith('label'));
      setSelectedLabelColumn(firstLabel || '');

      const response = await fetch('/api/test-cases/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testCases: parsedData,
          uploaderId: user.uid,
          fileName: 'test-case-summary.csv' // Or derive from the file object if available
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save data to the server.');
      }

      toast({
        title: 'Success!',
        description: `${parsedData.length} test case records uploaded and saved.`,
      });

    } catch (error: any) {
      setTestCases([]);
      setHeaders([]);
      toast({
        variant: 'destructive',
        title: 'Error Processing File',
        description: error.message,
      });
    }
  }, [toast, user]);

  const chartData = useMemo(() => {
    if (!selectedLabelColumn || testCases.length === 0) {
      return [];
    }
    const counts = testCases.reduce((acc, testCase) => {
      const value = testCase[selectedLabelColumn] || 'Unassigned';
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    return Object.entries(counts).map(([name, count]) => ({
      name,
      count,
    }));
  }, [testCases, selectedLabelColumn]);

  return (
    <div className="space-y-6">
      {testCases.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-4">
          <div className="flex w-full max-w-lg flex-col items-center justify-center gap-4 text-center">
            <Card className="w-full">
                <CardHeader>
                    <CardTitle>Upload Test Case Data</CardTitle>
                    <CardDescription>To get started, please upload a CSV file containing your test case details.</CardDescription>
                </CardHeader>
                <CardContent>
                    <FileUploader onDataUploaded={handleDataUploaded} templatePath="/test-cases-template.csv" />
                </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <>
            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <div>
                        <CardTitle>Test Case Summary</CardTitle>
                        <CardDescription>
                        Displaying a summary of {testCases.length} uploaded test cases.
                        </CardDescription>
                    </div>
                    {labelColumns.length > 1 && (
                        <div className="w-[200px]">
                            <Select value={selectedLabelColumn} onValueChange={setSelectedLabelColumn}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Label Column" />
                                </SelectTrigger>
                                <SelectContent>
                                    {labelColumns.map(label => (
                                        <SelectItem key={label} value={label}>{label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    {chartData.length > 0 ? (
                         <TestCasePieChart
                            data={chartData}
                            title={`Distribution by ${selectedLabelColumn}`}
                            description={`A breakdown of test cases by the selected label.`}
                        />
                    ) : (
                        <Alert>
                            <FileText className="h-4 w-4" />
                            <AlertTitle>No Data to Display</AlertTitle>
                            <AlertDescription>
                                Could not generate chart. Please ensure the selected column '{selectedLabelColumn}' has values in the uploaded CSV.
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>
        </>
      )}
    </div>
  );
}

    