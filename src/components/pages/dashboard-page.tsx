
"use client";

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
import Image from 'next/image';

type View = 'dashboard' | 'all-defects' | 'analysis' | 'prediction' | 'resolution-time' | 'trend-analysis' | 'summary';

const RECORDS_PER_PAGE = 50;

export function DashboardPage() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [activeView, setActiveView] = useState<View>('dashboard');
  
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [filterReportedBy, setFilterReportedBy] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  const [currentPage, setCurrentPage] = useState(1);


  const handleDataUploaded = (data: Defect[]) => {
    setDefects(data);
    setActiveView('dashboard');
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
    summary: 'Defect Summary'
  };
  
  const viewDescriptions: Record<View, string> = {
    dashboard: 'A summary of all defect data.',
    'all-defects': 'A complete list of all imported defects.',
    analysis: 'AI-powered analysis of the defect data.',
    prediction: 'Predict defect properties using an AI assistant.',
    'resolution-time': 'Analysis of the time taken to resolve defects.',
    'trend-analysis': 'Visualize the creation of defects over time.',
    summary: 'AI-powered summary of defect root cause and functional area.'
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
  
  useEffect(() => {
    setCurrentPage(1);
    // Reset filters when new data is uploaded
    setFilterDomain('all');
    setFilterReportedBy('all');
    setFilterStatus('all');
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
        <header className="sticky top-0 z-10 flex h-auto min-h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur-sm sm:h-auto sm:px-6">
          <SidebarTrigger className="sm:hidden"/>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{viewTitles[activeView]}</h1>
            <p className="text-sm text-muted-foreground">{viewDescriptions[activeView]}</p>
          </div>
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

          </main>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

    