'use server';
/**
 * @fileOverview An optimized classification flow that uses native Python logic.
 * 
 * This flow now strictly implements the Python-first analytics model requested.
 */

import { z } from 'zod';
import { FailureClassificationOutputSchema } from '@/lib/types';
import type { FailureClassificationOutput } from '@/lib/types';
import { runPythonClassifier } from '@/lib/python-bridge';

/**
 * Uses the Optimized Python Analytics Engine to classify failure logs.
 * This function handles the bridge to the native script and aggregates results.
 */
export async function classifyFailures(failuresJson: string): Promise<FailureClassificationOutput> {
    const scenarios = JSON.parse(failuresJson);
    
    try {
        // Strictly use the Python-based Analytics Engine
        const pythonResults = await runPythonClassifier(scenarios);
        
        if (pythonResults && Array.isArray(pythonResults)) {
            // Aggregate metrics from Python results for the UI counters
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
        
        throw new Error("Python engine returned an invalid or empty response.");
    } catch (e: any) {
        // Log the failure of the native engine
        console.error("Python Analytics Engine failed:", e.message);
        throw new Error(`Failure classification requires a functional Python environment: ${e.message}`);
    }
}
