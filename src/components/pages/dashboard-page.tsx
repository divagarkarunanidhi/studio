
'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Defect, AppConfiguration } from '@/lib/types';
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
  LayoutDashboard,
  TestTube,
  FileHeart,
  Wand2,
  Timer,
  LineChart,
  PieChart,
  AlertTriangle,
  Upload,
  Server,
  LogOut,
  Users,
  Settings,
  Bookmark,
  Download,
  FileText,
  MonitorPlay,
  ClipboardCheck,
  Clipboard,
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu"
import { useToast } from '@/hooks/use-toast';
import { ClientTimestamp } from '../dashboard/client-timestamp';
import { useUser, useAuth, useFirestore } from '@/firebase';
import { signOut } from 'firebase/auth';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from "@/components/ui/alert-dialog"
import { UserManagementPage } from './user-management-page';
import type { UserProfile } from '@/app/page';
import { ConfigurationPage } from './configuration-page';
import { FeedbackManagementPage } from './feedback-management-page';
import * as XLSX from 'xlsx';
import { doc, getDoc } from 'firebase/firestore';
import { TestCaseSummaryPage } from './test-case-summary-page';
import { SeleniumDashboardPage } from './selenium-dashboard-page';


type View = 'dashboard' | 'all-defects' | 'analysis' | 'prediction' | 'resolution-time' | 'trend-analysis' | 'summary' | 'required-attention' | 'user-management' | 'configuration' | 'feedback-management' | 'test-case-summary' | 'selenium-dashboard';

const RECORDS_PER_PAGE = 50;

