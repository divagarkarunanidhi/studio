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

const BulkPredictDefectInputSchema = z.array(PredictDefectInputSchema);
export type BulkPredictDefectInput = z.infer<typeof BulkPredictDefectInputSchema>;

const BulkPredictDefectOutputSchema = z.array(PredictDefectOutputSchema.extend({
  summary: z.string(),
}));
export type BulkPredictDefectOutput = z.infer<typeof BulkPredictDefectOutputSchema>;


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
  
