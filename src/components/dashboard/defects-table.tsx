
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Defect } from '@/lib/types';
import { cn } from '@/lib/utils';
import { differenceInDays, parseISO, format } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


type AugmentedDefect = Defect & { reasonForAttention?: string };

interface DefectsTableProps {
  defects: AugmentedDefect[];
  showAll?: boolean;
  showDescription?: boolean;
}

export function DefectsTable({ defects, showAll = false, showDescription = false }: DefectsTableProps) {
  const sortedDefects = [...defects].sort((a, b) => {
    try {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    } catch {
      return 0;
    }
  });

  const defectsToShow = showAll ? sortedDefects : sortedDefects.slice(0, 10);
  const showReasonColumn = defectsToShow.some(d => d.reasonForAttention);


  return (
    <div className="w-full overflow-hidden rounded-md border">
      <TooltipProvider>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Defect ID</TableHead>
              <TableHead>Summary</TableHead>
              {showDescription && <TableHead>Description</TableHead>}
              {showReasonColumn && <TableHead>Reason for Attention</TableHead>}
              <TableHead>Domain</TableHead>
              <TableHead>Reported By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="text-right">Created Date</TableHead>
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
                      href={`https://dhl2.atlassian.net/browse/${defect.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {defect.id}
                    </a>
                  </TableCell>
                  <TableCell className="font-medium max-w-xs truncate">
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
                    <TableCell className="text-xs text-muted-foreground max-w-sm truncate">
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
                    <TableCell className="text-xs text-destructive max-w-sm">
                      {defect.reasonForAttention}
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant="outline">{defect.domain || 'N/A'}</Badge>
                  </TableCell>
                  <TableCell>{defect.reported_by || 'N/A'}</TableCell>
                  <TableCell>{defect.status || 'N/A'}</TableCell>
                  <TableCell>{defect.severity || 'N/A'}</TableCell>
                  <TableCell>{defect.priority || 'N/A'}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {defect.created_at ? format(parseISO(defect.created_at), 'MMM d, yyyy') : 'Invalid Date'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TooltipProvider>
    </div>
  );
}
