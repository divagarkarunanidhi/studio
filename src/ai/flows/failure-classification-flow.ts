'use server';
/**
 * @fileOverview An AI flow to classify test failures into Functional, Data, Environment, or Automation script issues.
 * 
 * This flow supports a Hybrid Intelligence model:
 * 1. User Rules (Manual Heuristics)
 * 2. Python Bridge (Native Data Science/ML logic)
 * 3. Genkit AI (Advanced Natural Language fallback)
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FailureClassificationOutputSchema } from '@/lib/types';
import type { FailureClassificationOutput } from '@/lib/types';
import { runPythonClassifier } from '@/lib/python-bridge';

/**
 * Uses Advanced Hybrid Analytics to classify failure logs.
 * Now leverages native Python scripts for core classification.
 */
export async function classifyFailures(failuresJson: string): Promise<FailureClassificationOutput> {
    const scenarios = JSON.parse(failuresJson);
    
    try {
        // 1. Attempt to use the Python-based Analytics Engine
        const pythonResults = await runPythonClassifier(scenarios);
        
        if (pythonResults && Array.isArray(pythonResults)) {
            // Aggregate metrics from Python results
            const summary = {
                functionalCount: pythonResults.filter((r: any) => r.classification === 'Functional Issue').length,
                dataCount: pythonResults.filter((r: any) => r.classification === 'Data Issue').length,
                environmentCount: pythonResults.filter((r: any) => r.classification === 'Environment Issue').length,
                automationCount: pythonResults.filter((r: any) => r.classification === 'Automation script issue').length,
            };
            
            return {
                classifications: pythonResults,
                summary
            };
        }
    } catch (e: any) {
        // Log the error but fall back gracefully to Genkit AI
        console.warn("Python Analytics Engine failed or not available. Falling back to Genkit AI:", e.message);
    }

    // 2. Fallback: Use Genkit AI for analysis if Python fails
    const result = await failureClassificationFlow(failuresJson);
    return result;
}

const prompt = ai.definePrompt({
    name: 'failureClassificationPrompt',
    input: { schema: z.string() },
    output: { schema: FailureClassificationOutputSchema },
    prompt: `You are an expert Data Scientist specializing in Software Quality Assurance Analytics. 
    You have been provided with a JSON array containing failure logs for multiple test scenarios.
    
    Your task is to apply Natural Language Processing (NLP) concepts—similar to those used in Scikit-Learn and spaCy—to classify each failure into one of four categories based on the semantic error signatures:
    
    1. **Functional Issue**: The application logic failed. Business rule assertions failed. System level errors (500). Examples: "Expected 5 but found 3", "AssertionError in Planning".
    2. **Data Issue**: Missing/incorrect test data. "Element not found" when it implies data dependencies. "Expected value X but found Y" where X/Y are dynamic data records.
    3. **Environment Issue**: Infrastructure failures. Timeouts (Connection/Read), 503/504 errors, network resets, database unreachable.
    4. **Automation script issue**: The test script itself is brittle or broken. CSS/Xpath selector changed, driver sync issues, coding errors in the test steps.
    
    CRITICAL INSTRUCTIONS:
    - Perform a FEATURE EXTRACTION analysis on the logs (look for keywords, error codes, and stack trace signatures).
    - Use SEMANTIC VECTOR CLUSTERING logic: group similar error meanings even if words differ.
    - For EVERY scenario provided, return the name, the classification, and a logical reasoning based on pattern matching.
    - Provide a final summary count for each category.
    - The SUM of functionalCount + dataCount + environmentCount + automationCount MUST exactly equal the number of scenario objects provided in the input JSON.
    
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