const parseCSV = (text: string): string[][] => {
    const result: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    // Normalize line endings
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    while (i < normalizedText.length) {
        const char = normalizedText[i];

        if (inQuotes) {
            if (char === '"') {
                // Check for escaped quote
                if (i + 1 < normalizedText.length && normalizedText[i + 1] === '"') {
                    currentField += '"';
                    i++; // Skip the second quote
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
                result.push(currentRow);
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

    // Add the last field and row if the text doesn't end with a newline
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        result.push(currentRow);
    }
    
    // Filter out completely empty rows
    return result.filter(row => row.some(field => field.trim() !== ''));
};


const parseDate = (dateString: string): Date | null => {
    if (!dateString) return null;
  
    // Attempt 1: Standard ISO format (and others recognized by new Date())
    let date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date;
    }
  
    // Attempt 2: Jira/Excel format 'DD/MMM/YY h:mm a' e.g., "30/May/24 5:20 PM"
    const jiraFormat = dateString.match(/(\d{1,2})\/(\w{3})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s+([AP]M)/i);
    if (jiraFormat) {
        const day = parseInt(jiraFormat[1], 10);
        const monthStr = jiraFormat[2];
        const yearPart = parseInt(jiraFormat[3], 10);
        const hourPart = parseInt(jiraFormat[4], 10);
        const minute = parseInt(jiraFormat[5], 10);
        const ampm = jiraFormat[6].toUpperCase();
        
        const year = yearPart < 100 ? 2000 + yearPart : yearPart;
        const monthMap: { [key: string]: number } = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
        const month = monthMap[monthStr.toUpperCase()];

        let hour = hourPart;
        if (ampm === 'PM' && hour < 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;
        
        date = new Date(Date.UTC(year, month, day, hour, minute));
        if (!isNaN(date.getTime())) {
            return date;
        }
    }

    // Attempt 3: Format 'M/D/YYYY H:mm' e.g., "5/30/2024 17:20"
    const simpleFormat = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (simpleFormat) {
        const month = parseInt(simpleFormat[1], 10) - 1;
        const day = parseInt(simpleFormat[2], 10);
        const year = parseInt(simpleFormat[3], 10);
        const hour = parseInt(simpleFormat[4], 10);
        const minute = parseInt(simpleFormat[5], 10);
        
        date = new Date(year, month, day, hour, minute);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    
     // Attempt 4: Format DD.MM.YYYY HH:mm:ss
    const dotFormat = dateString.match(/(\d{2})\.(\d{2})\.(\d{4})\s(\d{2}):(\d{2}):(\d{2})/);
    if (dotFormat) {
        const day = parseInt(dotFormat[1], 10);
        const month = parseInt(dotFormat[2], 10) - 1;
        const year = parseInt(dotFormat[3], 10);
        const hour = parseInt(dotFormat[4], 10);
        const minute = parseInt(dotFormat[5], 10);
        const second = parseInt(dotFormat[6], 10);
        date = new Date(year, month, day, hour, minute, second);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }


    // Final attempt with just the date part if time fails
    try {
        const dateOnly = dateString.split(' ')[0];
        date = new Date(dateOnly);
        if (!isNaN(date.getTime())) {
            return date;
        }
    } catch(e) {
        // ignore
    }

    console.warn(`Could not parse date: "${dateString}"`);
    return null; // Return null if all attempts fail
}

interface DashboardPageProps {
  userProfile: UserProfile;
}

export function DashboardPage({ userProfile }: DashboardPageProps) {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const userRole = userProfile?.role;
  
  const [defects, setDefects] = useState<Defect[]>([]);
  const [uploadTimestamp, setUploadTimestamp] = useState<string | null>(null);
  const [defectsLoading, setDefectsLoading] = useState(true);
  const [jiraLink, setJiraLink] = useState<string>('');

  const [activeView, setActiveView] = useState<View>('dashboard');
  
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [filterReportedBy, setFilterReportedBy] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAttention, setFilterAttention] = useState<string>('all');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [attentionCurrentPage, setAttentionCurrentPage] = useState(1);
  const { toast } = useToast();

  const [showUploader, setShowUploader] = useState(false);

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
  
  const handleLoadFromServer = useCallback(async () => {
    setDefectsLoading(true);
    try {
      const response = await fetch('/api/defects/latest');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to fetch data from server.');
      }
      const data = await response.json();
      if (data && data.defects) {
        setDefects(data.defects);
        setUploadTimestamp(data.uploadedAt);
        setShowUploader(false);
      } else {
        toast({ title: "No Data Found", description: "There is no data stored on the server. Please upload a file." });
        setDefects([]);
        setUploadTimestamp(null);
        setShowUploader(true); // Explicitly show uploader if no data
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error Loading Data', description: error.message });
      setShowUploader(true); // Also show uploader on error
      console.error(error);
    } finally {
      setDefectsLoading(false);
    }
  }, [toast]);
  
  useEffect(() => {
    handleLoadFromServer();
  }, [handleLoadFromServer]);


  const handleDataUploaded = useCallback(async (csvText: string) => {
    if (!user) {
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

        const originalHeaders = rows[0].map(h => h.trim());
        
        const lowerCaseHeaders = originalHeaders.map(h => h.toLowerCase());
        const hasIssueKey = lowerCaseHeaders.includes('issue key');
        const hasSummary = lowerCaseHeaders.includes('summary');
        const hasCreated = lowerCaseHeaders.includes('created');

        const missingHeaders = [];
        if (!hasIssueKey) missingHeaders.push('Issue key');
        if (!hasSummary) missingHeaders.push('Summary');
        if (!hasCreated) missingHeaders.push('Created');

        if (missingHeaders.length > 0) {
            throw new Error(`CSV must include headers: ${missingHeaders.join(', ')}.`);
        }
        
        const headerMap: { [key:string]: string } = {};
        const keyMap: { [key:string]: string } = { 
            'issue key': 'id',
            'created': 'created_at', 
            'reporter': 'reported_by', 
            'custom field (business domain)': 'domain',
        };

        originalHeaders.forEach(header => {
            const cleanHeader = header.toLowerCase().replace(/\s+/g, ' ').trim();
            const mappedKey = keyMap[cleanHeader];
            if (mappedKey) {
                headerMap[header] = mappedKey;
            } else {
                headerMap[header] = cleanHeader.replace(/[^a-z0-9]+/g, '_');
            }
        });


        const parsedDefects = rows.slice(1).map((values, rowIndex) => {
            let currentHeader = '';
            try {
                const defectObj: any = originalHeaders.reduce((obj, header, index) => {
                    currentHeader = header;
                    const mappedKey = headerMap[header];
                    let value = values[index] || '';

                    if (mappedKey === 'created_at' || mappedKey === 'updated') {
                        const parsedDate = parseDate(value);
                        if (!parsedDate && mappedKey === 'created_at') {
                            throw new Error(`Invalid or un-parseable date format in '${header}'.`);
                        }
                        value = parsedDate ? parsedDate.toISOString() : '';
                    }
                    
                    obj[mappedKey] = value;
                    return obj;
                }, {} as any);
                
                if (!defectObj.id || !defectObj.summary || !defectObj.created_at) return null;
                
                return defectObj;
            } catch (cellError: any) {
                console.error(`Error in row ${rowIndex + 2} at "${currentHeader}": ${cellError.message}`);
                throw new Error(`Parsing failed at row ${rowIndex + 2} for column "${currentHeader}": ${cellError.message}`);
            }
        }).filter((d): d is Defect => d !== null);

        if (parsedDefects.length === 0) throw new Error('No valid defect data found after parsing.');
        
        const response = await fetch('/api/defects/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                defects: parsedDefects,
                uploaderId: user.uid,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || 'Failed to upload data to the server.');
        }
        
        toast({ title: 'Success!', description: `${parsedDefects.length} records uploaded in a new file.` });
        await handleLoadFromServer(); // Reload data to show the new file
        setShowUploader(false);
    } catch (error: any) {
        console.error('Error during defect upload:', error);
        toast({
            variant: 'destructive',
            title: 'Error processing file',
            description: error.message || 'An unknown error occurred.',
        });
    }
  }, [user, toast, handleLoadFromServer]);

  const handleClearData = () => {
    setActiveView('dashboard');
    setShowUploader(true);
  };
  
  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleViewChange = (view: View) => {
    setActiveView(view);
    setShowUploader(false);
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
    'required-attention': 'Defects Requiring Attention',
    'user-management': 'User Management',
    configuration: 'Application Configuration',
    'feedback-management': 'Feedback Management',
    'test-case-summary': 'Test Case Summary',
    'selenium-dashboard': 'Selenium Dashboard',
  };
  
  const viewDescriptions: Record<View, string> = {
    dashboard: 'A summary of all defect data.',
    'all-defects': 'A complete list of all imported defects.',
    analysis: 'AI-powered analysis of the defect data.',
    prediction: 'Predict defect properties using an AI assistant.',
    'resolution-time': 'Analysis of the time taken to resolve defects.',
    'trend-analysis': 'Visualize the creation of defects over time.',
    summary: 'AI-powered summary of defect root cause and functional area.',
    'required-attention': 'Defects that are missing key information.',
    'user-management': 'View and manage all users in the system.',
    configuration: 'Manage global application settings and API keys.',
    'feedback-management': 'View, edit, and delete saved few-shot learning examples.',
    'test-case-summary': 'Upload and visualize test case data by label.',
    'selenium-dashboard': 'Visualize results from Selenium test runs.',
  };

  const uniqueDomains = useMemo(() => {
    const domains = new Set<string>();
    defects.forEach(defect => {
        if (defect.domain && defect.domain.trim() !== '') {
            domains.add(defect.domain.trim());
        }
    });
    const domainArray = Array.from(domains).sort();
    domainArray.unshift('N/A');
    return domainArray;
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
        const statuses = new Set<string>();
        defects.forEach(defect => {
            if (defect.status && defect.status.trim() !== '') {
                statuses.add(defect.status.trim());
            }
        });
        const statusArray = Array.from(statuses).sort();
        statusArray.unshift('N/A');
        return statusArray;
    }, [defects]);


  const filteredDefects = useMemo(() => {
    if (!defects) return [];
    return defects.filter(defect => {
        let domainMatch = true;
        if (filterDomain !== 'all') {
            if (filterDomain === 'N/A') {
                domainMatch = !defect.domain || defect.domain.trim() === '';
            } else {
                domainMatch = defect.domain === filterDomain;
            }
        }
        
        const reporterMatch = filterReportedBy === 'all' || defect.reported_by === filterReportedBy;
        
        let statusMatch = true;
        if (filterStatus !== 'all') {
            if (filterStatus === 'N/A') {
                statusMatch = !defect.status || defect.status.trim() === '';
            } else {
                statusMatch = defect.status === filterStatus;
            }
        }

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

        const isDomainBlank = !defect.domain || defect.domain.trim() === '';
        
        const bugCategory = (defect as any).custom_field_bug_category_ || '';
        const isBugCategoryBlank = !bugCategory || bugCategory.trim() === '';


        const missingInfo: string[] = [];
        if (isDomainBlank) {
          missingInfo.push("domain is missing");
        }
        if (isBugCategoryBlank) {
          missingInfo.push("Bug Category is missing");
        }
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
            missingInfo.push("Cucumber steps present");
        }
        
        if (missingInfo.length === 0) {
            return null;
        }
        
        return { ...defect, reasonForAttention: missingInfo.join(', ') };
      })
      .filter((d): d is Defect & { reasonForAttention: string } => d !== null);
  }, [defects]);
  
  const uniqueAttentionReasons = useMemo(() => {
    const reasons = new Set<string>();
    attentionDefects.forEach(d => {
        d.reasonForAttention.split(', ').forEach(reason => {
            if (reason) reasons.add(reason);
        });
    });
    return Array.from(reasons).sort();
  }, [attentionDefects]);

  const filteredAttentionDefects = useMemo(() => {
    if (filterAttention === 'all') {
        return attentionDefects;
    }
    return attentionDefects.filter(d => d.reasonForAttention.includes(filterAttention));
  }, [attentionDefects, filterAttention]);

  const totalPages = Math.ceil(filteredDefects.length / RECORDS_PER_PAGE);

  const paginatedDefects = useMemo(() => {
    const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
    const endIndex = startIndex + RECORDS_PER_PAGE;
    return filteredDefects.slice(startIndex, endIndex);
  }, [filteredDefects, currentPage]);

  const attentionTotalPages = Math.ceil(filteredAttentionDefects.length / RECORDS_PER_PAGE);

  const paginatedAttentionDefects = useMemo(() => {
    const startIndex = (attentionCurrentPage - 1) * RECORDS_PER_PAGE;
    const endIndex = startIndex + RECORDS_PER_PAGE;
    return filteredAttentionDefects.slice(startIndex, endIndex);
  }, [filteredAttentionDefects, attentionCurrentPage]);

  const handleExport = () => {
    const dataToExport = filteredAttentionDefects;
    if (dataToExport.length === 0) {
        toast({
            variant: 'destructive',
            title: 'No Data to Export',
            description: 'There are no defects to export in the "Required Attention" list.',
        });
        return;
    }

    const worksheetData = dataToExport.map(d => ({
      'Defect ID': { t: 's', v: d.id, l: { Target: `${jiraLink}/browse/${d.id}`, Tooltip: `View ${d.id} in JIRA` } },
      'Summary': d.summary,
      'Description': d.description || '',
      'Domain': d.domain || 'N/A',
      'Reported By': d.reported_by || 'N/A',
      'Status': d.status || 'N/A',
      'Reason for Attention': d.reasonForAttention
  }));

  const worksheet = XLSX.utils.json_to_sheet(worksheetData);
  
  worksheet['!cols'] = [
      { wch: 15 }, // Defect ID
      { wch: 50 }, // Summary
      { wch: 60 }, // Description
      { wch: 20 }, // Domain
      { wch: 20 }, // Reported By
      { wch: 15 }, // Status
      { wch: 50 }, // Reason for Attention
  ];

  XLSX.utils.sheet_add_aoa(worksheet, [Object.keys(worksheetData[0])], { origin: 'A1' });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Defects');
  XLSX.writeFile(workbook, 'defects_requiring_attention.xlsx');
  };


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
  
  const displayUploader = showUploader && activeView === 'dashboard';

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
              <SidebarMenuButton tooltip="Dashboard" isActive={activeView === 'dashboard'} onClick={() => handleViewChange('dashboard')}>
                <LayoutDashboard />
                Dashboard
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Trend Analysis" isActive={activeView === 'trend-analysis'} onClick={() => handleViewChange('trend-analysis')}>
                <LineChart />
                Trend Analysis
              </SidebarMenuButton>
            </SidebarMenuItem>
             <SidebarMenuItem>
              <SidebarMenuButton tooltip="Defect Summary" isActive={activeView === 'summary'} onClick={() => handleViewChange('summary')}>
                <PieChart />
                Defect Summary
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Test Case Summary" isActive={activeView === 'test-case-summary'} onClick={() => handleViewChange('test-case-summary')}>
                <FileText />
                Test Case Summary
              </SidebarMenuButton>
            </SidebarMenuItem>
             <SidebarMenuItem>
              <SidebarMenuButton tooltip="Selenium Dashboard" isActive={activeView === 'selenium-dashboard'} onClick={() => handleViewChange('selenium-dashboard')}>
                <MonitorPlay />
                Selenium Dashboard
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Defect Analysis" isActive={activeView === 'analysis'} onClick={() => handleViewChange('analysis')}>
                <FileHeart />
                Static Analysis
              </SidebarMenuButton>
            </SidebarMenuItem>
             <SidebarMenuItem>
              <SidebarMenuButton tooltip="Defect Prediction" isActive={activeView === 'prediction'} onClick={() => handleViewChange('prediction')}>
                <Wand2 />
                Defect Prediction
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Feedback Management" isActive={activeView === 'feedback-management'} onClick={() => handleViewChange('feedback-management')}>
                <Bookmark />
                Feedback Management
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Resolution Time" isActive={activeView === 'resolution-time'} onClick={() => handleViewChange('resolution-time')}>
                <Timer />
                Resolution Time
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="All Defects" isActive={activeView === 'all-defects'} onClick={() => handleViewChange('all-defects')}>
                <Bug />
                All Defects
              </SidebarMenuButton>
            </SidebarMenuItem>
            {(userRole === 'admin' || userRole === 'taas') && (
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Required Attention" isActive={activeView === 'required-attention'} onClick={() => handleViewChange('required-attention')}>
                  <AlertTriangle />
                  Required Attention
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {userRole === 'admin' && (
              <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Configuration" isActive={activeView === 'configuration'} onClick={() => handleViewChange('configuration')}>
                  <Settings />
                  Configuration
                  </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {userRole === 'admin' && (
                <SidebarMenuItem>
                    <SidebarMenuButton tooltip="User Management" isActive={activeView === 'user-management'} onClick={() => handleViewChange('user-management')}>
                    <Users />
                    User Management
                    </SidebarMenuButton>
                </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
           <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton onClick={handleLogout} tooltip="Log Out">
                    <LogOut/>
                    Log Out
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
                <h1 className="text-xl font-semibold tracking-tight">
                    {activeView === 'dashboard' && userProfile?.username ? `Welcome, ${userProfile.username}!` : viewTitles[activeView]}
                </h1>
                <p className="text-sm text-muted-foreground">{viewDescriptions[activeView]}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
              {activeView === 'dashboard' && uploadTimestamp && <ClientTimestamp timestamp={uploadTimestamp} />}
              {userRole === 'admin' && activeView === 'dashboard' && (
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="outline">
                            <Upload className="mr-2 h-4 w-4" />
                            Upload New Data
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Ready to upload a new file?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will take you to the file uploader. Uploading a new file will create a new record on the server.
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleClearData}>Continue</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
              )}
               {userRole === 'admin' && activeView === 'test-case-summary' && (
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="outline">
                            <Upload className="mr-2 h-4 w-4" />
                            Upload New Data
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Upload a new test case file?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will clear the current test case data and allow you to upload a new file.
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => setActiveView('test-case-summary')}>Continue</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
              )}
          </div>
        </header>

        {displayUploader ? (
          <main className="flex flex-1 flex-col items-center justify-center p-4">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="rounded-lg bg-card p-6 shadow-sm">
                <h2 className="text-2xl font-bold">Upload Data</h2>
                <p className="mt-2 text-muted-foreground">
                  To get started, please upload a CSV file.
                </p>
              </div>
              <div className="flex w-full max-w-lg flex-col items-stretch justify-center gap-4">
                {userRole === 'admin' ? (
                    <FileUploader onDataUploaded={(csvText) => handleDataUploaded(csvText)} />
                ) : (
                    <p className="text-destructive">You do not have permission to upload data.</p>
                )}
              </div>
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

            {activeView === 'test-case-summary' && (
              <TestCaseSummaryPage />
            )}
            {activeView === 'selenium-dashboard' && (
              <SeleniumDashboardPage />
            )}
            
            {activeView === 'analysis' && (
              <AnalysisPage defects={defects} uniqueDomains={uniqueDomains} />
            )}

            {activeView === 'prediction' && (
              <PredictionPage defects={defects} uniqueDomains={uniqueDomains} />
            )}

             {activeView === 'feedback-management' && (
              <FeedbackManagementPage />
            )}

            {activeView === 'resolution-time' && (
              <ResolutionTimePage defects={defects} uniqueDomains={uniqueDomains} />
            )}

            {activeView === 'user-management' && userRole === 'admin' && (
              <UserManagementPage />
            )}
             {activeView === 'configuration' && userRole === 'admin' && (
              <ConfigurationPage />
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
                                <CardTitle>{viewTitles['required-attention']} ({filteredAttentionDefects.length})</CardTitle>
                                <CardDescription>
                                    These defects are missing key information that could improve analysis.
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Select value={filterAttention} onValueChange={setFilterAttention}>
                                    <SelectTrigger className="w-[240px]">
                                        <SelectValue placeholder="Filter by Reason" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Reasons</SelectItem>
                                        {uniqueAttentionReasons.map(reason => (
                                        <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button variant="outline" onClick={handleExport}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Export
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <DefectsTable defects={paginatedAttentionDefects} showAll showDescription={true} isAttentionView={true} />
                        <div className="mt-4 flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                                Showing {paginatedAttentionDefects.length > 0 ? (attentionCurrentPage - 1) * RECORDS_PER_PAGE + 1 : 0}-
                                {Math.min(attentionCurrentPage * RECORDS_PER_PAGE, filteredAttentionDefects.length)} of {filteredAttentionDefects.length} defects
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setAttentionCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={attentionCurrentPage === 1}
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setAttentionCurrentPage(prev => Math.min(prev + 1, attentionTotalPages))}
                                    disabled={attentionCurrentPage === attentionTotalPages || attentionTotalPages === 0}
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
