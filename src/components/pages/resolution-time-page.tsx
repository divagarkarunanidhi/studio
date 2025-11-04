
'use client';

import { useState, useMemo } from 'react';
import type { Defect } from '@/lib/types';
import { differenceInHours, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '../dashboard/stat-card';
import { Timer, Hourglass, ChevronsRight } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '../ui/button';

interface ResolutionTimePageProps {
  defects: Defect[];
  uniqueDomains: string[];
}

const formatDuration = (hours: number): string => {
  if (hours < 24) {
    return `${hours.toFixed(1)} hours`;
  }
  const days = hours / 24;
  return `${days.toFixed(1)} days`;
};

export function ResolutionTimePage({ defects, uniqueDomains }: ResolutionTimePageProps) {
  const [filterDomain, setFilterDomain] = useState<string>('all');

  const filteredDefects = useMemo(() => {
    if (filterDomain === 'all') {
      return defects;
    }
    return defects.filter(defect => defect.domain === filterDomain);
  }, [defects, filterDomain]);

  const resolutionStats = useMemo(() => {
    const resolvedDefects = filteredDefects.filter(
      (d) =>
        d.status?.toLowerCase() === 'done' &&
        d.created_at &&
        d.updated
    );

    if (resolvedDefects.length === 0) {
      return {
        average: 0,
        min: 0,
        max: 0,
        count: 0,
      };
    }

    const resolutionTimes = resolvedDefects.map((d) => {
      try {
        const createdDate = parseISO(d.created_at);
        const updatedDate = parseISO(d.updated!);
        return differenceInHours(updatedDate, createdDate);
      } catch {
        return null;
      }
    }).filter((t): t is number => t !== null && t >= 0);

    if (resolutionTimes.length === 0) {
        return {
          average: 0,
          min: 0,
          max: 0,
          count: 0,
        };
      }

    const sum = resolutionTimes.reduce((acc, time) => acc + time, 0);
    const average = sum / resolutionTimes.length;
    const min = Math.min(...resolutionTimes);
    const max = Math.max(...resolutionTimes);

    return {
      average,
      min,
      max,
      count: resolvedDefects.length,
    };
  }, [filteredDefects]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Resolution Time Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            This analysis calculates the time taken to resolve defects based on their creation and last updated dates. Only defects with a status of "Done" are included.
          </p>
          <div className="flex items-center gap-4">
            <Select value={filterDomain} onValueChange={setFilterDomain}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Filter by Domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                {uniqueDomains.map(domain => (
                  <SelectItem key={domain} value={domain}>{domain}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setFilterDomain('all')} disabled={filterDomain === 'all'}>
                Clear Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {resolutionStats.count > 0 ? (
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Average Resolution Time"
            value={formatDuration(resolutionStats.average)}
            icon={<Timer />}
            description={`Based on ${resolutionStats.count} resolved defects`}
          />
          <StatCard
            title="Minimum Resolution Time"
            value={formatDuration(resolutionStats.min)}
            icon={<ChevronsRight />}
            description="The fastest defect resolution"
          />
          <StatCard
            title="Maximum Resolution Time"
            value={formatDuration(resolutionStats.max)}
            icon={<Hourglass />}
            description="The slowest defect resolution"
          />
        </div>
      ) : (
        <Alert>
          <Timer className="h-4 w-4" />
          <AlertTitle>No Resolved Defects Found</AlertTitle>
          <AlertDescription>
            To perform this analysis, please upload a CSV file that contains defects with a status of "Done" and includes valid `created` and `updated` dates.
            {filterDomain !== 'all' && ` For the selected domain: "${filterDomain}".`}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
