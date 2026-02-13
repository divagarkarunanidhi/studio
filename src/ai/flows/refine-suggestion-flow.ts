
'use server';
/**
 * @fileOverview An AI flow to refine a user's defect reduction suggestion.
 * 
 * - refineSuggestion - Takes a raw user suggestion and context to return a polished version.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const RefineSuggestionInputSchema = z.object({
  defectSummary: z.string(),
  userSuggestion: z.string(),
});

const RefineSuggestionOutputSchema = z.object({
  refinedSuggestion: z.string().describe("A professional, grammatically correct, and detailed version of the user's suggestion."),
});

export async function refineSuggestion(input: { defectSummary: string, userSuggestion: string }): Promise<string> {
  const result = await refineSuggestionFlow(input);
  return result.refinedSuggestion;
}

const prompt = ai.definePrompt({
  name: 'refineSuggestionPrompt',
  input: { schema: RefineSuggestionInputSchema },
  output: { schema: RefineSuggestionOutputSchema },
  prompt: `You are an expert QA technical writer. A user has provided a raw suggestion for how to reduce or prevent a specific software defect.

Your task is to reframe this suggestion to be professional, detailed, and grammatically perfect.

Defect Summary: {{{defectSummary}}}
User's Raw Suggestion: {{{userSuggestion}}}

Provide a refined version that is concise yet comprehensive. Do not change the core meaning of the user's suggestion, just improve the quality of the statement.`,
});

const refineSuggestionFlow = ai.defineFlow(
  {
    name: 'refineSuggestionFlow',
    inputSchema: RefineSuggestionInputSchema,
    outputSchema: RefineSuggestionOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) throw new Error("Failed to refine suggestion.");
    return output;
  }
);
