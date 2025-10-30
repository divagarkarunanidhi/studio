'use server';
/**
 * @fileOverview A defect prediction AI agent.
 *
 * - predictDefect - A function that handles the defect prediction process.
 * - bulkPredictDefects - A function that handles bulk defect prediction.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { PredictDefectInputSchema, PredictDefectOutputSchema, BulkPredictDefectInputSchema, BulkPredictDefectOutputSchema, type PredictDefectInput, type PredictDefectOutput, type BulkPredictDefectInput, type BulkPredictDefectOutput } from '@/lib/types';


export async function predictDefect(input: PredictDefectInput): Promise<PredictDefectOutput> {
  return predictDefectFlow(input);
}

export async function bulkPredictDefects(input: BulkPredictDefectInput): Promise<BulkPredictDefectOutput> {
    return bulkPredictDefectFlow(input);
}


const prompt = ai.definePrompt({
  name: 'predictDefectPrompt',
  input: {schema: PredictDefectInputSchema},
  output: {schema: PredictDefectOutputSchema},
  prompt: `You are an expert at software defect analysis. Based on the provided defect summary and description, predict the priority, severity, and suggest a relevant domain. Provide a confidence score for your prediction, and a brief, one-sentence summary of your analysis.

Summary: {{{summary}}}
Description: {{{description}}}

Analyze the information and return the structured output.`,
});

const predictDefectFlow = ai.defineFlow(
  {
    name: 'predictDefectFlow',
    inputSchema: PredictDefectInputSchema,
    outputSchema: PredictDefectOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

const bulkPredictDefectFlow = ai.defineFlow(
    {
      name: 'bulkPredictDefectFlow',
      inputSchema: BulkPredictDefectInputSchema,
      outputSchema: BulkPredictDefectOutputSchema,
    },
    async (defects) => {
      const requests = defects.map((defect) => ({
        summary: defect.summary,
        description: defect.description || defect.summary,
      }));
  
      const results = await Promise.all(
        requests.map(async (req) => {
          const { output } = await prompt(req);
          return {
            ...output!,
            summary: req.summary,
          };
        })
      );
  
      return results;
    }
  );
  
