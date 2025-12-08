
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


type AugmentedDefect = Defect & { reasonForAttention?: string };

interface DefectsTableProps {
  defects: AugmentedDefect[];
  showAll?: boolean;
  showDescription?: boolean;
  isAttentionView?: boolean;
}

export function DefectsTable({ defects, showAll = false, showDescription = false, isAttentionView = false }: DefectsTableProps) {
  const [jiraLink, setJiraLink] = useState<string>("");
  const firestore = useFirestore();

  useEffect(() => {
    const fetchConfig = async () => {
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
