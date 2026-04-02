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
 * Uses Advanced AI Analytics to analyze failure logs and identify root cause categories.
 * Mimics machine learning Natural Language Processing (NLP) models.
 */
export async function classifyFailures(failuresJson: string): Promise<FailureClassificationOutput> {
    const result = await failureClassificationFlow(failuresJson);
    return result;
}

const prompt = ai.definePrompt({
    name: 'failureClassificationPrompt',
    input: { schema: z.string() },
    output: { schema: FailureClassificationOutputSchema },
    prompt: `You are an expert Data Scientist specializing in Software Quality Assurance Analytics. 
    You have been provided with a JSON array containing failure logs for multiple test scenarios.
    
    Your task is to apply Natural Language Processing (NLP) concepts to classify each failure into one of four categories based on the error signatures and patterns:
    
    1. **Functional Issue**: The application logic failed. Business rule assertions failed. System level errors (500).
    2. **Data Issue**: Missing/incorrect test data. "Element not found" when it implies data dependencies. "Expected value X but found Y" where X/Y are dynamic data.
    3. **Environment Issue**: Infrastructure failures. Timeouts (Connection/Read), 503/504 errors, network resets, database unreachable.
    4. **Automation script issue**: The test script itself is brittle or broken. CSS/Xpath selector changed, driver sync issues, coding errors in the test steps.
    
    CRITICAL INSTRUCTIONS:
    - Analyze the SEMANTIC meaning of the logs, not just keywords.
    - For EVERY scenario provided, return the name, the classification, and a logical reasoning based on "Machine Learning" pattern matching.
    - Provide a final summary count for each category.
    - The SUM of functionalCount + dataCount + environmentCount + automationCount MUST exactly equal the number of scenario objects provided in the input JSON.
    
    **SPECIFIC LOGIC RULE**: 
    If a failure log contains "java.lang.AssertionError: Total Number of Order Failed to Plan :", you MUST classify it as a **Functional Issue**.
    
    Failure Data:
    {{{this}}}
    
    Return a valid JSON object matching the requested schema. Ensure high classification confidence.
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
