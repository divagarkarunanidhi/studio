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
  prompt: `As an expert QA analyst specializing in Oracle Transportation Management (OTM), analyze the following OTM-specific defect and predict its properties.

IMPORTANT: You have been provided with expert-validated OTM examples. If the current defect is similar or identical to any provided example, you MUST prioritize consistency. Ensure the predicted root cause and defect suggestions match the terminology and logic established in the examples.

- Severity should be one of: Critical, High, Medium, Low.
- Priority should be one of: Highest, High, Medium, Low, Lowest.
- The predicted root cause should be a short, one or two-word category (e.g., 'Automation Agent', 'Integration Mapping', 'Saved Query', 'Screen Set', 'Planning Logic').
- The functional area should be a short, one or two-word category reflecting OTM modules (e.g., 'Shipment Management', 'Financials', 'Order Mgmt', 'Contract Mgmt').
- The suggestion for reduction should be a concise, actionable OTM-specific suggestion for this specific defect. Focus on OTM configurations or standard workflows.

{{#if examples}}
---
Expert-Validated OTM Examples (Primary Knowledge Source):
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

Now, analyze the following new OTM defect:

Defect:
- Summary: {{{defect.summary}}}
- Description: {{{defect.description}}}
- Domain: {{{defect.domain}}}
- Status: {{{defect.status}}}

Based on this information, provide your prediction in the required JSON format. Ensure strict alignment with the OTM patterns shown in the examples above.
`,
});

const defectPredictionFlow = ai.defineFlow(
  {
    name: 'defectPredictionFlow',
    inputSchema: DefectPredictionInputSchema,
    outputSchema: DefectPredictionOutputSchema,
    config: {
      temperature: 0.1, // Set very low for deterministic classification and consistency
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
    // Increase limit to 15 to give the model more historical context
    const examplesQuery = query(examplesRef, orderBy('savedAt', 'desc'), limit(15));
    
    const examplesSnap = await getDocs(examplesQuery);
    
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
