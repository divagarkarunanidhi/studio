
'use server';
/**
 * @fileOverview An AI flow to analyze a list of defects and provide insights.
 *
 * - analyzeDefects - A function that takes a list of defects and returns an analysis.
 * - DefectAnalysisInput - The input type for the analyzeDefects function.
 * - DefectAnalysisOutput - The return type for the analyzeDefects function.
 */

import { ai } from '@/ai/genkit';
import {
  DefectSchema,
  DefectAnalysisOutputSchema,
  DefectPredictionSchema,
  SavedPredictionSchema,
  type DefectAnalysisOutput,
  type Defect,
  type AppConfiguration,
  type SavedPrediction,
} from '@/lib/types';
import { z } from 'zod';
import { getFirestore, doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { getFirestoreInstance } from '@/firebase/server-config';

const DefectAnalysisInputSchema = z.object({
  defects: z.string(),
});

export type DefectAnalysisInput = z.infer<typeof DefectAnalysisInputSchema>;


export async function analyzeDefects(
  input: { defects: Defect[], userId: string }
): Promise<DefectAnalysisOutput> {
  return defectAnalysisFlow(input);
}

const FewShotExampleSchema = z.object({
    input: DefectSchema,
    output: DefectPredictionSchema
});

const analysisPrompt = ai.definePrompt({
  name: 'defectAnalysisPrompt',
  input: { schema: z.object({ 
      defects: z.string(),
      examples: z.array(FewShotExampleSchema).optional(),
    }) },
  output: { schema: DefectAnalysisOutputSchema },
  prompt: `You are an expert software quality assurance analyst. You have been given a list of defects in JSON format.
Your task is to analyze these defects and provide a summary of your findings.

Based on the provided defect data:
1.  **Defect Cause**: Analyze the root causes of the recurring defects. Look for patterns in descriptions, domains, and severity.
2.  **Defect Suggestions**: Provide actionable suggestions to engineering teams to reduce the number of defects in the future. IMPORTANT: Since all these defects are found by an automated regression suite, do not suggest "improve automation" or "add a regression suite". Focus on code quality, logic, or process improvements.

{{#if examples}}
---
Here are some examples of high-quality analysis for individual defects. Use these as a guide for the tone and type of insights to provide in your overall summary.
{{#each examples}}
Defect: {{{input.summary}}}
- Predicted Root Cause: {{{output.predictedRootCause}}}
- Predicted Suggestion: {{{output.predictedDefectSuggestions}}}
---
{{/each}}
{{/if}}

Here is the defect data to analyze:
{{{defects}}}

Provide a concise, insightful analysis for each of the two areas.
`,
});

const defectAnalysisFlow = ai.defineFlow(
  {
    name: 'defectAnalysisFlow',
    inputSchema: z.object({ 
        defects: z.array(DefectSchema),
        userId: z.string(),
    }),
    outputSchema: DefectAnalysisOutputSchema,
    config: {
      temperature: 0.2, // Lower temperature for more deterministic and factual analysis
    }
  },
  async ({ defects, userId }) => {
    const defectsString = JSON.stringify(defects, null, 2);
    
    const { firestore } = await getFirestoreInstance();
    const configRef = doc(firestore, 'appConfiguration', 'global');
    const configSnap = await getDoc(configRef);
    if (!configSnap.exists()) {
        throw new Error("App configuration not found.");
    }
    const config = configSnap.data() as AppConfiguration;
    const retryModel = config.geminiRetryModel;
    
    // Fetch few-shot examples from the shared collection
    const examplesRef = collection(firestore, `sharedFeedback`);
    const examplesQuery = query(examplesRef, orderBy('savedAt', 'desc'), limit(5));
    const examplesSnap = await getDocs(examplesQuery);
    const examples = examplesSnap.docs.map(doc => {
        const data = doc.data() as SavedPrediction;
        return {
            input: data.defect,
            output: data.prediction,
        };
    });

    try {
        const { output } = await analysisPrompt({ defects: defectsString, examples });
        if (!output) {
            throw new Error('The model did not return a valid analysis.');
        }
        return output;
    } catch (e: any) {
        if (e.message && (e.message.includes('429 Too Many Requests') || e.message.includes('503 Service Unavailable'))) {
            console.warn(`Rate limit or availability error, retrying with ${retryModel}...`);
            const { output } = await analysisPrompt({ defects: defectsString, examples }, { model: `googleai/${retryModel}` });
            if (!output) {
                throw new Error('The fallback model also did not return a valid analysis.');
            }
            return output;
        }
        // Re-throw other errors
        throw e;
    }
  }
);
