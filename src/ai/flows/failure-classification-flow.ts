'use server';
/**
 * @fileOverview An optimized classification flow that uses native Python logic.
 * 
 * This flow now strictly implements the Python-first analytics model requested,
 * but includes a robust heuristic fallback if the Python environment is missing.
 */

import { z } from 'zod';
import { FailureClassificationOutputSchema } from '@/lib/types';
import type { FailureClassificationOutput } from '@/lib/types';
import { runPythonClassifier } from '@/lib/python-bridge';

/**
 * Uses the Optimized Python Analytics Engine to classify failure logs.
 * Handles the bridge to the native script and provides a heuristic fallback
 * if the environment lacks a functional Python runtime.
 */
export async function classifyFailures(failuresJson: string): Promise<FailureClassificationOutput> {
    const scenarios = JSON.parse(failuresJson);
    
    try {
        // Strictly attempt to use the Python-based Analytics Engine
        const pythonResults = await runPythonClassifier(scenarios);
        
        if (pythonResults && Array.isArray(pythonResults)) {
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
        // If Python is missing or failed, fall back to "Standard Heuristics" 
        // to ensure the pipeline remains operational.
        console.warn("Python Analytics Engine failed, falling back to standard heuristics:", e.message);
        
        const classifications = scenarios.map((s: any) => {
            const logs = (s.logs || "").toLowerCase();
            let classification: 'Functional Issue' | 'Data Issue' | 'Environment Issue' | 'Automation script issue' = 'Automation script issue';
            let reasoning = `Standard Heuristics: Python engine missing or failed (${e.message}). Used internal pattern matching.`;

            if (logs.includes("assertion") || logs.includes("expected") || logs.includes("found") || logs.includes("mismatch")) {
                classification = "Functional Issue";
                reasoning = "Standard Heuristics: Detected assertion failure pattern (AssertionError/Mismatch).";
            } else if (logs.includes("element") || logs.includes("locate") || logs.includes("nullpointer") || logs.includes("stale") || logs.includes("search results")) {
                classification = "Data Issue";
                reasoning = "Standard Heuristics: Detected UI locator or data reference issue (Element Not Found/NoSuchElement).";
            } else if (logs.includes("503") || logs.includes("504") || logs.includes("timeout") || logs.includes("refused") || logs.includes("unreachable") || logs.includes("max retries")) {
                classification = "Environment Issue";
                reasoning = "Standard Heuristics: Detected network, service timeout, or environment connectivity issue.";
            }

            return { 
                scenarioName: s.name, 
                classification, 
                reasoning 
            };
        });

        const summary = {
            functionalCount: classifications.filter((r: any) => r.classification === 'Functional Issue').length,
            dataCount: classifications.filter((r: any) => r.classification === 'Data Issue').length,
            environmentCount: classifications.filter((r: any) => r.classification === 'Environment Issue').length,
            automationCount: classifications.filter((r: any) => r.classification === 'Automation script issue').length,
        };

        return {
            classifications,
            summary
        };
    }
}
