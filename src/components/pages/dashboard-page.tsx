
"use client";

import { useState, useMemo } from 'react';
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
  Network,
  Users,
  Wand2,
} from 'lucide-react';
import { FileUploader } from '../dashboard/file-uploader';
import { StatCard } from '../dashboard/stat-card';
import { GroupedDefectsChart } from '../dashboard/grouped-defects-chart';
import { DefectsTable } from '../dashboard/defects-table';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { isSameDay, subDays, parseISO } from 'date-fns';
import { GroupedDefectsView } from '../dashboard/grouped-defects-view';
import { AIAssistantPage } from './ai-assistant-page';


type View = 'dashboard' | 'all-defects' | 'by-domain' | 'by-user' | 'ai-assistant';

export function DashboardPage() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [activeView, setActiveView] = useState<View>('dashboard');

  const handleDataUploaded = (data: Defect[]) => {
    // Basic validation and date parsing
    const parsedData = data.map(d => ({
        ...d,
        created_at: d.created_at ? new Date(d.created_at).toISOString() : new Date().toISOString()
    })).filter(d => d.id && d.summary && d.created_at);
    setDefects(parsedData);
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
    'by-domain': 'Defects by Domain',
    'by-user': 'Defects by Reporter',
    'ai-assistant': 'AI Assistant',
  }
  
  const viewDescriptions: Record<View, string> = {
    dashboard: 'A summary of all defect data.',
    'all-defects': 'A complete list of all imported defects.',
    'by-domain': 'Defects grouped by their application domain.',
    'by-user': 'Defects grouped by the user who reported them.',
    'ai-assistant': 'AI-powered predictions and chat for your defects.',
  }


  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2">
            <Logo className="size-8 text-primary" />
            <h1 className="text-lg font-semibold">Defect Insights</h1>
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
              <SidebarMenuButton tooltip="Defects" isActive={activeView === 'all-defects'} onClick={() => setActiveView('all-defects')}>
                <Bug />
                All Defects
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="By Domain" isActive={activeView === 'by-domain'} onClick={() => setActiveView('by-domain')}>
                <Network />
                By Domain
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="By User" isActive={activeView === 'by-user'} onClick={() => setActiveView('by-user')}>
                <Users />
                By Reporter
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="AI Assistant" isActive={activeView === 'ai-assistant'} onClick={() => setActiveView('ai-assistant')}>
                <Wand2 />
                AI Assistant
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
            <FileUploader onDataUploaded={handleDataUploaded} />
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

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                  <Card className="col-span-1 lg:col-span-5">
                     <GroupedDefectsChart defects={defects} />
                  </Card>
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

            {activeView === 'all-defects' && (
               <Card>
                <CardHeader>
                  <CardTitle>{viewTitles['all-defects']}</CardTitle>
                  <CardDescription>{viewDescriptions['all-defects']}</CardDescription>
                </CardHeader>
                <CardContent>
                  <DefectsTable defects={defects} showAll />
                </CardContent>
              </Card>
            )}

            {activeView === 'by-domain' && (
              <GroupedDefectsView defects={defects} groupKey="domain" />
            )}

            {activeView === 'by-user' && (
              <GroupedDefectsView defects={defects} groupKey="reported_by" />
            )}

            {activeView === 'ai-assistant' && (
              <AIAssistantPage defects={defects} />
            )}

          </main>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
