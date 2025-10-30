'use server';

/**
 * @fileOverview A flow to summarize defect predictions.
 *
 * - summarizePredictions - A function that generates a summary of defect predictions.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { SummarizePredictionsInputSchema, SummarizePredictionsOutputSchema, type SummarizePredictionsInput, type SummarizePredictionsOutput } from '@/lib/types';


export async function summarizePredictions(input: SummarizePredictionsInput): Promise<SummarizePredictionsOutput> {
  return summarizePredictionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizePredictionsPrompt',
  input: {schema: SummarizePredictionsInputSchema},
  output: {schema: SummarizePredictionsOutputSchema},
  prompt: `You are an expert at software defect analysis. You will be given a list of defects with their predicted attributes.
Your task is to provide a high-level summary of the predictions.
Identify trends, such as common domains for high-priority defects, or a high concentration of defects in a particular area.
Keep the summary concise and insightful.

Predictions:
{{{json predictions}}}
`,
});

const summarizePredictionsFlow = ai.defineFlow(
  {
    name: 'summarizePredictionsFlow',
    inputSchema: SummarizePredictionsInputSchema,
    outputSchema: SummarizePredictionsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
