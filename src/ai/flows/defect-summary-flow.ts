
'use server';
/**
 * @fileOverview An AI flow to summarize defects into categories for visualization.
 */

import { ai } from '@/ai/genkit';
import {
  DefectSchema,
  DefectSummaryInputSchema,
  DefectSummaryOutputSchema,
  type DefectSummaryOutput,
  type Defect,
} from '@/lib/types';
import { z } from 'zod';

const SingleDefectSummarySchema = z.object({
    rootCause: z.string().describe("A short, one or two-word category for the defect's root cause (e.g., 'Data Integrity', 'Configuration', 'UI/UX', 'Performance', 'Security')."),
    functionalArea: z.string().describe("A short, one or two-word category for the functional area affected (e.g., 'User Auth', 'Billing', 'Search', 'Reporting', 'Checkout').")
});

export async function summarizeDefects(
  input: { defects: Defect[] }
): Promise<DefectSummaryOutput> {
  return defectSummaryFlow(input);
}

const summaryPrompt = ai.definePrompt({
  name: 'defectSummaryPrompt',
  input: { schema: z.object({ defect: DefectSchema }) },
  output: { schema: SingleDefectSummarySchema },
  prompt: `As a QA expert, analyze the following defect and classify it into a root cause category and a functional area category.
  - The root cause should be a short, one or two-word category (e.g., 'Data Integrity', 'Configuration', 'UI/UX', 'Performance', 'Security').
  - The functional area should be a short, one or two-word category (e.g., 'User Auth', 'Billing', 'Search', 'Reporting', 'Checkout').

  Defect:
  - Summary: {{{defect.summary}}}
  - Description: {{{defect.description}}}
  - Domain: {{{defect.domain}}}

  Based on this information, provide your classification in the required JSON format.
`,
});

const defectSummaryFlow = ai.defineFlow(
  {
    name: 'defectSummaryFlow',
    inputSchema: DefectSummaryInputSchema,
    outputSchema: DefectSummaryOutputSchema,
  },
  async ({ defects }) => {
    const summaries = await Promise.all(
      defects.map(async (defect) => {
        const { output } = await summaryPrompt({ defect });
        if (!output) {
          // Return a default/unknown category if prediction fails
          return { id: defect.id, rootCause: 'Unknown', functionalArea: 'Unknown' };
        }
        return { id: defect.id, ...output };
      })
    );

    const rootCauseCounts = summaries.reduce((acc, { id, rootCause }) => {
      if (!acc[rootCause]) {
        acc[rootCause] = { count: 0, defectIds: [] };
      }
      acc[rootCause].count++;
      acc[rootCause].defectIds.push(id);
      return acc;
    }, {} as Record<string, { count: number; defectIds: string[] }>);

    const normalizeFunctionalArea = (area: string): string => {
        const lowerArea = area.toLowerCase().trim();
        if (lowerArea.includes('ship')) {
            return 'Shipment';
        }
        if (lowerArea.includes('order')) {
            return 'Order Management';
        }
        // Capitalize the first letter of each word for consistency
        return area
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    const defectAreaCounts = summaries.reduce((acc, { id, functionalArea }) => {
        const normalizedArea = normalizeFunctionalArea(functionalArea);
        if (!acc[normalizedArea]) {
          acc[normalizedArea] = { count: 0, defectIds: [] };
        }
        acc[normalizedArea].count++;
        acc[normalizedArea].defectIds.push(id);
        return acc;
    }, {} as Record<string, { count: number; defectIds: string[] }>);

    return {
        rootCause: Object.entries(rootCauseCounts).map(([name, data]) => ({ name, ...data })),
        defectArea: Object.entries(defectAreaCounts).map(([name, data]) => ({ name, ...data })),
    };
  }
);
