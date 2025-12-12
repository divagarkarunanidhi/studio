
'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { AppConfiguration, TestCaseAnalysisInput, TestCaseAnalysisOutput } from '@/lib/types';
import { analyzeTestCases } from '@/ai/flows/test-case-analysis-flow';
import * as XLSX from 'xlsx';
import { FileUploader } from '../dashboard/file-uploader';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '../ui/card';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { FileText, Loader2, Download, Wand2, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { MultiSelect, type MultiSelectOption } from '../ui/multi-select';
import { SingleSelect, type SingleSelectOption } from '../ui/single-select';
import { Input } from '@/components/ui/input';
import { TestCasePieChart } from '../dashboard/test-case-pie-chart';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Skeleton } from '../ui/skeleton';


type TestCaseData = { [key: string]: string };

interface TestCaseSummaryPageProps {
  onDataPresentChange: (isPresent: boolean) => void;
  showUploaderInitially: boolean;
}


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

const DEFAULT_REUSED_FROM_LABELS = ['FradleyPilot', 'ToshibaPilot'];
const DEFAULT_REUSED_IN_LABEL = 'FordKOCPilot';
const DEFAULT_OVERVIEW_LABELS = ['FradleyPilot', 'ToshibaPilot', 'FordKOCPilot'];

const processAndSetData = (data: TestCaseData[], setHeaders: (h: string[]) => void, setTestCases: (tc: TestCaseData[]) => void) => {
    if (data.length > 0) {
        const sampleHeaders = Object.keys(data[0]);
        setHeaders(sampleHeaders);
        setTestCases(data);
    }
}

