'use server';
/**
 * @fileOverview An AI flow to analyze a list of defects and provide insights.
 *
 * - analyzeDefects - A function that takes a list of defects and returns an analysis.
 * - DefectAnalysisInput - The input type for the analyzeDefects function.
 * - DefectAnalysisOutput - The return type for the analyzeDefects function.
 */

import { ai } from '@/ai/genkit';
import {
  DefectSchema,
  DefectAnalysisOutputSchema,
  type DefectAnalysisOutput,
  type Defect,
} from '@/lib/types';
import { z } from 'zod';


const DefectAnalysisInputSchema = z.object({
  defects: z.string(),
});

export type DefectAnalysisInput = z.infer<typeof DefectAnalysisInputSchema>;


export async function analyzeDefects(
  input: { defects: Defect[] }
): Promise<DefectAnalysisOutput> {
  return defectAnalysisFlow(input);
}

const analysisPrompt = ai.definePrompt({
  name: 'defectAnalysisPrompt',
  input: { schema: DefectAnalysisInputSchema },
  output: { schema: DefectAnalysisOutputSchema },
  prompt: `You are an expert software quality assurance analyst. You have been given a list of defects in JSON format.
Your task is to analyze these defects and provide a summary of your findings.

Based on the provided defect data:
1.  **Defect Cause**: Analyze the root causes of the recurring defects. Look for patterns in descriptions, domains, and severity.
2.  **Defect Suggestions**: Provide actionable suggestions to engineering teams to reduce the number of defects in the future.
3.  **Defect Source**: Identify where most defects are originating from. This could be a specific application domain, a certain type of issue, or related to a particular component.

Here is the defect data:
{{{defects}}}

Provide a concise, insightful analysis for each of the three areas.
`,
});

const defectAnalysisFlow = ai.defineFlow(
  {
    name: 'defectAnalysisFlow',
    inputSchema: z.object({ defects: z.array(DefectSchema) }),
    outputSchema: DefectAnalysisOutputSchema,
    config: {
      temperature: 0.0, // Lower temperature for more deterministic and factual analysis
    }
  },
  async ({ defects }) => {
    const defectsString = JSON.stringify(defects, null, 2);
    const { output } = await analysisPrompt({ defects: defectsString });
    if (!output) {
      throw new Error('The model did not return a valid analysis.');
    }
    return output;
  }
);
