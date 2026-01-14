
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
import { FileText, Loader2, Download, Wand2, AlertTriangle, PieChart, BarChart, LineChart, AreaChart, Radar } from 'lucide-react';
import { Button } from '../ui/button';
import { MultiSelect, type MultiSelectOption } from '../ui/multi-select';
import { SingleSelect, type SingleSelectOption } from '../ui/single-select';
import { Input } from '@/components/ui/input';
import { TestCaseDistributionChart } from '../dashboard/test-case-distribution-chart';
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
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';


type TestCaseData = { [key: string]: string };
type ChartType = 'pie' | 'bar' | 'line' | 'area' | 'radar';

interface TestCaseSummaryPageProps {
  onDataPresentChange: (isPresent: boolean) => void;
  showUploaderInitially: boolean;
}

const DEFAULT_REUSED_FROM_LABELS = ['FradleyPilot', 'ToshibaPilot'];
const DEFAULT_REUSED_IN_LABEL = 'FordKOCPilot';
const DEFAULT_OVERVIEW_LABELS = ['FradleyPilot', 'ToshibaPilot', 'FordKOCPilot'];

export function TestCaseSummaryPage({ onDataPresentChange, showUploaderInitially }: TestCaseSummaryPageProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const firestore = useFirestore();
  const [jiraLink, setJiraLink] = useState<string>('');
  
  // Data state
  const [totalTestCases, setTotalTestCases] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [distributionData, setDistributionData] = useState<any[]>([]);
  const [reusabilityData, setReusabilityData] = useState({ count: 0, testCases: [] });
  const [allUniqueLabels, setAllUniqueLabels] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  
  // UI and Filter state
  const [selectedFilterLabels, setSelectedFilterLabels] = useState<string[]>([]);
  const [chartType, setChartType] = useState<ChartType>('pie');
  const [isClient, setIsClient] = useState(false);

  const [reusedFromLabels, setReusedFromLabels] = useState<string[]>(DEFAULT_REUSED_FROM_LABELS);
  const [reusedInLabel, setReusedInLabel] = useState<string>(DEFAULT_REUSED_IN_LABEL);
  const [effortNew, setEffortNew] = useState<number>(6);
  const [effortReused, setEffortReused] = useState<number>(3);
  
  // AI analysis state
  const [analysis, setAnalysis] = useState<TestCaseAnalysisOutput | null>(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    onDataPresentChange(totalTestCases > 0);
  }, [totalTestCases, onDataPresentChange]);

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
  
  const fetchSummaryData = useCallback(async (filters: any) => {
    setIsLoading(true);
    try {
        const response = await fetch('/api/test-cases/summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filters),
        });
        if (!response.ok) throw new Error('Failed to fetch summary data.');

        const data = await response.json();
        setDistributionData(data.distribution);
        setReusabilityData(data.reusability);
        setTotalTestCases(data.totalTestCases);
        setAllUniqueLabels(data.uniqueLabels);
        setHeaders(data.headers);

        // Set default filter labels only once after the first successful data fetch
        if (selectedFilterLabels.length === 0 && data.uniqueLabels.length > 0) {
            const availableDefaultLabels = DEFAULT_OVERVIEW_LABELS.filter(label => data.uniqueLabels.includes(label));
            setSelectedFilterLabels(availableDefaultLabels);
        }

    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Error Fetching Summary',
            description: error.message,
        });
    } finally {
        setIsLoading(false);
    }
  }, [toast, selectedFilterLabels.length]);
  
  // Initial load and subsequent fetches on filter change
  useEffect(() => {
    const filters = {
        selectedFilterLabels,
        reusedFromLabels,
        reusedInLabel,
    };
    fetchSummaryData(filters);
  }, [selectedFilterLabels, reusedFromLabels, reusedInLabel, fetchSummaryData]);


  const uniqueLabelOptions: MultiSelectOption[] = useMemo(() => {
    return allUniqueLabels.map(label => ({ value: label, label: label }));
  }, [allUniqueLabels]);
  
  const uniqueLabelOptionsSingle: SingleSelectOption[] = useMemo(() => {
    return allUniqueLabels.map(label => ({ value: label, label: label }));
  }, [allUniqueLabels]);


  const handleDataUploaded = useCallback(async (csvText: string, fileName: string) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Authentication Error', description: 'You must be logged in to upload data.' });
      return;
    }
    setIsLoading(true);
    try {
        const tempParsed = JSON.parse(csvText); // A quick way to check if it's JSON array
        const response = await fetch('/api/test-cases/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ testCases: tempParsed, uploaderId: user.uid, fileName: fileName }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save data to the server.');
        }
        toast({ title: 'Success!', description: `${tempParsed.length} test case records uploaded and saved.` });
        await fetchSummaryData({ selectedFilterLabels, reusedFromLabels, reusedInLabel });

    } catch (error) { // If JSON parsing fails, assume it's CSV
        try {
            const response = await fetch('/api/test-cases/upload-csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csv: csvText, uploaderId: user.uid, fileName: fileName }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save CSV data to the server.');
            }
            const result = await response.json();
            toast({ title: 'Success!', description: `${result.count} test case records uploaded from CSV.` });
            await fetchSummaryData({ selectedFilterLabels, reusedFromLabels, reusedInLabel });
        } catch (csvError: any) {
            toast({ variant: 'destructive', title: 'Error Processing File', description: csvError.message });
        }
    } finally {
        setIsLoading(false);
    }
}, [toast, user, fetchSummaryData, selectedFilterLabels, reusedFromLabels, reusedInLabel]);


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

    const distributionDataString = JSON.stringify(distributionData.filter(d => d.name !== 'Total Test Cases in File').map(d => ({ name: d.name, count: d.count })), null, 2);
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
  }, [distributionData, reusedFromLabels, reusedInLabel, reusabilityData.count, totalSavingHours, totalSavingDays]);


  if (isLoading && showUploaderInitially) {
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
                        <CardDescription>To get started, please upload a CSV or JSON file containing your test case details.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <FileUploader onDataUploaded={(data, file) => handleDataUploaded(data, file.name)} templatePath="/test-cases-template.csv" accept=".csv, .json" />
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
                <CardDescription>Select labels to see a distribution of test cases that match ALL selected labels.</CardDescription>
            </CardHeader>
            <CardContent>
                    <MultiSelect
                    options={uniqueLabelOptions}
                    value={selectedFilterLabels}
                    onValueChange={setSelectedFilterLabels}
                    placeholder="Select labels to analyze..."
                    className="w-full"
                />
            </CardContent>
            <CardFooter className="flex-col items-start gap-4">
                <Tabs value={chartType} onValueChange={(value) => setChartType(value as ChartType)}>
                    <TabsList className="grid grid-cols-5">
                        <TabsTrigger value="pie"><PieChart className="h-4 w-4 mr-2"/>Pie</TabsTrigger>
                        <TabsTrigger value="bar"><BarChart className="h-4 w-4 mr-2"/>Bar</TabsTrigger>
                        <TabsTrigger value="line"><LineChart className="h-4 w-4 mr-2"/>Line</TabsTrigger>
                        <TabsTrigger value="area"><AreaChart className="h-4 w-4 mr-2"/>Area</TabsTrigger>
                        <TabsTrigger value="radar"><Radar className="h-4 w-4 mr-2"/>Radar</TabsTrigger>
                    </TabsList>
                </Tabs>
                {isClient ? (
                    <TestCaseDistributionChart
                        chartType={chartType}
                        data={[...distributionData, { name: 'Total Test Cases in File', count: totalTestCases, testCases: [] }]}
                        isLoading={isLoading}
                        title="Test Case Distribution"
                        description="Based on selected labels"
                        allHeaders={headers}
                        onExport={handleExport}
                        jiraLink={jiraLink}
                    />
                ) : (
                    <Skeleton className="h-[400px] w-full" />
                )}
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
                                        {(reusabilityData.testCases as TestCaseData[]).map((tc, idx) => {
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
                                    <Button variant="outline" onClick={() => handleExport(reusabilityData.testCases as TestCaseData[], 'reusable_test_cases')} disabled={reusabilityData.testCases.length === 0}>
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
