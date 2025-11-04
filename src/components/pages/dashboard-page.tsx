
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
import { Logo } from '@/components/icons';
import {
  AlertTriangle,
  Bug,
  CalendarClock,
  Github,
  LayoutDashboard,
  TestTube,
  FileHeart,
  Wand2,
  Timer,
} from 'lucide-react';
import { FileUploader } from '../dashboard/file-uploader';
import { StatCard } from '../dashboard/stat-card';
import { DefectsTable } from '../dashboard/defects-table';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { isSameDay, subDays, parseISO } from 'date-fns';
import { AnalysisPage } from './analysis-page';
import { PredictionPage } from './prediction-page';
import { ResolutionTimePage } from './resolution-time-page';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { DefectTrendChart } from '../dashboard/defect-trend-chart';


type View = 'dashboard' | 'all-defects' | 'analysis' | 'prediction' | 'resolution-time';

export function DashboardPage() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [activeView, setActiveView] = useState<View>('dashboard');
  
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [filterReportedBy, setFilterReportedBy] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');

  const handleDataUploaded = (data: Defect[]) => {
    // Basic validation and date parsing
    const parsedData = data.map(d => ({
        ...d,
        created_at: d.created_at ? new Date(d.created_at).toISOString() : new Date().toISOString(),
        updated: d.updated ? new Date(d.updated).toISOString() : new Date().toISOString(),
    })).filter(d => d.id && d.summary && d.created_at);
    setDefects(parsedData);
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
  
  const highSeverityCount = useMemo(() => {
    if (defects.length === 0) return 0;
    return defects.filter(
      defect => defect.severity && (defect.severity.toLowerCase() === 'high' || defect.severity.toLowerCase() === 'critical')
    ).length;
  }, [defects]);

  const totalDefects = useMemo(() => defects.length, [defects]);

  const viewTitles: Record<View, string> = {
    dashboard: 'Dashboard',
    'all-defects': 'All Defects',
    analysis: 'Static Defect Analysis',
    prediction: 'Defect Prediction',
    'resolution-time': 'Resolution Time Analysis'
  };
  
  const viewDescriptions: Record<View, string> = {
    dashboard: 'A summary of all defect data.',
    'all-defects': 'A complete list of all imported defects.',
    analysis: 'AI-powered analysis of the defect data.',
    prediction: 'Predict defect properties using an AI assistant.',
    'resolution-time': 'Analysis of the time taken to resolve defects.'
  };

  const {
    uniqueDomains,
    uniqueReportedBy,
    uniqueStatuses,
    uniquePriorities,
  } = useMemo(() => {
    const domains = new Set<string>();
    const reporters = new Set<string>();
    const statuses = new Set<string>();
    const priorities = new Set<string>();

    defects.forEach(defect => {
      if (defect.domain) domains.add(defect.domain);
      if (defect.reported_by) reporters.add(defect.reported_by);
      if (defect.status) statuses.add(defect.status);
      if (defect.priority) priorities.add(defect.priority);
    });

    return {
      uniqueDomains: Array.from(domains).sort(),
      uniqueReportedBy: Array.from(reporters).sort(),
      uniqueStatuses: Array.from(statuses).sort(),
      uniquePriorities: Array.from(priorities).sort(),
    };
  }, [defects]);

  const filteredDefects = useMemo(() => {
    return defects.filter(defect => {
      const domainMatch = filterDomain === 'all' || defect.domain === filterDomain;
      const reportedByMatch = filterReportedBy === 'all' || defect.reported_by === filterReportedBy;
      const statusMatch = filterStatus === 'all' || defect.status === filterStatus;
      const priorityMatch = filterPriority === 'all' || defect.priority === filterPriority;
      return domainMatch && reportedByMatch && statusMatch && priorityMatch;
    });
  }, [defects, filterDomain, filterReportedBy, filterStatus, filterPriority]);

  const clearFilters = () => {
    setFilterDomain('all');
    setFilterReportedBy('all');
    setFilterStatus('all');
    setFilterPriority('all');
  };

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2">
            <Logo className="size-8 text-primary" />
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
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <StatCard title="Total Defects" value={totalDefects} icon={<Bug />} />
                  <StatCard title="Created Yesterday" value={yesterdayDefectsCount} icon={<CalendarClock />} />
                  <StatCard title="Ready for Testing" value={readyForTestingCount} icon={<TestTube />} />
                  <StatCard title="High Severity" value={highSeverityCount} icon={<AlertTriangle />} />
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                    <DefectTrendChart defects={defects} />
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

            {activeView === 'analysis' && (
              <AnalysisPage defects={defects} />
            )}

            {activeView === 'prediction' && (
              <PredictionPage defects={defects} />
            )}

            {activeView === 'resolution-time' && (
              <ResolutionTimePage defects={defects} uniqueDomains={uniqueDomains} />
            )}

            {activeView === 'all-defects' && (
               <Card>
                <CardHeader>
                  <CardTitle>{viewTitles['all-defects']}</CardTitle>
                  <CardDescription>{viewDescriptions['all-defects']}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex flex-wrap items-center gap-4">
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
                        {uniqueReportedBy.map(reporter => (
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
                    <Select value={filterPriority} onValueChange={setFilterPriority}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by Priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Priorities</SelectItem>
                        {uniquePriorities.map(priority => (
                          <SelectItem key={priority} value={priority}>{priority}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
                  </div>
                  <DefectsTable defects={filteredDefects} showAll />
                </CardContent>
              </Card>
            )}

          </main>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
