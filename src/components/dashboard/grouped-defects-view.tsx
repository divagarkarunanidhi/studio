"use client";

import { useMemo } from 'react';
import type { Defect } from '@/lib/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { DefectsTable } from './defects-table';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';

interface GroupedDefectsViewProps {
  defects: Defect[];
  groupKey: keyof Defect;
}

export function GroupedDefectsView({ defects, groupKey }: GroupedDefectsViewProps) {

  const groupedData = useMemo(() => {
    const groups = defects.reduce((acc, defect) => {
      const key = (defect[groupKey] as string)?.trim() || 'Unassigned';
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(defect);
      return acc;
    }, {} as { [key: string]: Defect[] });

    return Object.entries(groups).sort((a,b) => b[1].length - a[1].length);

  }, [defects, groupKey]);

  return (
    <Card>
      <CardContent className="pt-6">
        <Accordion type="single" collapsible className="w-full">
          {groupedData.map(([groupName, groupDefects]) => (
            <AccordionItem value={groupName} key={groupName}>
              <AccordionTrigger>
                <div className="flex items-center gap-4">
                    <span className="font-semibold">{groupName}</span>
                    <Badge variant="secondary">{groupDefects.length} defects</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <DefectsTable defects={groupDefects} showAll />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