export function TestCaseSummaryPage({ onDataPresentChange, showUploaderInitially }: TestCaseSummaryPageProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const firestore = useFirestore();
  const [jiraLink, setJiraLink] = useState<string>('');
  const [testCases, setTestCases] = useState<TestCaseData[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFilterLabels, setSelectedFilterLabels] = useState<string[]>([]);

  // State for reusability section
  const [reusedFromLabels, setReusedFromLabels] = useState<string[]>(DEFAULT_REUSED_FROM_LABELS);
  const [reusedInLabel, setReusedInLabel] = useState<string>(DEFAULT_REUSED_IN_LABEL);
  const [effortNew, setEffortNew] = useState<number>(6);
  const [effortReused, setEffortReused] = useState<number>(3);
  
  // State for AI analysis
  const [analysis, setAnalysis] = useState<TestCaseAnalysisOutput | null>(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    onDataPresentChange(testCases.length > 0);
  }, [testCases.length, onDataPresentChange]);

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
  
  const uniqueLabelOptionsSingle: SingleSelectOption[] = useMemo(() => {
    return allUniqueLabels.map(label => ({ value: label, label: label }));
  }, [allUniqueLabels]);


  useEffect(() => {
    if (testCases.length > 0 && allUniqueLabels.length > 0) {
        const availableDefaultLabels = DEFAULT_OVERVIEW_LABELS.filter(label => allUniqueLabels.includes(label));
        setSelectedFilterLabels(availableDefaultLabels);

        const availableReusedFrom = DEFAULT_REUSED_FROM_LABELS.filter(label => allUniqueLabels.includes(label));
        setReusedFromLabels(availableReusedFrom);

        if (allUniqueLabels.includes(DEFAULT_REUSED_IN_LABEL)) {
            setReusedInLabel(DEFAULT_REUSED_IN_LABEL);
        }

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

  const getTCLabelsAsSet = useCallback((tc: TestCaseData): Set<string> => {
    const labels = new Set<string>();
    labelColumns.forEach(col => {
        if (tc[col]) {
            tc[col].split(',').forEach(l => labels.add(l.trim()));
        }
    });
    return labels;
  }, [labelColumns]);


  const chartData = useMemo(() => {
    if (testCases.length === 0 || selectedFilterLabels.length === 0) {
        return [];
    }

    const dataMap: { name: string; count: number, testCases: TestCaseData[] }[] = [];

    // 1. "Matching All" count
    const allMatchingTcs = testCases.filter(tc => {
        const tcLabels = getTCLabelsAsSet(tc);
        return selectedFilterLabels.every(l => tcLabels.has(l));
    });

    if (allMatchingTcs.length > 0) {
        dataMap.push({
            name: `Matching all (${selectedFilterLabels.join(' & ')})`,
            count: allMatchingTcs.length,
            testCases: allMatchingTcs
        });
    }

    // 2. Total count for each selected label
    selectedFilterLabels.forEach(label => {
        const tcsWithLabel = testCases.filter(tc => getTCLabelsAsSet(tc).has(label));
        if (tcsWithLabel.length > 0) {
            dataMap.push({
                name: `Total for '${label}'`,
                count: tcsWithLabel.length,
                testCases: tcsWithLabel
            });
        }
    });

    // 3. Overall total
    const totalSlice = dataMap.find(d => d.name === 'Total Test Cases in File');
    if (!totalSlice && testCases.length > 0) {
        dataMap.push({
            name: 'Total Test Cases in File',
            count: testCases.length,
            testCases: testCases
        });
    }

    return dataMap;
  }, [testCases, selectedFilterLabels, getTCLabelsAsSet]);

  const reusabilityData = useMemo(() => {
    if (!reusedInLabel || reusedFromLabels.length === 0) {
      return { count: 0, testCases: [] };
    }

    const matchingTestCases = testCases.filter(tc => {
      const tcLabels = getTCLabelsAsSet(tc);
      const hasReusedInLabel = tcLabels.has(reusedInLabel);
      const hasReusedFromLabel = reusedFromLabels.some(fromLabel => tcLabels.has(fromLabel));
      
      return hasReusedInLabel && hasReusedFromLabel;
    });

    return {
      count: matchingTestCases.length,
      testCases: matchingTestCases,
    };
  }, [testCases, reusedFromLabels, reusedInLabel, getTCLabelsAsSet]);

  const handleExport = (testCasesToExport: TestCaseData[], sliceName: string) => {
    if (!testCasesToExport || testCasesToExport.length === 0) return;

    const worksheetData = testCasesToExport.map(tc => {
        const row: { [key: string]: any } = {};
        headers.forEach(header => {
            if (header === 'Issue key' && jiraLink) {
                row[header] = {
                    t: 's',
                    v: tc[header],
                    l: { Target: `${jiraLink}/browse/${tc[header]}`, Tooltip: `View ${tc[header]} in JIRA` }
                };
            } else {
                row[header] = tc[header] || '';
            }
        });
        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(worksheetData, { header: headers });

    const colWidths = headers.map(header => ({ wch: Math.max(header.length, 20) }));
    worksheet['!cols'] = colWidths;
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Test Cases');

    const fileName = `test_cases_${sliceName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };
  
  const savedEffort = useMemo(() => {
    return (effortNew > 0 && effortReused >= 0 && effortNew > effortReused) ? (effortNew - effortReused) : 0;
  }, [effortNew, effortReused]);

  const totalSavingHours = useMemo(() => {
    return reusabilityData.count * savedEffort;
  }, [reusabilityData.count, savedEffort]);

  const totalSavingDays = useMemo(() => {
    return totalSavingHours / 8;
  }, [totalSavingHours]);

  const handleRunAnalysis = useCallback(async () => {
    setIsAnalysisLoading(true);
    setAnalysis(null);
    setAnalysisError(null);

    const distributionDataString = JSON.stringify(chartData.filter(d => d.name !== 'Total Test Cases in File').map(d => ({ name: d.name, count: d.count })), null, 2);
    const reusabilityPayloadString = JSON.stringify({
        reused_from_labels: reusedFromLabels,
        reused_in_label: reusedInLabel,
        reusability_count: reusabilityData.count,
        effort_saving_hours: totalSavingHours,
        effort_saving_days: totalSavingDays.toFixed(2)
    }, null, 2);

    try {
        const result = await analyzeTestCases({
            distributionData: distributionDataString,
            reusabilityData: reusabilityPayloadString,
        });
        setAnalysis(result);
    } catch (e: any) {
        setAnalysisError(e.message || "An unknown error occurred while generating the analysis.");
        console.error(e);
    } finally {
        setIsAnalysisLoading(false);
    }
  }, [chartData, reusedFromLabels, reusedInLabel, reusabilityData.count, totalSavingHours, totalSavingDays]);


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

  if (showUploaderInitially) {
    return (
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
    );
}

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Test Case Overview</CardTitle>
                <CardDescription>Select labels to filter the test case distribution.</CardDescription>
            </CardHeader>
            <CardContent>
                    <MultiSelect
                    options={uniqueLabelOptions}
                    defaultValue={selectedFilterLabels}
                    onValueChange={setSelectedFilterLabels}
                    placeholder="Select labels to analyze..."
                    className="w-full"
                />
            </CardContent>
            <CardFooter>
                <TestCasePieChart
                    data={chartData}
                    title="Test Case Distribution"
                    description="Based on selected labels"
                    allHeaders={headers}
                    onExport={handleExport}
                    jiraLink={jiraLink}
                />
            </CardFooter>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Test Case Reusability</CardTitle>
                <CardDescription>Analyze how test cases are reused across different labels and calculate effort savings.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
                <div className='flex flex-col sm:flex-row gap-4'>
                    <div className="w-full sm:w-1/2 space-y-2">
                        <label className="text-sm font-medium">Reused from</label>
                        <MultiSelect 
                            options={uniqueLabelOptions}
                            defaultValue={reusedFromLabels}
                            onValueChange={setReusedFromLabels}
                            placeholder="Select source labels..."
                            className="w-full"
                        />
                    </div>
                    <div className="w-full sm:w-1/2 space-y-2">
                        <label className="text-sm font-medium">Reused in</label>
                        <SingleSelect
                            options={uniqueLabelOptionsSingle}
                            value={reusedInLabel}
                            onValueChange={setReusedInLabel}
                            placeholder="Select target label..."
                            emptyMessage="No labels found."
                            />
                    </div>
                </div>

                <div className='flex flex-col sm:flex-row gap-4'>
                    <div className="w-full sm:w-1/2 space-y-2">
                        <label className="text-sm font-medium">Actual effort for new test case (hrs)</label>
                        <Input
                            type="number"
                            value={effortNew}
                            onChange={(e) => setEffortNew(parseFloat(e.target.value) || 0)}
                            placeholder="e.g., 4"
                        />
                    </div>
                    <div className="w-full sm:w-1/2 space-y-2">
                        <label className="text-sm font-medium">Actual effort for reused test case (hrs)</label>
                        <Input
                            type="number"
                            value={effortReused}
                            onChange={(e) => setEffortReused(parseFloat(e.target.value) || 0)}
                            placeholder="e.g., 1"
                        />
                    </div>
                </div>

                <div className='text-center pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-center'>
                    <div>
                        <h3 className="text-lg font-medium text-muted-foreground">Reusability Count</h3>
                        <Dialog>
                            <DialogTrigger asChild>
                                <button className="text-4xl font-bold text-primary hover:underline cursor-pointer disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50" disabled={reusabilityData.count === 0}>
                                    {reusabilityData.count}
                                </button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                                <DialogHeader>
                                    <DialogTitle>Reusable Test Cases ({reusabilityData.count})</DialogTitle>
                                    <DialogDescription>
                                        Test cases in '{reusedInLabel}' that are also in '{reusedFromLabels.join(', ')}'.
                                    </DialogDescription>
                                </DialogHeader>
                                <ScrollArea className="h-72 w-full rounded-md border">
                                    <div className="p-4 flex flex-wrap gap-2">
                                        {reusabilityData.testCases.map((tc, idx) => {
                                            const id = tc['Issue key'] || `item-${idx}`;
                                            return (
                                                <Badge key={id} variant="secondary">
                                                    {jiraLink && id !== 'N/A' && !id.startsWith('item-') ? (
                                                        <a
                                                            href={`${jiraLink}/browse/${id}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="hover:underline"
                                                        >
                                                            {id}
                                                        </a>
                                                    ) : (
                                                        id
                                                    )}
                                                </Badge>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => handleExport(reusabilityData.testCases, 'reusable_test_cases')} disabled={reusabilityData.testCases.length === 0}>
                                        <Download className="mr-2 h-4 w-4" />
                                        Export to Excel
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div>
                        <h3 className="text-lg font-medium text-muted-foreground">Saving (Hours)</h3>
                        <p className="text-4xl font-bold text-primary">{totalSavingHours.toFixed(2)}</p>
                    </div>
                    
                    <div>
                        <h3 className="text-lg font-medium text-muted-foreground">Saving (Days)</h3>
                        <p className="text-4xl font-bold text-primary">{totalSavingDays.toFixed(2)}</p>
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>AI-Powered Summary</CardTitle>
                <CardDescription>A high-level analysis of your test case distribution and reusability.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col items-start gap-4">
                        <Button onClick={handleRunAnalysis} disabled={isAnalysisLoading}>
                        <Wand2 className="mr-2 h-4 w-4" />
                        {isAnalysisLoading ? 'Generating...' : 'Generate Summary'}
                    </Button>
                    {analysisError && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Analysis Failed</AlertTitle>
                            <AlertDescription>{analysisError}</AlertDescription>
                        </Alert>
                    )}
                    {isAnalysisLoading ? (
                        <div className='space-y-2 w-full'>
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                        </div>
                    ) : analysis ? (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{analysis.analysis}</p>
                    ) : (
                        !analysisError && (
                            <Alert>
                            <FileText className="h-4 w-4" />
                            <AlertTitle>Ready to Analyze</AlertTitle>
                            <AlertDescription>Click the button to generate an AI summary of your current test case data.</AlertDescription>
                        </Alert>
                        )
                    )}
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
