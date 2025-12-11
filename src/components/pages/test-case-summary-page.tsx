'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import { FileUploader } from '../dashboard/file-uploader';
import { TestCasePieChart } from '../dashboard/test-case-pie-chart';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '../ui/card';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { FileText, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';

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
        const lowerCaseHeader = h.toLowerCase();
        if (lowerCaseHeader === 'label' || lowerCaseHeader === 'labels') {
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

const processAndSetData = (data: TestCaseData[], setHeaders: (h: string[]) => void, setTestCases: (tc: TestCaseData[]) => void, setSelectedLabelColumn: (l: string) => void) => {
    if (data.length > 0) {
        const sampleHeaders = Object.keys(data[0]);
        let labelCount = 0;
        const processedHeaders = sampleHeaders.map(h => {
            const lowerCaseHeader = h.toLowerCase();
            if (lowerCaseHeader === 'label' || lowerCaseHeader === 'labels') {
                labelCount++;
                return labelCount > 1 ? `Label${labelCount}` : 'Label';
            }
            return h;
        });
        
        setHeaders(processedHeaders);
        setTestCases(data);
        const firstLabel = processedHeaders.find(h => h.toLowerCase().startsWith('label'));
        setSelectedLabelColumn(firstLabel || '');
    }
}

export function TestCaseSummaryPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const [testCases, setTestCases] = useState<TestCaseData[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [selectedLabelColumn, setSelectedLabelColumn] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const labelColumns = useMemo(() => {
    return headers.filter(h => h.toLowerCase().startsWith('label'));
  }, [headers]);

  const handleLoadFromServer = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/test-cases/latest');
      if (!response.ok) throw new Error('Failed to fetch latest data.');
      const data = await response.json();
      if (data && data.testCases) {
          processAndSetData(data.testCases, setHeaders, setTestCases, setSelectedLabelColumn);
      }
    } catch (error) {
      // It's okay if it fails, it just means no data is there yet.
      console.log("No initial test case data found on server.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    handleLoadFromServer();
  }, [handleLoadFromServer]);


  const handleDataUploaded = useCallback(async (csvText: string, fileName: string) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to upload data.',
      });
      return;
    }
    setIsLoading(true);
    try {
      const { headers: parsedHeaders, data: parsedData } = parseCSV(csvText);

      if (parsedData.length === 0) {
        throw new Error('No data found in the CSV file.');
      }
      
      const response = await fetch('/api/test-cases/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testCases: parsedData,
          uploaderId: user.uid,
          fileName: fileName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save data to the server.');
      }
      
      // After successful upload, immediately process and display the data
      processAndSetData(parsedData, setHeaders, setTestCases, setSelectedLabelColumn);

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
    } finally {
        setIsLoading(false);
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

  if (isLoading) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p>Loading test case data...</p>
            </div>
        </div>
    );
  }

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
                    <FileUploader onDataUploaded={(csv, file) => handleDataUploaded(csv, file.name)} templatePath="/test-cases-template.csv" />
                </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <>
            <Card>
                <CardHeader className="flex-row items-start justify-between">
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
                <CardFooter className='justify-center'>
                    <Button variant="outline" onClick={() => { setTestCases([]); setHeaders([]); setSelectedLabelColumn(''); }}>
                        Clear &amp; Upload New
                    </Button>
                </CardFooter>
            </Card>
        </>
      )}
    </div>
  );
}