
'use client';

import { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Defect, AppConfiguration } from '@/lib/types';
import { cn } from '@/lib/utils';
import { differenceInDays, parseISO, format } from 'date-fns';
import { doc, getDoc } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Search, Filter, X, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface DefectFilters {
  domain: string;
  reported_by: string;
  status: string;
  reason: string;
}

type AugmentedDefect = Defect & { reasonForAttention?: string };

interface DefectsTableProps {
  defects: AugmentedDefect[];
  showAll?: boolean;
  showDescription?: boolean;
  isAttentionView?: boolean;
  // Filtering props
  filters?: DefectFilters;
  onFilterChange?: (filters: DefectFilters) => void;
  uniqueValues?: {
    domains: string[];
    statuses: string[];
    reporters: string[];
    reasons: string[];
  };
}

export function DefectsTable({ 
  defects, 
  showAll = false, 
  showDescription = false, 
  isAttentionView = false,
  filters,
  onFilterChange,
  uniqueValues
}: DefectsTableProps) {
  const [jiraLink, setJiraLink] = useState<string>("");
  const firestore = useFirestore();

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
  
  const sortedDefects = [...defects].sort((a, b) => {
    try {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    } catch {
      return 0;
    }
  });

  const defectsToShow = showAll ? sortedDefects : sortedDefects.slice(0, 10);
  const showReasonColumn = defectsToShow.some(d => d.reasonForAttention);

  const handleUpdateFilter = (key: keyof DefectFilters, value: string) => {
    if (onFilterChange && filters) {
      onFilterChange({ ...filters, [key]: value });
    }
  };

  const clearFilter = (key: keyof DefectFilters) => {
    handleUpdateFilter(key, '');
  };

  const FilterHeader = ({ label, filterKey, type = 'text', options = [] }: { label: string, filterKey: keyof DefectFilters, type?: 'text' | 'select', options?: string[] }) => {
    if (!filters || !onFilterChange) return <span>{label}</span>;

    const isActive = filters[filterKey] !== '' && filters[filterKey] !== 'all';

    return (
      <div className="flex items-center gap-1 group">
        <span>{label}</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className={cn("h-6 w-6 p-0 opacity-50 group-hover:opacity-100", isActive && "text-primary opacity-100")}
            >
              {type === 'text' ? <Search className="h-3 w-3" /> : <Filter className="h-3 w-3" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-3" align="start">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Filter {label}</h4>
                {isActive && (
                  <Button variant="ghost" size="sm" onClick={() => clearFilter(filterKey)} className="h-auto p-0 text-xs text-muted-foreground hover:text-destructive">
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                )}
              </div>
              {type === 'text' ? (
                <Input
                  placeholder={`Search ${label}...`}
                  value={filters[filterKey]}
                  onChange={(e) => handleUpdateFilter(filterKey, e.target.value)}
                  className="h-8 text-xs"
                />
              ) : (
                <Select value={filters[filterKey] || 'all'} onValueChange={(val) => handleUpdateFilter(filterKey, val === 'all' ? '' : val)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={`Select ${label}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All {label}s</SelectItem>
                    {options.map(opt => (
                      <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  };

  return (
    <div className="w-full overflow-hidden rounded-md border">
      <TooltipProvider>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Defect ID</TableHead>
              <TableHead>Summary</TableHead>
              {showDescription && (
                <TableHead>Description</TableHead>
              )}
              {showReasonColumn && (
                <TableHead>
                  <FilterHeader 
                    label="Reason for Attention" 
                    filterKey="reason" 
                    type="select" 
                    options={uniqueValues?.reasons || []} 
                  />
                </TableHead>
              )}
              <TableHead>
                <FilterHeader 
                  label="Domain" 
                  filterKey="domain" 
                  type="select" 
                  options={uniqueValues?.domains || []} 
                />
              </TableHead>
              <TableHead>
                <FilterHeader label="Reported By" filterKey="reported_by" />
              </TableHead>
              <TableHead>
                <FilterHeader 
                  label="Status" 
                  filterKey="status" 
                  type="select" 
                  options={uniqueValues?.statuses || []} 
                />
              </TableHead>
              {!isAttentionView && <TableHead>Severity</TableHead>}
              {!isAttentionView && <TableHead>Priority</TableHead>}
              {!isAttentionView && <TableHead className="text-right">Created Date</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {defectsToShow.map((defect) => {
              let isUrgent = false;
              try {
                const isOld = differenceInDays(new Date(), parseISO(defect.created_at)) > 7;
                const isTodo = defect.status && defect.status.toLowerCase() === 'to-do';
                isUrgent = isOld && isTodo;
              } catch (error) {
                // Ignore date parsing errors
              }

              return (
                <TableRow key={defect.id} className={cn(isUrgent && 'bg-destructive/10')}>
                  <TableCell className="font-medium">
                    <a
                      href={`${jiraLink}/browse/${defect.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {defect.id}
                    </a>
                  </TableCell>
                  <TableCell className={cn("font-medium truncate", isAttentionView ? "max-w-[150px]" : "max-w-xs")}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn(isUrgent && 'text-destructive font-semibold')}>{defect.summary}</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md max-h-96 overflow-y-auto">
                        <p className="whitespace-pre-wrap">{defect.summary}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  {showDescription && (
                    <TableCell className={cn("text-xs text-muted-foreground truncate", isAttentionView ? "max-w-[200px]" : "max-w-sm")}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>{defect.description || 'null'}</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md max-h-96 overflow-y-auto">
                          <p className="whitespace-pre-wrap">{defect.description || 'null'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                  )}
                  {showReasonColumn && (
                    <TableCell className="text-xs text-destructive whitespace-pre-wrap max-w-lg">
                      {defect.reasonForAttention?.split(', ').join('\n')}
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant="outline">{defect.domain || 'N/A'}</Badge>
                  </TableCell>
                  <TableCell className={cn(isAttentionView ? "max-w-[100px] truncate" : "")}>{defect.reported_by || 'N/A'}</TableCell>
                  <TableCell>{defect.status || 'N/A'}</TableCell>
                  {!isAttentionView && <TableCell>{defect.severity || 'N/A'}</TableCell>}
                  {!isAttentionView && <TableCell>{defect.priority || 'N/A'}</TableCell>}
                  {!isAttentionView && (
                    <TableCell className="text-right text-muted-foreground">
                      {defect.created_at ? format(parseISO(defect.created_at), 'MMM d, yyyy') : 'Invalid Date'}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TooltipProvider>
    </div>
  );
}
