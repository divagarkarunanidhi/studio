
'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { AppConfiguration } from '@/lib/types';
import { FileUploader } from '../dashboard/file-uploader';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '../ui/card';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { MultiSelect, type MultiSelectOption } from '../ui/multi-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { TestCasePieChart } from '../dashboard/test-case-pie-chart';


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
    
    const uniqueHeaders: string[] = [];
    const headerMap: { [key: string]: number[] } = {};

    headerRow.forEach((header, index) => {
        if (!headerMap[header]) {
            headerMap[header] = [];
            uniqueHeaders.push(header);
        }
        headerMap[header].push(index);
    });

    const data = dataRows.map(row => {
        const rowData: TestCaseData = {};
        uniqueHeaders.forEach(header => {
            const indices = headerMap[header];
            const values = indices.map(index => row[index]).filter(Boolean); // Filter out empty/null values
            rowData[header] = values.join(',');
        });
        return rowData;
    });

    return { headers: uniqueHeaders, data };
};

const DEFAULT_PILOT_LABELS = ['FordKOCPilot', 'ToshibaPilot', 'FradleyPilot'];

const processAndSetData = (data: TestCaseData[], setHeaders: (h: string[]) => void, setTestCases: (tc: TestCaseData[]) => void) => {
    if (data.length > 0) {
        const sampleHeaders = Object.keys(data[0]);
        setHeaders(sampleHeaders);
        setTestCases(data);
    }
}

export function TestCaseSummaryPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const firestore = useFirestore();
  const [jiraLink, setJiraLink] = useState<string>('');
  const [testCases, setTestCases] = useState<TestCaseData[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFilterLabels, setSelectedFilterLabels] = useState<string[]>([]);

  useEffect(() => {
    const fetchConfig = async () => {
        if (!firestore) return;
        const configRef = doc(firestore, 'appConfiguration', 'global');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
            const configData = configSnap.data() as AppConfiguration;
            setJiraLink(configData.jiraLink);
        }
    };
    fetchConfig();
  }, [firestore]);

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
    if (testCases.length > 0 && allUniqueLabels.length > 0) {
        const availableDefaultLabels = DEFAULT_PILOT_LABELS.filter(label => allUniqueLabels.includes(label));
        setSelectedFilterLabels(availableDefaultLabels);
    } else {
        setSelectedFilterLabels([]);
    }
  }, [testCases.length, allUniqueLabels]);


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

  const filteredTestCases = useMemo(() => {
    if (selectedFilterLabels.length === 0) {
        return testCases;
    }

    return testCases.filter(tc => {
        const tcLabels = new Set<string>();
        labelColumns.forEach(col => {
            if (tc[col]) {
                tc[col].split(',').forEach(l => tcLabels.add(l.trim()));
            }
        });
        return selectedFilterLabels.every(filterLabel => tcLabels.has(filterLabel));
    });
  }, [testCases, selectedFilterLabels, labelColumns]);
  
  const chartData = useMemo(() => {
    if (testCases.length === 0) return [];
  
    const getTCLabels = (tc: TestCaseData): Set<string> => {
        const labels = new Set<string>();
        labelColumns.forEach(col => {
            if (tc[col]) {
                tc[col].split(',').forEach(l => labels.add(l.trim()));
            }
        });
        return labels;
    };
  
    const data: { name: string; count: number; testCaseIds: string[] }[] = [];
  
    const getTestCaseId = (tc: TestCaseData) => tc['Issue key'] || 'N/A';

    // 1. "Matching All"
    if (selectedFilterLabels.length > 0) {
        const matchingAllTcs = testCases.filter(tc => {
            const tcLabels = getTCLabels(tc);
            return selectedFilterLabels.every(l => tcLabels.has(l));
        });
        if (matchingAllTcs.length > 0) {
            data.push({
                name: `Matching all: ${selectedFilterLabels.join(' & ')}`,
                count: matchingAllTcs.length,
                testCaseIds: matchingAllTcs.map(getTestCaseId)
            });
        }
    }
  
    // 2. Total count for each selected label
    selectedFilterLabels.forEach(label => {
        const tcsWithLabel = testCases.filter(tc => getTCLabels(tc).has(label));
        if (tcsWithLabel.length > 0) {
            data.push({
                name: `Total for '${label}'`,
                count: tcsWithLabel.length,
                testCaseIds: tcsWithLabel.map(getTestCaseId)
            });
        }
    });
    
    // 3. Total test cases
    if (testCases.length > 0) {
        data.push({
            name: 'Total Test Cases',
            count: testCases.length,
            testCaseIds: testCases.map(getTestCaseId)
        });
    }
  
    // Remove duplicates by name
    const uniqueData = Array.from(new Map(data.map(item => [item.name, item])).values());
    return uniqueData;

  }, [testCases, selectedFilterLabels, labelColumns]);


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
            <TestCasePieChart 
                data={chartData}
                title="Test Case Overview"
                description="Distribution of test cases based on selected labels."
                jiraLink={jiraLink}
            />
            <Card>
                <CardHeader>
                    <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4'>
                        <div>
                            <CardTitle>Test Case Details</CardTitle>
                            <CardDescription>
                                Displaying {filteredTestCases.length} of {testCases.length} uploaded test cases.
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
                    {filteredTestCases.length > 0 ? (
                        <div className="overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Defect ID</TableHead>
                                        <TableHead>Summary</TableHead>
                                        <TableHead>Labels</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredTestCases.map((tc, index) => {
                                        const allLabels = labelColumns
                                            .flatMap(col => tc[col]?.split(',').map(l => l.trim()) || [])
                                            .filter(Boolean)
                                            .join(', ');
                                        
                                        const defectId = tc['Issue key'] || 'N/A';

                                        return (
                                            <TableRow key={defectId !== 'N/A' ? defectId : index}>
                                                <TableCell>
                                                {defectId !== 'N/A' && jiraLink ? (
                                                    <a
                                                    href={`${jiraLink}/browse/${defectId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-primary hover:underline"
                                                    >
                                                    {defectId}
                                                    </a>
                                                ) : (
                                                    defectId
                                                )}
                                                </TableCell>
                                                <TableCell>{tc.Summary || 'N/A'}</TableCell>
                                                <TableCell className="max-w-md truncate">{allLabels || 'N/A'}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <Alert>
                            <FileText className="h-4 w-4" />
                            <AlertTitle>No Test Cases Match Filter</AlertTitle>
                            <AlertDescription>
                                No test cases were found that contain all of the selected labels.
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
                <CardFooter className='justify-center'>
                    <Button variant="outline" onClick={() => { setTestCases([]); setHeaders([]); setSelectedFilterLabels([]); handleLoadFromServer(); }}>
                        Clear &amp; Upload New
                    </Button>
                </CardFooter>
            </Card>
        </>
      )}
    </div>
  );
}
