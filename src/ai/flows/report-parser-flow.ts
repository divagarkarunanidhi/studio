
'use server';
/**
 * @fileOverview An AI flow to parse test execution metrics from an HTML report.
 * 
 * - parseReportWithAI - Takes HTML content or text snippet and extracts test metrics.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { ReportParserOutputSchema } from '@/lib/types';
import type { ReportParserOutput } from '@/lib/types';

/**
 * Uses Generative AI to analyze report content and extract structured test metrics.
 * Useful when the report HTML structure is non-standard or highly complex.
 */
export async function parseReportWithAI(content: string): Promise<ReportParserOutput> {
    const result = await reportParserFlow(content);
    return result;
}

const prompt = ai.definePrompt({
    name: 'reportParserPrompt',
    input: { schema: z.string() },
    output: { schema: ReportParserOutputSchema },
    prompt: `You are an expert QA automation analyst specializing in Cucumber and Selenium reporting. 
    You have been provided with a text-based snippet or a section of an HTML test report.
    
    Your task is to identify and count the test scenarios.
    
    1. Scan the input for a summary section (e.g., "13 scenarios (11 passed, 2 failed)").
    2. Identify individual test cases. They usually start with a scenario name and may have tags above them (e.g., @TC_101, @Regression).
    3. Determine the status of each scenario. Look for keywords like "PASSED", "FAILED", "PASSED_WITH_ERRORS", or "SUCCESS".
    4. Provide a total count, passed count, and failed count.
    5. List all identified scenarios with their names, statuses, and any tags you found.
    
    Input Content:
    {{{this}}}
    
    Provide the output in valid JSON matching the required schema. Ensure the counts match the sum of the scenario list.
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
