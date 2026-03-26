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
    
    CRITICAL INSTRUCTIONS:
    1. Scan the input for summary dashboard boxes or cards. These often have titles like "Features", "Scenarios", "Passed Scenarios", "Failed Scenarios". 
    2. Extract the numbers associated with these specific labels.
    3. If no summary exists, identify individual test cases. They usually start with a scenario name (e.g., "Scenario 1", "Validate Invoice Flow") and often have tags above them (e.g., @TC_101, @Regression).
    4. Determine the status of each scenario. Look for keywords like "PASSED", "FAILED", "PASSED_WITH_ERRORS", "SUCCESS", or "FAILURE" near the scenario name or in a status box.
    5. provide a total count, passed count, and failed count.
    6. List all identified scenarios with their full names, final statuses, and ALL tags associated with them.
    7. Ensure that the total count strictly matches the sum of passed and failed scenarios if derived from individual cases.
    
    Input Content:
    {{{this}}}
    
    Return a valid JSON object. Ensure the 'total' count exactly matches the number of items in the 'scenarios' list. Do not return 0 scenarios if test names or summary numbers are present.
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
