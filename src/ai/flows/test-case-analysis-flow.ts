
'use server';
/**
 * @fileOverview An AI flow to analyze test case data and provide a summary.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { TestCaseAnalysisInputSchema, TestCaseAnalysisOutputSchema } from '@/lib/types';
import type { TestCaseAnalysisInput, TestCaseAnalysisOutput } from '@/lib/types';

export async function analyzeTestCases(
    input: TestCaseAnalysisInput
): Promise<TestCaseAnalysisOutput> {
    return testCaseAnalysisFlow(input);
}

const analysisPrompt = ai.definePrompt({
    name: 'testCaseAnalysisPrompt',
    input: { schema: TestCaseAnalysisInputSchema },
    output: { schema: TestCaseAnalysisOutputSchema },
    prompt: `You are a professional Quality Assurance Manager.
    You have been provided with JSON data summarizing a portfolio of test cases.
    The data includes a distribution of test cases across various labels and a reusability analysis.

    Your task is to write a concise, insightful summary of the test case portfolio.

    - Analyze the 'distributionData' to comment on how test cases are distributed. Are they concentrated in specific areas?
    - Analyze the 'reusabilityData' to comment on the effectiveness of test case reuse. Highlight the number of reused cases and the calculated effort savings in hours and days.
    - Provide a brief, high-level conclusion about the state of the test case portfolio based on the data.

    Here is the data to analyze:
    Distribution Data:
    \`\`\`json
    {{{distributionData}}}
    \`\`\`

    Reusability Data:
    \`\`\`json
    {{{reusabilityData}}}
    \`\`\`

    Provide your analysis as a professional, easy-to-read summary.
    `,
});

const testCaseAnalysisFlow = ai.defineFlow(
    {
        name: 'testCaseAnalysisFlow',
        inputSchema: TestCaseAnalysisInputSchema,
        outputSchema: TestCaseAnalysisOutputSchema,
        config: {
            temperature: 0.3,
        }
    },
    async (input) => {
        const { output } = await analysisPrompt(input);
        if (!output) {
            throw new Error('The model did not return a valid analysis.');
        }
        return output;
    }
);
