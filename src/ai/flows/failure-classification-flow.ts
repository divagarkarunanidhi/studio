'use server';
/**
 * @fileOverview An optimized classification flow that uses native Python logic.
 * 
 * This flow supports a multi-tiered architecture:
 * - Tier 2: Python Scikit-Learn Engine (if enabled)
 * - Tier 3: Standard Heuristics (if enabled and Tier 2 fails or is disabled)
 */

import { z } from 'zod';
import { FailureClassificationOutputSchema } from '@/lib/types';
import type { FailureClassificationOutput, AppConfiguration } from '@/lib/types';
import { runPythonClassifier } from '@/lib/python-bridge';
import { getGlobalAppConfig } from '@/lib/app-config';

/**
 * Uses Optimized Analytical Engines to classify failure logs.
 * Handles the bridge to the native script and provides a heuristic fallback.
 * Respects enablement flags for Tiers 2 and 3 from global configuration.
 */
export async function classifyFailures(failuresJson: string): Promise<FailureClassificationOutput> {
    const scenarios = JSON.parse(failuresJson);
    
    // Fetch configuration to check tier enablement
    let enableTier2 = true;
    let enableTier3 = true;

    try {
        const config = (await getGlobalAppConfig()) as AppConfiguration | null;
        if (config) {
            enableTier2 = config.enableTier2Python ?? true;
            enableTier3 = config.enableTier3Heuristics ?? true;
        }
    } catch (configError) {
        console.warn("Failed to fetch classification config, defaulting to all tiers enabled.");
    }

    let classifications: any[] = [];

    // Attempt Tier 2 (Python Scikit-Learn Engine) if enabled
    if (enableTier2) {
        try {
            const pythonResults = await runPythonClassifier(scenarios);
            if (pythonResults && Array.isArray(pythonResults)) {
                classifications = pythonResults;
            } else {
                throw new Error("Python engine returned an invalid response.");
            }
        } catch (e: any) {
            console.warn("Tier 2 (Python) failed or unavailable:", e.message);
            // We only continue if Tier 3 is enabled as a fallback
        }
    }

    // Attempt Tier 3 (Standard Heuristics) if enabled AND we don't have results yet
    if (enableTier3 && classifications.length === 0) {
        classifications = scenarios.map((s: any) => {
            const logs = (s.logs || "").toLowerCase();
            let classification: 'Functional Issue' | 'Data Issue' | 'Environment Issue' | 'Automation script issue' = 'Automation script issue';
            let reasoning = "Standard Heuristics: Pattern matching based on common error signatures.";

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
    }

    // If both disabled, return as Automation Issue (default)
    if (classifications.length === 0) {
        classifications = scenarios.map((s: any) => ({
            scenarioName: s.name,
            classification: 'Automation script issue',
            reasoning: 'Engine Default: All analytical tiers (2 and 3) are disabled or failed.'
        }));
    }

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
