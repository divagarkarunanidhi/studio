
'use server';
/**
 * @fileOverview An AI flow to predict severity and priority for a list of defects.
 */

import { ai } from '@/ai/genkit';
import {
  DefectSchema,
  DefectPredictionSchema,
  DefectPredictionOutputSchema,
  type DefectPredictionOutput,
  type Defect,
  type AppConfiguration,
} from '@/lib/types';
import { z } from 'zod';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

const { firestore } = initializeFirebase();

const DefectPredictionInputSchema = z.object({
  defects: z.array(DefectSchema),
});

export async function predictDefects(
  input: { defects: Defect[] }
): Promise<DefectPredictionOutput> {
  return defectPredictionFlow(input);
}

const predictionPrompt = ai.definePrompt({
  name: 'defectPredictionPrompt',
  input: { schema: z.object({ defect: DefectSchema }) },
  output: { schema: DefectPredictionSchema },
  prompt: `As a QA expert, analyze the following defect and predict its severity, priority and root cause.
  - Severity should be one of: Critical, High, Medium, Low.
  - Priority should be one of: Highest, High, Medium, Low.
  - The predicted root cause should be a short, one or two-word category (e.g., 'Data Integrity', 'Configuration', 'UI/UX').
  - Provide a short, one-sentence description explaining your reasoning.

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
  async ({ defects }) => {
    const configRef = doc(firestore, 'appConfiguration', 'global');
    const configSnap = await getDoc(configRef);
    if (!configSnap.exists()) {
        throw new Error("App configuration not found.");
    }
    const config = configSnap.data() as AppConfiguration;
    const retryModel = config.geminiRetryModel;

    const predictions = await Promise.all(
      defects.map(async (defect) => {
        try {
            const { output } = await predictionPrompt({ defect });
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
                const { output } = await predictionPrompt({ defect }, { model: `googleai/${retryModel}` });
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
