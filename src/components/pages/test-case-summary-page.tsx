

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import { FileUploader } from '../dashboard/file-uploader';
import { TestCasePieChart } from '../dashboard/test-case-pie-chart';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '../ui/card';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { MultiSelect, type MultiSelectOption } from '../ui/multi-select';


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

const processAndSetData = (data: TestCaseData[], setHeaders: (h: string[]) => void, setTestCases: (tc: TestCaseData[]) => void) => {
    if (data.length > 0) {
        // Since headers might not be stored in DB, recalculate them from the first data object.
        const sampleHeaders = Object.keys(data[0]);
        setHeaders(sampleHeaders);
        setTestCases(data);
    }
}

export function TestCaseSummaryPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const [testCases, setTestCases] = useState<TestCaseData[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFilterLabels, setSelectedFilterLabels] = useState<string[]>([]);

  const labelColumns = useMemo(() => {
    return headers.filter(h => h.toLowerCase().startsWith('label')).sort();
  }, [headers]);

  const allUniqueLabels = useMemo(() => {
    if (testCases.length === 0 || labelColumns.length === 0) {
      return [];
    }
    const uniqueLabels = new Set<string>();
    for (const testCase of testCases) {
      for (const col of labelColumns) {
        const value = testCase[col];
        if (value && value.trim() !== '') {
          const labels = value.split(',').map(l => l.trim());
          for (const label of labels) {
            if (label) {
              uniqueLabels.add(label);
            }
          }
        }
      }
    }
    return Array.from(uniqueLabels).sort();
  }, [testCases, labelColumns]);

  const uniqueLabelOptions: MultiSelectOption[] = useMemo(() => {
    return allUniqueLabels.map(label => ({ value: label, label: label }));
  }, [allUniqueLabels]);


  useEffect(() => {
    // Reset filter when data changes
    setSelectedFilterLabels([]);
  }, [testCases]);

  const handleLoadFromServer = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/test-cases/latest');
      if (!response.ok) throw new Error('Failed to fetch latest data.');
      const data = await response.json();
      if (data && data.testCases) {
          processAndSetData(data.testCases, setHeaders, setTestCases);
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
      
      processAndSetData(parsedData, setHeaders, setTestCases);

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
    if (testCases.length === 0 || labelColumns.length === 0) {
      return [];
    }
  
    const counts: { [key: string]: number } = {};
  
    if (selectedFilterLabels.length === 0) {
      // Original logic: Count all labels across all test cases.
      for (const testCase of testCases) {
        let hasAnyLabel = false;
        for (const col of labelColumns) {
          const value = testCase[col];
          if (value && value.trim() !== '') {
            hasAnyLabel = true;
            const labels = value.split(',').map(l => l.trim());
            for (const label of labels) {
              if (label) {
                counts[label] = (counts[label] || 0) + 1;
              }
            }
          }
        }
        if (!hasAnyLabel) {
            counts['Unassigned'] = (counts['Unassigned'] || 0) + 1;
        }
      }
    } else {
        let otherCount = testCases.length;
        
        selectedFilterLabels.forEach(selectedLabel => {
            const countForLabel = testCases.filter(tc => {
                for (const col of labelColumns) {
                    const value = tc[col];
                    if (value && value.split(',').map(l => l.trim()).includes(selectedLabel)) {
                        return true;
                    }
                }
                return false;
            }).length;

            counts[selectedLabel] = countForLabel;
        });

        // Calculate "Other Test Cases" count, which represents test cases that DO NOT have ANY of the selected labels.
        const testCasesWithSelectedLabels = new Set<number>();
        selectedFilterLabels.forEach(selectedLabel => {
            testCases.forEach((tc, index) => {
                for (const col of labelColumns) {
                    const value = tc[col];
                    if (value && value.split(',').map(l => l.trim()).includes(selectedLabel)) {
                        testCasesWithSelectedLabels.add(index);
                    }
                }
            });
        });
        
        counts['Other Test Cases'] = testCases.length - testCasesWithSelectedLabels.size;
    }
  
    return Object.entries(counts).map(([name, count]) => ({
      name,
      count,
    })).filter(item => item.count > 0);
  }, [testCases, labelColumns, selectedFilterLabels]);

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
                <CardHeader>
                    <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
                        <div>
                            <CardTitle>Test Case Summary</CardTitle>
                            <CardDescription>
                            Displaying a summary of {testCases.length} uploaded test cases.
                            </CardDescription>
                        </div>
                        {allUniqueLabels.length > 0 && (
                            <MultiSelect 
                                options={uniqueLabelOptions}
                                defaultValue={selectedFilterLabels}
                                onValueChange={setSelectedFilterLabels}
                                placeholder="Filter by labels..."
                                className="w-full sm:w-[300px]"
                            />
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {chartData.length > 0 ? (
                         <TestCasePieChart
                            data={chartData}
                            title={selectedFilterLabels.length === 0 ? `Overall Label Distribution` : `Filtered Label Distribution`}
                            description={selectedFilterLabels.length === 0 ? `A breakdown of all test cases by label.` : `A count of test cases for selected labels.`}
                        />
                    ) : (
                        <Alert>
                            <FileText className="h-4 w-4" />
                            <AlertTitle>No Data to Display</AlertTitle>
                            <AlertDescription>
                                No labels found for the current selection.
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
                <CardFooter className='justify-center'>
                    <Button variant="outline" onClick={() => { setTestCases([]); setHeaders([]); setSelectedFilterLabels([]); }}>
                        Clear &amp; Upload New
                    </Button>
                </CardFooter>
            </Card>
        </>
      )}
    </div>
  );
}
