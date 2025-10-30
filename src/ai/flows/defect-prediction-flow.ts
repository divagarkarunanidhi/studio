'use server';
/**
 * @fileOverview A defect prediction AI agent.
 *
 * - predictDefect - A function that handles the defect prediction process.
 * - PredictDefectInput - The input type for the predictDefect function.
 * - PredictDefectOutput - The return type for the predictDefect function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const PredictDefectInputSchema = z.object({
  summary: z.string().describe('A short summary of the defect.'),
  description: z.string().describe('A detailed description of the defect.'),
});
export type PredictDefectInput = z.infer<typeof PredictDefectInputSchema>;

const PredictDefectOutputSchema = z.object({
  predicted_priority: z.string().describe('The predicted priority of the defect (e.g., Low, Medium, High, Critical).'),
  predicted_severity: z.string().describe('The predicted severity of the defect (e.g., Low, Medium, High, Critical).'),
  suggested_domain: z.string().describe('The suggested domain for the defect (e.g., UI, API, Database, Authentication).'),
  confidence_score: z.number().describe('A confidence score for the prediction, from 0 to 1.'),
});
export type PredictDefectOutput = z.infer<typeof PredictDefectOutputSchema>;

export async function predictDefect(input: PredictDefectInput): Promise<PredictDefectOutput> {
  return predictDefectFlow(input);
}

const prompt = ai.definePrompt({
  name: 'predictDefectPrompt',
  input: {schema: PredictDefectInputSchema},
  output: {schema: PredictDefectOutputSchema},
  prompt: `You are an expert at software defect analysis. Based on the provided defect summary and description, predict the priority, severity, and suggest a relevant domain. Provide a confidence score for your prediction.

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
