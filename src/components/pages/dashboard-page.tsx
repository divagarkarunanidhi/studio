
'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Defect } from '@/lib/types';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarFooter,
} from '@/components/ui/sidebar';
import {
  Bug,
  CalendarClock,
  Github,
  LayoutDashboard,
  TestTube,
  FileHeart,
  Wand2,
  Timer,
  LineChart,
  PieChart,
  AlertTriangle,
  Upload,
} from 'lucide-react';
import { FileUploader } from '../dashboard/file-uploader';
import { StatCard } from '../dashboard/stat-card';
import { DefectsTable } from '../dashboard/defects-table';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { isSameDay, subDays, parseISO } from 'date-fns';
import { AnalysisPage } from './analysis-page';
import { PredictionPage } from './prediction-page';
import { ResolutionTimePage } from './resolution-time-page';
import { TrendPage } from './trend-page';
import { SummaryPage } from './summary-page';
import { Button } from '../ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ClientTimestamp } from '../dashboard/client-timestamp';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, writeBatch, doc, getDocs, query } from 'firebase/firestore';

type View = 'dashboard' | 'all-defects' | 'analysis' | 'prediction' | 'resolution-time' | 'trend-analysis' | 'summary' | 'required-attention';

const RECORDS_PER_PAGE = 50;

const parseCSV = (text: string): string[][] => {
    const result: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;
  
    while (i < text.length) {
      const char = text[i];
  
      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            currentField += '"';
            i++; // Skip the second quote
          } else {
            inQuotes = false;
          }
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          currentRow.push(currentField);
          currentField = '';
        } else if (char === '\n' || char === '\r') {
          currentRow.push(currentField);
          result.push(currentRow);
          currentRow = [];
          currentField = '';
          if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
            i++;
          }
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
  
    return result.filter(
      (row) => row.length > 1 || (row.length === 1 && row[0].trim() !== '')
    );
};

const parseDate = (dateString: string): Date | null => {
    if (!dateString) return null;
    let date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date;
    }
    const parts = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+([AP]M)/);
    if (parts) {
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const year = parseInt(parts[3], 10);
      let hour = parseInt(parts[4], 10);
      const minute = parseInt(parts[5], 10);
      const second = parseInt(parts[6], 10);
      const ampm = parts[7];
  
      if (ampm === 'PM' && hour < 12) {
        hour += 12;
      }
      if (ampm === 'AM' && hour === 12) {
        hour = 0;
      }
      date = new Date(year, month, day, hour, minute, second);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  
    return null;
  }

