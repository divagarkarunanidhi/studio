
'use server';
/**
 * @fileOverview An AI flow to predict severity and priority for a list of defects.
 */

import { ai } from '@/ai/genkit';
import {
  DefectSchema,
  DefectPredictionSchema,
  DefectPredictionOutputSchema,
  SavedPredictionSchema,
  type DefectPredictionOutput,
  type Defect,
  type AppConfiguration,
  type SavedPrediction,
} from '@/lib/types';
import { z } from 'zod';
import { getFirestore, doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { getFirestoreInstance } from '@/firebase/server-config';
import { FirestorePermissionError } from '@/firebase/errors';

const DefectPredictionInputSchema = z.object({
  defects: z.array(DefectSchema),
  userId: z.string(),
});

export async function predictDefects(
  input: { defects: Defect[], userId: string }
): Promise<DefectPredictionOutput> {
  return defectPredictionFlow(input);
}

const FewShotExampleSchema = z.object({
    input: DefectSchema,
    output: DefectPredictionSchema
});

const predictionPrompt = ai.definePrompt({
  name: 'defectPredictionPrompt',
  input: { schema: z.object({ 
    defect: DefectSchema,
    examples: z.array(FewShotExampleSchema).optional(),
   }) },
  output: { schema: DefectPredictionSchema },
  prompt: `As a QA expert, analyze the following defect and predict its properties.
- Severity should be one of: Critical, High, Medium, Low.
- Priority should be one of: Highest, High, Medium, Low, Lowest.
- The predicted root cause should be a short, one or two-word category (e.g., 'Data Integrity', 'Configuration', 'UI/UX').
- The functional area should be a short, one or two-word category (e.g., 'User Auth', 'Billing', 'Search').
- The suggestion for reduction should be a concise, actionable suggestion for this specific defect. IMPORTANT: Since all these defects are found by an automated regression suite, do not suggest "improve automation" or "add a regression suite". Focus on code quality, logic, or process improvements.

{{#if examples}}
---
Here are some examples of excellent predictions to learn from:
{{#each examples}}

Example Input Defect:
- Summary: {{{input.summary}}}
- Description: {{{input.description}}}

Example Output Prediction:
- Predicted Severity: {{{output.predictedSeverity}}}
- Predicted Priority: {{{output.predictedPriority}}}
- Predicted Root Cause: {{{output.predictedRootCause}}}
- Predicted Functional Area: {{{output.predictedFunctionalArea}}}
- Predicted Suggestion: {{{output.predictedDefectSuggestions}}}
---
{{/each}}
{{/if}}

Now, analyze the following new defect:

Defect:
- Summary: {{{defect.summary}}}
- Description: {{{defect.description}}}
- Domain: {{{defect.domain}}}
- Status: {{{defect.status}}}

Based on this information, provide your prediction in the required JSON format.
`,
});

const defectPredictionFlow = ai.defineFlow(
  {
    name: 'defectPredictionFlow',
    inputSchema: DefectPredictionInputSchema,
    outputSchema: DefectPredictionOutputSchema,
  },
  async ({ defects, userId }) => {
    const { firestore } = await getFirestoreInstance();
    const configRef = doc(firestore, 'appConfiguration', 'global');
    let configSnap;
    try {
        configSnap = await getDoc(configRef);
    } catch (e: any) {
        if (e.code === 'permission-denied') {
            throw new FirestorePermissionError({
                path: configRef.path,
                operation: 'get',
            });
        }
        throw e;
    }

    if (!configSnap.exists()) {
        throw new Error("App configuration not found.");
    }
    const config = configSnap.data() as AppConfiguration;
    const retryModel = config.geminiRetryModel;
    
    const examplesRef = collection(firestore, `sharedFeedback`);
    const examplesQuery = query(examplesRef, orderBy('savedAt', 'desc'), limit(5));
    let examplesSnap;
    try {
        examplesSnap = await getDocs(examplesQuery);
    } catch (e: any) {
        if (e.code === 'permission-denied') {
            throw new FirestorePermissionError({
                path: examplesRef.path,
                operation: 'list',
            });
        }
        throw e;
    }
    
    const examples = examplesSnap.docs.map(doc => {
        const data = doc.data() as SavedPrediction;
        return {
            input: data.defect,
            output: data.prediction,
        };
    });

    const predictions = await Promise.all(
      defects.map(async (defect) => {
        try {
            const { output } = await predictionPrompt({ defect, examples });
            if (!output) {
              throw new Error('The model did not return a valid prediction.');
            }
            return {
              id: defect.id,
              ...output,
            };
        } catch (e: any) {
            if (e.message && (e.message.includes('429 Too Many Requests') || e.message.includes('503 Service Unavailable'))) {
                console.warn(`Rate limit or availability error, retrying with ${retryModel}...`);
                const { output } = await predictionPrompt({ defect, examples }, { model: `googleai/${retryModel}` });
                 if (!output) {
                    throw new Error('The fallback model also did not return a valid prediction.');
                }
                return {
                    id: defect.id,
                    ...output,
                };
            }
            // Re-throw other errors
            throw e;
        }
      })
    );

    return { predictions };
  }
);
