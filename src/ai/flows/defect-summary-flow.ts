'use server';
/**
 * @fileOverview An AI flow to summarize defect data for chart visualizations.
 */

import { ai } from '@/ai/genkit';
import {
  DefectSchema,
  DefectSummaryOutputSchema,
  type DefectSummaryOutput,
  type Defect,
} from '@/lib/types';
import { z } from 'zod';

const DefectSummaryInputSchema = z.object({
  defects: z.array(DefectSchema),
});

export async function summarizeDefects(
  input: { defects: Defect[] }
): Promise<DefectSummaryOutput> {
  return defectSummaryFlow(input);
}

const summaryPrompt = ai.definePrompt({
  name: 'defectSummaryPrompt',
  input: { schema: z.object({ defectsJson: z.string() }) },
  output: { schema: DefectSummaryOutputSchema },
  prompt: `You are an expert QA data analyst. Analyze the following list of defects (in JSON format) and provide a summary for dashboard charts.

Defect Data:
{{{defectsJson}}}

Your tasks are:
1.  **Categorize Root Causes**: Group the defects by their most likely root cause (e.g., 'Data Integrity', 'Configuration', 'UI/UX', 'Backend Logic', 'Permissions'). Return an array of objects with 'name' and 'count'.
2.  **Categorize Defect Areas**: Group the defects by the functional area or component of the application they belong to (e.g., 'Invoicing', 'Shipment Planning', 'User Management', 'Appointments'). Return an array of objects with 'name' and 'count'.

Provide the output in the required JSON format.
`,
});

const defectSummaryFlow = ai.defineFlow(
  {
    name: 'defectSummaryFlow',
    inputSchema: DefectSummaryInputSchema,
    outputSchema: DefectSummaryOutputSchema,
    config: {
      temperature: 0.1, // Low temperature for consistent categorization
    },
  },
  async ({ defects }) => {
    const defectsJson = JSON.stringify(defects);
    const { output } = await summaryPrompt({ defectsJson });
    if (!output) {
      throw new Error('The model did not return a valid summary.');
    }
    return output;
  }
);
