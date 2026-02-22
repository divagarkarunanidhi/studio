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
    rootCause: z.string().describe("A short, one or two-word category for the defect's root cause within an OTM context (e.g., 'Agent Logic', 'Integration', 'Saved Query', 'UI Config')."),
    functionalArea: z.string().describe("A short, one or two-word category for the OTM module affected (e.g., 'Shipment Mgmt', 'Financials', 'Planning', 'Order Mgmt').")
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
  prompt: `As an expert QA analyst specializing in Oracle Transportation Management (OTM), analyze the following OTM defect and classify it into an OTM-relevant root cause category and an OTM functional area category.

  IMPORTANT: You have been provided with expert OTM examples. If the current defect is similar to any provided example, you MUST use the exact same root cause and functional area classifications found in that example. Consistency within the OTM context is critical.

  - The root cause should be a short, one or two-word OTM-specific category (e.g., 'Automation Agent', 'Saved Query', 'Direct SQL', 'Integration').
  - The functional area should be a short, one or two-word OTM module category (e.g., 'Shipment Mgmt', 'Order Mgmt', 'Financials', 'Trade Mgmt').

  {{#if examples}}
  ---
  Expert OTM Examples (Follow these patterns strictly):
  {{#each examples}}
  Defect: {{{input.summary}}}
  - Predicted Root Cause: {{{output.predictedRootCause}}}
  - Predicted Functional Area: {{{output.predictedFunctionalArea}}}
  ---
  {{/each}}
  {{/if}}

  Now, classify the following new OTM defect:

  Defect:
  - Summary: {{{defect.summary}}}
  - Description: {{{defect.description}}}
  - Domain: {{{defect.domain}}}

  Based on this information, provide your OTM classification in the required JSON format. Ensure strict alignment with the expert OTM examples above.
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
    config: {
      temperature: 0.1, // Set low for deterministic classification
    }
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
    // Fetch more examples for better matching
    const examplesQuery = query(examplesRef, orderBy('savedAt', 'desc'), limit(15));
    
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
             console.error('An error occurred during OTM summary generation:', e);
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
            return 'Shipment Management';
        }
        if (lowerArea.includes('order')) {
            return 'Order Management';
        }
        if (lowerArea.includes('financial')) {
            return 'Financials';
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