export function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const defectsColRef = useMemoFirebase(() => user ? collection(firestore, 'users', user.uid, 'defects') : null, [firestore, user]);
  const { data: defectsFromHook, isLoading: defectsLoading } = useCollection<Defect>(defectsColRef);

  const [activeView, setActiveView] = useState<View>('dashboard');
  
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [filterReportedBy, setFilterReportedBy] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();

  const [uploadTimestamp, setUploadTimestamp] = useState<string | null>(null);

  const defects = useMemo(() => defectsFromHook, [defectsFromHook]);

  useEffect(() => {
    if(!defectsLoading && defects && defects.length > 0) {
        if(!uploadTimestamp) { // Set timestamp only if not already set by an upload
            const latestCreation = defects.reduce((latest, d) => {
                try {
                    const current = parseISO(d.created_at);
                    return current > latest ? current : latest;
                } catch {
                    return latest;
                }
            }, new Date(0));
            if(latestCreation.getTime() > 0) {
                setUploadTimestamp(latestCreation.toISOString());
            }
        }
    } else if (!defectsLoading && (!defects || defects.length === 0)) {
        setUploadTimestamp(null);
    }
  }, [defects, defectsLoading, uploadTimestamp]);

  const handleDataUploaded = useCallback(async (csvText: string) => {
    if (!user || !firestore) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'User not authenticated. Cannot upload data.'
        });
        return;
    }
    try {
        const rows = parseCSV(csvText);
        if (rows.length < 2) throw new Error('CSV must have a header and at least one data row.');

        let headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, ''));
        const requiredHeaders = ['issue_key', 'summary', 'created'];
        for (const requiredHeader of requiredHeaders) {
            if (!headers.includes(requiredHeader)) throw new Error(`CSV must include headers: ${requiredHeaders.join(', ')}. Missing: "${requiredHeader}"`);
        }

        const parsedDefects = rows.slice(1).map((values, rowIndex) => {
            let currentHeader = '';
            try {
                const defectObj: any = headers.reduce((obj, header, index) => {
                    currentHeader = header;
                    let value = values[index] || '';

                    if (header === 'created' || header === 'updated') {
                        const parsedDate = parseDate(value);
                        if (!parsedDate && header === 'created') throw new Error(`Invalid date in '${header}'.`);
                        value = parsedDate ? parsedDate.toISOString() : '';
                    }
                    const keyMap = { 'issue_key': 'id', 'created': 'created_at', 'reporter': 'reported_by', 'custom_field_business_domain': 'domain' };
                    const mappedKey = keyMap[header] || header;

                    obj[mappedKey] = value;
                    return obj;
                }, {} as any);
                
                if (!defectObj.id || !defectObj.summary || !defectObj.created_at) return null;
                
                return { ...defectObj, uploaderId: user.uid };
            } catch (cellError: any) {
                throw new Error(`Error in row ${rowIndex + 2} at "${currentHeader}": ${cellError.message}`);
            }
        }).filter((d): d is Defect => d !== null);

        if (parsedDefects.length === 0) throw new Error('No valid defect data found.');
        
        const batch = writeBatch(firestore);
        parsedDefects.forEach(defect => {
            const docRef = doc(firestore, 'users', user.uid, 'defects', defect.id);
            batch.set(docRef, defect);
        });
        await batch.commit();
        
        toast({ title: 'Success!', description: `${parsedDefects.length} records loaded.` });
        setUploadTimestamp(new Date().toISOString());
        setActiveView('dashboard');
    } catch (error) {
        console.error('Error during defect upload:', error);
        toast({
            variant: 'destructive',
            title: 'Error processing file',
            description: error instanceof Error ? error.message : 'An unknown error occurred.',
        });
    }
  }, [user, firestore, toast]);

  const handleClearData = async () => {
    if (!user || !firestore) return;
    
    const defectsQuery = query(collection(firestore, 'users', user.uid, 'defects'));
    const querySnapshot = await getDocs(defectsQuery);
    
    if(querySnapshot.empty) {
        setUploadTimestamp(null);
        toast({ title: "No Data to Clear", description: "There is no data to clear." });
        return;
    }

    const batch = writeBatch(firestore);
    querySnapshot.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    setUploadTimestamp(null);
    toast({ title: "Data Cleared", description: "All defect data has been cleared. You can now upload a new file." });
    setActiveView('dashboard');
  };

  const yesterdayDefectsCount = useMemo(() => {
    if (!defects || defects.length === 0) return 0;
    const yesterday = subDays(new Date(), 1);
    return defects.filter(defect => {
      try {
        return isSameDay(parseISO(defect.created_at), yesterday);
      } catch (error) {
        return false;
      }
    }).length;
  }, [defects]);

  const readyForTestingCount = useMemo(() => {
    if (!defects || defects.length === 0) return 0;
    return defects.filter(
      defect => defect.status && defect.status.toLowerCase() === 'ready for testing'
    ).length;
  }, [defects]);
  

  const totalDefects = useMemo(() => defects?.length || 0, [defects]);

  const viewTitles: Record<View, string> = {
    dashboard: 'Dashboard',
    'all-defects': 'All Defects',
    analysis: 'Static Defect Analysis',
    prediction: 'Defect Prediction',
    'resolution-time': 'Resolution Time Analysis',
    'trend-analysis': 'Trend Analysis',
    summary: 'Defect Summary',
    'required-attention': 'Defects Requiring Attention'
  };
  
  const viewDescriptions: Record<View, string> = {
    dashboard: 'A summary of all defect data.',
    'all-defects': 'A complete list of all imported defects.',
    analysis: 'AI-powered analysis of the defect data.',
    prediction: 'Predict defect properties using an AI assistant.',
    'resolution-time': 'Analysis of the time taken to resolve defects.',
    'trend-analysis': 'Visualize the creation of defects over time.',
    summary: 'AI-powered summary of defect root cause and functional area.',
    'required-attention': 'Defects that are missing key information and are not yet done.'
  };

  const uniqueDomains = useMemo(() => {
    if (!defects) return [];
    const domains = new Set<string>();
    defects.forEach(defect => {
      if (defect.domain) domains.add(defect.domain);
    });
    return Array.from(domains).filter(Boolean).sort();
  }, [defects]);

  const uniqueReporters = useMemo(() => {
    if (!defects) return [];
    const reporters = new Set<string>();
    defects.forEach(defect => {
      if (defect.reported_by) reporters.add(defect.reported_by);
    });
    return Array.from(reporters).filter(Boolean).sort();
    }, [defects]);

    const uniqueStatuses = useMemo(() => {
    if (!defects) return [];
    const statuses = new Set<string>();
    defects.forEach(defect => {
        if (defect.status) statuses.add(defect.status);
    });
    return Array.from(statuses).filter(Boolean).sort();
    }, [defects]);

  const filteredDefects = useMemo(() => {
    if (!defects) return [];
    return defects.filter(defect => {
        const domainMatch = filterDomain === 'all' || defect.domain === filterDomain;
        const reporterMatch = filterReportedBy === 'all' || defect.reported_by === filterReportedBy;
        const statusMatch = filterStatus === 'all' || defect.status === filterStatus;
        return domainMatch && reporterMatch && statusMatch;
    });
  }, [defects, filterDomain, filterReportedBy, filterStatus]);

  const attentionDefects = useMemo(() => {
    if (!defects) return [];
    const testDataKeywords = ['test data', 'order release id', 'shipment id', 'invoice id', 'taas202'];
    const numericTestDataRegex = /\d{7,}/;
  
    return defects
      .map(defect => {
        const description = defect.description?.toLowerCase() || '';
        const status = defect.status?.toLowerCase() || '';
  
        if (status === 'done') {
          return null;
        }
  
        const hasExpected = description.includes('expected');
        const hasActual = description.includes('actual');
        const hasKeywordTestData = testDataKeywords.some(kw => description.includes(kw));
        const hasNumericTestData = numericTestDataRegex.test(description);
        const hasTestData = hasKeywordTestData || hasNumericTestData;
        
        const hasGiven = description.includes('given');
        const hasWhen = description.includes('when');
        const hasThen = description.includes('then');
        const cucumberCount = [hasGiven, hasWhen, hasThen].filter(Boolean).length;
        const hasCucumberSteps = cucumberCount >= 2;

        const missingInfo: string[] = [];
        if (!hasExpected) {
          missingInfo.push("Missing 'Expected'");
        }
        if (!hasActual) {
          missingInfo.push("Missing 'Actual'");
        }
        if (!hasTestData) {
          missingInfo.push("Missing Test Data ID");
        }
        if (hasCucumberSteps) {
            missingInfo.push("cucumber steps present");
        }
        
        if (missingInfo.length === 0) {
            return null;
        }
        
        return { ...defect, reasonForAttention: missingInfo.join(', ') };
      })
      .filter((d): d is Defect & { reasonForAttention: string } => d !== null);
  }, [defects]);

  const totalPages = Math.ceil(filteredDefects.length / RECORDS_PER_PAGE);

  const paginatedDefects = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    const endIndex = startIndex + RECORDS_PER_PAGE;
    return filteredDefects.slice(startIndex, endIndex);
  }, [filteredDefects, currentPage]);

  if (isUserLoading || defectsLoading) {
    return (
        <div className="flex h-screen w-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Bug className="h-12 w-12 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading Defect Insights...</p>
            </div>
        </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2">
            <h1 className="text-lg font-semibold">TaaS BugSense AI</h1>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Dashboard" isActive={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')}>
                <LayoutDashboard />
                Dashboard
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Trend Analysis" isActive={activeView === 'trend-analysis'} onClick={() => setActiveView('trend-analysis')}>
                <LineChart />
                Trend Analysis
              </SidebarMenuButton>
            </SidebarMenuItem>
             <SidebarMenuItem>
              <SidebarMenuButton tooltip="Defect Summary" isActive={activeView === 'summary'} onClick={() => setActiveView('summary')}>
                <PieChart />
                Defect Summary
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Defect Analysis" isActive={activeView === 'analysis'} onClick={() => setActiveView('analysis')}>
                <FileHeart />
                Static Analysis
              </SidebarMenuButton>
            </SidebarMenuItem>
             <SidebarMenuItem>
              <SidebarMenuButton tooltip="Defect Prediction" isActive={activeView === 'prediction'} onClick={() => setActiveView('prediction')}>
                <Wand2 />
                Defect Prediction
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Resolution Time" isActive={activeView === 'resolution-time'} onClick={() => setActiveView('resolution-time')}>
                <Timer />
                Resolution Time
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="All Defects" isActive={activeView === 'all-defects'} onClick={() => setActiveView('all-defects')}>
                <Bug />
                All Defects
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Required Attention" isActive={activeView === 'required-attention'} onClick={() => setActiveView('required-attention')}>
                <AlertTriangle />
                Required Attention
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
           <SidebarMenu>
             <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="View on GitHub">
                <a href="https://github.com" target="_blank">
                  <Github />
                  Source Code
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
           </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-auto min-h-14 flex-col items-start justify-center gap-2 border-b bg-background/95 p-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-4">
            <SidebarTrigger className="sm:hidden"/>
            <div>
                <h1 className="text-xl font-semibold tracking-tight">{viewTitles[activeView]}</h1>
                <p className="text-sm text-muted-foreground">{viewDescriptions[activeView]}</p>
            </div>
          </div>
          {uploadTimestamp && (
            <div className="flex items-center gap-4">
                <ClientTimestamp timestamp={uploadTimestamp} />
                <Button variant="outline" onClick={handleClearData}>
                    <Upload className="mr-2 h-4 w-4" />
                    Load New Data
                </Button>
            </div>
          )}
        </header>

        {defects === null || defects.length === 0 ? (
          <main className="flex flex-1 flex-col items-center justify-center p-4">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="rounded-lg bg-card p-6 shadow-sm">
                <h2 className="text-2xl font-bold">Welcome!</h2>
                <p className="mt-2 text-muted-foreground">
                  To get started, please upload a CSV file containing your defect data.
                </p>
              </div>
              <FileUploader onDataUploaded={handleDataUploaded} />
            </div>
          </main>
        ) : (
          <main className="flex-1 space-y-4 p-4 md:space-y-6 md:p-6">
            {activeView === 'dashboard' && (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <StatCard title="Total Defects" value={totalDefects} icon={<Bug />} />
                  <StatCard title="Created Yesterday" value={yesterdayDefectsCount} icon={<CalendarClock />} />
                  <StatCard title="Ready for Testing" value={readyForTestingCount} icon={<TestTube />} />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent Defects</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DefectsTable defects={defects} />
                  </CardContent>
                </Card>
              </>
            )}

            {activeView === 'trend-analysis' && (
              <TrendPage defects={defects} />
            )}

            {activeView === 'summary' && (
              <SummaryPage defects={defects} uniqueDomains={uniqueDomains} />
            )}

            {activeView === 'analysis' && (
              <AnalysisPage defects={defects} uniqueDomains={uniqueDomains} />
            )}

            {activeView === 'prediction' && (
              <PredictionPage defects={defects} uniqueDomains={uniqueDomains} />
            )}

            {activeView === 'resolution-time' && (
              <ResolutionTimePage defects={defects} uniqueDomains={uniqueDomains} />
            )}

            {activeView === 'all-defects' && (
               <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <CardTitle>{viewTitles['all-defects']}</CardTitle>
                            <CardDescription>{viewDescriptions['all-defects']}</CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Select value={filterDomain} onValueChange={setFilterDomain}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Filter by Domain" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Domains</SelectItem>
                                    {uniqueDomains.map(domain => (
                                    <SelectItem key={domain} value={domain}>{domain}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={filterReportedBy} onValueChange={setFilterReportedBy}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Filter by Reporter" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Reporters</SelectItem>
                                    {uniqueReporters.map(reporter => (
                                    <SelectItem key={reporter} value={reporter}>{reporter}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={filterStatus} onValueChange={setFilterStatus}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Filter by Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    {uniqueStatuses.map(status => (
                                    <SelectItem key={status} value={status}>{status}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                  <DefectsTable defects={paginatedDefects} showAll />
                   <div className="mt-4 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                            Showing {paginatedDefects.length > 0 ? (currentPage - 1) * RECORDS_PER_PAGE + 1 : 0}-
                            {Math.min(currentPage * RECORDS_PER_PAGE, filteredDefects.length)} of {filteredDefects.length} defects
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages || totalPages === 0}
                            >
                                Next
                            </Button>
                        </div>
                   </div>
                </CardContent>
              </Card>
            )}

            {activeView === 'required-attention' && (
                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                            <div>
                                <CardTitle>{viewTitles['required-attention']} ({attentionDefects.length})</CardTitle>
                                <CardDescription>
                                    These defects have a status other than "Done" and are missing one or more of the following: "Expected" and "Actual" keywords, or a test data ID in their description.
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <DefectsTable defects={attentionDefects} showAll showDescription={true} />
                    </CardContent>
                </Card>
            )}

          </main>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

    

    