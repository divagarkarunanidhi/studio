'use server';
/**
 * @fileOverview An AI flow to parse test execution metrics from a JSON report.
 * 
 * - parseReportWithAI - Takes JSON content and extracts test metrics.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { ReportParserOutputSchema } from '@/lib/types';
import type { ReportParserOutput } from '@/lib/types';

/**
 * Uses Generative AI to analyze report JSON and extract structured test metrics.
 * Useful for handling complex Cucumber/Selenium JSON structures or custom schemas.
 */
export async function parseReportWithAI(content: string): Promise<ReportParserOutput> {
    const result = await reportParserFlow(content);
    return result;
}

const prompt = ai.definePrompt({
    name: 'reportParserPrompt',
    input: { schema: z.string() },
    output: { schema: ReportParserOutputSchema },
    prompt: `You are an expert QA automation analyst. 
    You have been provided with a JSON string representing a test execution report (usually Cucumber/Selenium format).
    
    Your task is to identify and count the test scenarios within this JSON.
    
    CRITICAL INSTRUCTIONS:
    1. Look for features and their 'elements' (scenarios).
    2. For each scenario, check the 'steps'. A scenario is 'failed' if ANY step has a status of 'failed'.
    3. provide a total count, passed count, and failed count.
    4. List all identified scenarios with their full names, final statuses, and ALL tags associated with them.
    5. The total count must exactly match the number of scenarios in the list.
    
    JSON Content:
    {{{this}}}
    
    Return a valid JSON object matching the requested schema.
    `,
});

const reportParserFlow = ai.defineFlow(
    {
        name: 'reportParserFlow',
        inputSchema: z.string(),
        outputSchema: ReportParserOutputSchema,
    },
    async (input) => {
        const { output } = await prompt(input);
        if (!output) {
            throw new Error('The AI model did not return a valid report analysis.');
        }
        return output;
    }
);
