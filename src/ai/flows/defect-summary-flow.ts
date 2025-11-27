
'use server';
/**
 * @fileOverview An AI flow to summarize defects into categories for visualization.
 */

import { ai } from '@/ai/genkit';
import {
  DefectSchema,
  DefectSummaryInputSchema,
  DefectSummaryOutputSchema,
  DefectPredictionSchema,
  SavedPredictionSchema,
  type DefectSummaryOutput,
  type Defect,
  type AppConfiguration,
  type SavedPrediction,
} from '@/lib/types';
import { z } from 'zod';
import { getFirestore, doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { getFirestoreInstance } from '@/firebase/server-config';

const SingleDefectSummarySchema = z.object({
    rootCause: z.string().describe("A short, one or two-word category for the defect's root cause (e.g., 'Data Integrity', 'Configuration', 'UI/UX', 'Performance', 'Security')."),
    functionalArea: z.string().describe("A short, one or two-word category for the functional area affected (e.g., 'User Auth', 'Billing', 'Search', 'Reporting', 'Checkout').")
});

export async function summarizeDefects(
  input: { defects: Defect[], userId: string }
): Promise<DefectSummaryOutput> {
  return defectSummaryFlow(input);
}

const FewShotExampleSchema = z.object({
    input: DefectSchema,
    output: DefectPredictionSchema
});

const summaryPrompt = ai.definePrompt({
  name: 'defectSummaryPrompt',
  input: { schema: z.object({ 
    defect: DefectSchema,
    examples: z.array(FewShotExampleSchema).optional(),
   }) },
  output: { schema: SingleDefectSummarySchema },
  prompt: `As a QA expert, analyze the following defect and classify it into a root cause category and a functional area category.
  - The root cause should be a short, one or two-word category (e.g., 'Data Integrity', 'Configuration', 'UI/UX', 'Performance', 'Security').
  - The functional area should be a short, one or two-word category (e.g., 'User Auth', 'Billing', 'Search', 'Reporting', 'Checkout').

  {{#if examples}}
  ---
  Here are some examples of high-quality classifications to learn from:
  {{#each examples}}
  Defect: {{{input.summary}}}
  - Predicted Root Cause: {{{output.predictedRootCause}}}
  - Predicted Functional Area: {{{output.predictedFunctionalArea}}}
  ---
  {{/each}}
  {{/if}}

  Now, classify the following new defect:

  Defect:
  - Summary: {{{defect.summary}}}
  - Description: {{{defect.description}}}
  - Domain: {{{defect.domain}}}

  Based on this information, provide your classification in the required JSON format.
`,
});

const defectSummaryFlow = ai.defineFlow(
  {
    name: 'defectSummaryFlow',
    inputSchema: z.object({ 
        defects: z.array(DefectSchema),
        userId: z.string(),
    }),
    outputSchema: DefectSummaryOutputSchema,
  },
  async ({ defects, userId }) => {
    // Use the server-side firestore instance for all Firestore operations in the flow.
    const { firestore } = await getFirestoreInstance();
    const configRef = doc(firestore, 'appConfiguration', 'global');
    
    const configSnap = await getDoc(configRef);

    if (!configSnap.exists()) {
        throw new Error("App configuration not found.");
    }
    const config = configSnap.data() as AppConfiguration;
    const retryModel = config.geminiRetryModel;
    
    const examplesRef = collection(firestore, 'sharedFeedback');
    const examplesQuery = query(examplesRef, orderBy('savedAt', 'desc'), limit(5));
    
    const examplesSnap = await getDocs(examplesQuery);

    const examples = examplesSnap.docs.map(doc => {
        const data = doc.data() as SavedPrediction;
        return {
            input: data.defect,
            output: data.prediction,
        };
    });

    const summaries = await Promise.all(
      defects.map(async (defect) => {
        try {
            const { output } = await summaryPrompt({ defect, examples });
            if (!output) {
              // Return a default/unknown category if prediction fails
              return { id: defect.id, rootCause: 'Unknown', functionalArea: 'Unknown' };
            }
            return { id: defect.id, ...output };
        } catch (e: any) {
             if (e.message && (e.message.includes('429 Too Many Requests') || e.message.includes('503 Service Unavailable'))) {
                console.warn(`Rate limit or availability error, retrying with ${retryModel}...`);
                const { output } = await summaryPrompt({ defect, examples }, { model: `googleai/${retryModel}` });
                if (!output) {
                    return { id: defect.id, rootCause: 'Unknown', functionalArea: 'Unknown' };
                }
                return { id: defect.id, ...output };
             }
             // For other errors, still return a default.
             console.error('An error occurred during summary generation:', e);
             return { id: defect.id, rootCause: 'Unknown', functionalArea: 'Unknown' };
        }
      })
    );

    const rootCauseCounts = summaries.reduce((acc, { id, rootCause }) => {
      if (!acc[rootCause]) {
        acc[rootCause] = { count: 0, defectIds: [] };
      }
      acc[rootCause].count++;
      acc[rootCause].defectIds.push(id);
      return acc;
    }, {} as Record<string, { count: number; defectIds: string[] }>);

    const normalizeFunctionalArea = (area: string): string => {
        const lowerArea = area.toLowerCase().trim();
        if (lowerArea.includes('ship')) {
            return 'Shipment';
        }
        if (lowerArea.includes('order')) {
            return 'Order Management';
        }
        // Capitalize the first letter of each word for consistency
        return area
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    const defectAreaCounts = summaries.reduce((acc, { id, functionalArea }) => {
        const normalizedArea = normalizeFunctionalArea(functionalArea);
        if (!acc[normalizedArea]) {
          acc[normalizedArea] = { count: 0, defectIds: [] };
        }
        acc[normalizedArea].count++;
        acc[normalizedArea].defectIds.push(id);
        return acc;
    }, {} as Record<string, { count: number; defectIds: string[] }>);

    return {
        rootCause: Object.entries(rootCauseCounts).map(([name, data]) => ({ name, ...data })),
        defectArea: Object.entries(defectAreaCounts).map(([name, data]) => ({ name, ...data })),
    };
  }
);
