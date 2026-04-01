'use server';
/**
 * @fileOverview An AI flow to classify test failures into Functional, Data, Environment, or Automation script issues.
 * 
 * - classifyFailures - Takes failure logs and returns structured classifications.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FailureClassificationOutputSchema } from '@/lib/types';
import type { FailureClassificationOutput } from '@/lib/types';

/**
 * Uses Generative AI to analyze failure logs and identify root cause categories.
 */
export async function classifyFailures(failuresJson: string): Promise<FailureClassificationOutput> {
    const result = await failureClassificationFlow(failuresJson);
    return result;
}

const prompt = ai.definePrompt({
    name: 'failureClassificationPrompt',
    input: { schema: z.string() },
    output: { schema: FailureClassificationOutputSchema },
    prompt: `You are an expert QA automation analyst. 
    You have been provided with a JSON array containing failure logs for multiple test scenarios.
    
    Your task is to analyze each failure and classify it into one of four categories:
    1. **Functional Issue**: The application logic failed. Assertions on business rules failed. Unexpected system errors (500).
    2. **Data Issue**: The test failed because of missing or incorrect test data. "Element not found" often implies data wasn't created or found. "Expected value X but found Y" where X/Y are dynamic data points.
    3. **Environment Issue**: Timeouts, network errors, database connection failures, or server unavailability (503).
    4. **Automation script issue**: The test script itself is broken or brittle. Element locators changed, timing issues in the script, or coding errors in the test steps.
    
    CRITICAL INSTRUCTIONS:
    - For EVERY failure provided in the input list, return the scenario name, the classification, and a short reasoning.
    - Provide a final summary count for each category.
    - The SUM of functionalCount + dataCount + environmentCount + automationCount MUST exactly equal the number of scenario objects provided in the input JSON.
    - Do not group multiple failures into one classification object; return one object per failure.
    
    **SPECIFIC CLASSIFICATION RULE**: 
    If a failure log contains "java.lang.AssertionError: Total Number of Order Failed to Plan :", you MUST classify it as a **Functional Issue**. This specific error indicates that the application's core planning logic did not behave as expected.
    
    Failure Data:
    {{{this}}}
    
    Return a valid JSON object matching the requested schema. Ensure all counts in the 'summary' object are accurate based on the individual classifications.
    `,
});

const failureClassificationFlow = ai.defineFlow(
    {
        name: 'failureClassificationFlow',
        inputSchema: z.string(),
        outputSchema: FailureClassificationOutputSchema,
    },
    async (input) => {
        const { output } = await prompt(input);
        if (!output) {
            throw new Error('The AI model did not return a valid failure classification.');
        }
        return output;
    }
);
