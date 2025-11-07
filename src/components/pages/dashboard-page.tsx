
'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { isSameDay, subDays, parseISO, format } from 'date-fns';
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
import { useUser } from '@/firebase/auth/use-user';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

type View = 'dashboard' | 'all-defects' | 'analysis' | 'prediction' | 'resolution-time' | 'trend-analysis' | 'summary' | 'required-attention';

const RECORDS_PER_PAGE = 50;


export function DashboardPage() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [uploadTimestamp, setUploadTimestamp] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<View>('dashboard');
  
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [filterReportedBy, setFilterReportedBy] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();

  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();


  // Fetch data from Firestore on user load
  useEffect(() => {
    if (user && firestore && !userLoading) {
      const fetchData = async () => {
        const defectDocRef = doc(firestore, 'defects', user.uid);
        try {
          const docSnap = await getDoc(defectDocRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setDefects(data.defects || []);
            setUploadTimestamp(data.uploadedAt || null);
          }
        } catch (e: any) {
          // For a read operation, a console error is sufficient if it fails.
          console.error("Error fetching defect data:", e);
          toast({
            variant: "destructive",
            title: "Could not load data",
            description: "There was an issue fetching your saved data from the server."
          })
        }
      };
      fetchData();
    }
  }, [user, firestore, userLoading, toast]);

  const handleDataUploaded = (data: Defect[]) => {
    const timestamp = new Date().toISOString();
    setDefects(data);
    setUploadTimestamp(timestamp);
    setActiveView('dashboard');
    
    if (user && firestore) {
        const defectData = {
          defects: data,
          uploadedAt: timestamp,
        };
        const defectDocRef = doc(firestore, 'defects', user.uid);
        
        setDoc(defectDocRef, defectData, { merge: true })
          .then(() => {
            toast({
                title: "Data Saved!",
                description: "Your defect data has been securely saved to the server.",
            });
          })
          .catch((e: any) => {
            // This is where we create and emit the contextual permission error
            const permissionError = new FirestorePermissionError({
              path: defectDocRef.path,
              operation: 'write',
              requestResourceData: defectData
            });
            errorEmitter.emit('permission-error', permissionError);
          });
    }
  };

  const handleClearData = async () => {
    setDefects([]);
    setUploadTimestamp(null);
    if (user && firestore) {
        const defectDocRef = doc(firestore, 'defects', user.uid);
        setDoc(defectDocRef, { defects: [], uploadedAt: null }, { merge: true })
          .catch((error: any) => {
            const permissionError = new FirestorePermissionError({
              path: defectDocRef.path,
              operation: 'delete'
            });
            errorEmitter.emit('permission-error', permissionError);
        });
    }
    toast({ title: "Data Cleared", description: "Your local data has been cleared. New data can be uploaded." });
  };

  const yesterdayDefectsCount = useMemo(() => {
    if (defects.length === 0) return 0;
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
    if (defects.length === 0) return 0;
    return defects.filter(
      defect => defect.status && defect.status.toLowerCase() === 'ready for testing'
    ).length;
  }, [defects]);
  

  const totalDefects = useMemo(() => defects.length, [defects]);

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
    const domains = new Set<string>();
    defects.forEach(defect => {
      if (defect.domain) domains.add(defect.domain);
    });
    return Array.from(domains).filter(Boolean).sort();
  }, [defects]);

  const uniqueReporters = useMemo(() => {
    const reporters = new Set<string>();
    defects.forEach(defect => {
      if (defect.reported_by) reporters.add(defect.reported_by);
    });
    return Array.from(reporters).filter(Boolean).sort();
    }, [defects]);

    const uniqueStatuses = useMemo(() => {
    const statuses = new Set<string>();
    defects.forEach(defect => {
        if (defect.status) statuses.add(defect.status);
    });
    return Array.from(statuses).filter(Boolean).sort();
    }, [defects]);

  const filteredDefects = useMemo(() => {
    return defects.filter(defect => {
        const domainMatch = filterDomain === 'all' || defect.domain === filterDomain;
        const reporterMatch = filterReportedBy === 'all' || defect.reported_by === filterReportedBy;
        const statusMatch = filterStatus === 'all' || defect.status === filterStatus;
        return domainMatch && reporterMatch && statusMatch;
    });
  }, [defects, filterDomain, filterReportedBy, filterStatus]);

  const attentionDefects = useMemo(() => {
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
  
  useEffect(() => {
    setCurrentPage(1);
    if(defects.length > 0) {
        setFilterDomain('all');
        setFilterReportedBy('all');
        setFilterStatus('all');
    }
  }, [defects]);


  const totalPages = Math.ceil(filteredDefects.length / RECORDS_PER_PAGE);

  const paginatedDefects = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    const endIndex = startIndex + RECORDS_PER_PAGE;
    return filteredDefects.slice(startIndex, endIndex);
  }, [filteredDefects, currentPage]);


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
                <div className="text-xs text-muted-foreground text-right">
                    Last updated: <br />
                    {format(parseISO(uploadTimestamp), "MMM d, yyyy 'at' h:mm a")}
                </div>
                <Button variant="outline" onClick={handleClearData}>
                    <Upload className="mr-2 h-4 w-4" />
                    Load New Data
                </Button>
            </div>
          )}
        </header>

        {defects.length === 0 ? (
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
