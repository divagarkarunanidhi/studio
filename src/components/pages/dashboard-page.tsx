
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
  Bug,
  CalendarClock,
  Github,
  LayoutDashboard,
  TestTube,
  FileHeart,
  Wand2,
  Timer,
  LineChart,
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
import { Button } from '../ui/button';
import { MultiSelect, type MultiSelectOption } from '../ui/multi-select';

type View = 'dashboard' | 'all-defects' | 'analysis' | 'prediction' | 'resolution-time' | 'trend-analysis';

const RECORDS_PER_PAGE = 50;

export function DashboardPage() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [activeView, setActiveView] = useState<View>('dashboard');
  
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedReporters, setSelectedReporters] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  
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
  };
  
  const viewDescriptions: Record<View, string> = {
    dashboard: 'A summary of all defect data.',
    'all-defects': 'A complete list of all imported defects.',
    analysis: 'AI-powered analysis of the defect data.',
    prediction: 'Predict defect properties using an AI assistant.',
    'resolution-time': 'Analysis of the time taken to resolve defects.',
    'trend-analysis': 'Visualize the creation of defects over time.',
  };

  const {
    uniqueDomains,
    uniqueReporters,
    uniqueStatuses,
    uniqueSeverities,
    uniquePriorities,
  } = useMemo(() => {
    const domains = new Set<string>();
    const reporters = new Set<string>();
    const statuses = new Set<string>();
    const severities = new Set<string>();
    const priorities = new Set<string>();
    
    defects.forEach(defect => {
      if (defect.domain) domains.add(defect.domain);
      if (defect.reported_by) reporters.add(defect.reported_by);
      if (defect.status) statuses.add(defect.status);
      if (defect.severity) severities.add(defect.severity);
      if (defect.priority) priorities.add(defect.priority);
    });

    const toOptions = (items: Set<string>): MultiSelectOption[] => Array.from(items).filter(Boolean).sort().map(item => ({ value: item, label: item }));

    return {
      uniqueDomains: toOptions(domains),
      uniqueReporters: toOptions(reporters),
      uniqueStatuses: toOptions(statuses),
      uniqueSeverities: toOptions(severities),
      uniquePriorities: toOptions(priorities),
    };
  }, [defects]);

  const filteredDefects = useMemo(() => {
    return defects.filter(defect => {
      const domainMatch = selectedDomains.length === 0 || (defect.domain && selectedDomains.includes(defect.domain));
      const reporterMatch = selectedReporters.length === 0 || (defect.reported_by && selectedReporters.includes(defect.reported_by));
      const statusMatch = selectedStatuses.length === 0 || (defect.status && selectedStatuses.includes(defect.status));
      const severityMatch = selectedSeverities.length === 0 || (defect.severity && selectedSeverities.includes(defect.severity));
      const priorityMatch = selectedPriorities.length === 0 || (defect.priority && selectedPriorities.includes(defect.priority));
      return domainMatch && reporterMatch && statusMatch && severityMatch && priorityMatch;
    });
  }, [defects, selectedDomains, selectedReporters, selectedStatuses, selectedSeverities, selectedPriorities]);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredDefects]);


  const totalPages = Math.ceil(filteredDefects.length / RECORDS_PER_PAGE);

  const paginatedDefects = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    const endIndex = startIndex + RECORDS_PER_PAGE;
    return filteredDefects.slice(startIndex, endIndex);
  }, [filteredDefects, currentPage]);


  const clearFilters = () => {
    setSelectedDomains([]);
    setSelectedReporters([]);
    setSelectedStatuses([]);
    setSelectedSeverities([]);
    setSelectedPriorities([]);
  };

  const areFiltersActive = useMemo(() => {
    return selectedDomains.length > 0 || selectedReporters.length > 0 || selectedStatuses.length > 0 || selectedSeverities.length > 0 || selectedPriorities.length > 0;
  }, [selectedDomains, selectedReporters, selectedStatuses, selectedSeverities, selectedPriorities]);


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
              <SidebarMenuButton tooltip="Trend Analysis" isActive={activeView === 'trend-analysis'} onClick={() => setActiveView('trend-analysis')}>
                <LineChart />
                Trend Analysis
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

            {activeView === 'analysis' && (
              <AnalysisPage defects={defects} uniqueDomains={uniqueDomains.map(d => d.value)} />
            )}

            {activeView === 'prediction' && (
              <PredictionPage defects={defects} uniqueDomains={uniqueDomains.map(d => d.value)} />
            )}

            {activeView === 'resolution-time' && (
              <ResolutionTimePage defects={defects} uniqueDomains={uniqueDomains.map(d => d.value)} />
            )}

            {activeView === 'all-defects' && (
               <Card>
                <CardHeader>
                  <CardTitle>{viewTitles['all-defects']}</CardTitle>
                  <CardDescription>{viewDescriptions['all-defects']}</CardDescription>
                </CardHeader>
                <CardContent>
                   <div className="mb-4 p-4 border rounded-lg bg-card">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                          <MultiSelect
                              options={uniqueDomains}
                              selected={selectedDomains}
                              onChange={setSelectedDomains}
                              placeholder="Filter by Domain..."
                          />
                          <MultiSelect
                              options={uniqueReporters}
                              selected={selectedReporters}
                              onChange={setSelectedReporters}
                              placeholder="Filter by Reporter..."
                          />
                          <MultiSelect
                              options={uniqueStatuses}
                              selected={selectedStatuses}
                              onChange={setSelectedStatuses}
                              placeholder="Filter by Status..."
                          />
                          <MultiSelect
                              options={uniqueSeverities}
                              selected={selectedSeverities}
                              onChange={setSelectedSeverities}
                              placeholder="Filter by Severity..."
                          />
                          <MultiSelect
                              options={uniquePriorities}
                              selected={selectedPriorities}
                              onChange={setSelectedPriorities}
                              placeholder="Filter by Priority..."
                          />
                      </div>
                      {areFiltersActive && (
                        <div className="mt-4 flex justify-end">
                            <Button variant="ghost" onClick={clearFilters}>Clear All Filters</Button>
                        </div>
                      )}
                  </div>
                  <DefectsTable defects={paginatedDefects} showAll />
                   <div className="mt-4 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                            Page {currentPage} of {totalPages}
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
                                disabled={currentPage === totalPages}
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
