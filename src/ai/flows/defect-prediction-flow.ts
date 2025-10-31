'use server';
/**
 * @fileOverview AI flows for predicting defect attributes.
 *
 * - bulkPredictDefects - A function that predicts attributes for a list of defects.
 */

import { ai } from '@/ai/genkit';
import {
  type BulkPredictDefectInput,
  type BulkPredictDefectOutput,
  PredictDefectInputSchema,
  PredictDefectOutputSchema,
  SEVERITY_LEVELS,
  PRIORITY_LEVELS,
} from '@/lib/types';


const defectPredictionPrompt = ai.definePrompt({
  name: 'defectPredictionPrompt',
  input: { schema: PredictDefectInputSchema },
  output: { schema: PredictDefectOutputSchema },
  prompt: `You are an expert software quality analyst.
Given the following defect summary and description, predict its severity and priority.
Provide a brief summary of your reasoning.

Defect Summary: {{{summary}}}
Defect Description: {{{description}}}

You must choose a severity from the following list: ${SEVERITY_LEVELS.join(', ')}.
You must choose a priority from the following list: ${PRIORITY_LEVELS.join(', ')}.

Return the original defect ID.`,
});

const defectPredictionFlow = ai.defineFlow(
  {
    name: 'defectPredictionFlow',
    inputSchema: PredictDefectInputSchema,
    outputSchema: PredictDefectOutputSchema,
  },
  async (input) => {
    const { output } = await defectPredictionPrompt(input);
    return output!;
  }
);

export async function bulkPredictDefects(input: BulkPredictDefectInput): Promise<BulkPredictDefectOutput> {
  const predictions = await Promise.all(
    input.defects.map(async (defect) => {
      try {
        return await defectPredictionFlow({
          ...defect,
          // If description is empty, use the summary.
          description: defect.description || defect.summary,
        });
      } catch (error) {
        console.error(`Failed to generate prediction for defect ${defect.id}:`, error);
        return {
          id: defect.id,
          predicted_severity: 'N/A',
          predicted_priority: 'N/A',
          prediction_summary: 'Could not generate prediction due to a model error.',
        };
      }
    })
  );

  return { predictions };
}
