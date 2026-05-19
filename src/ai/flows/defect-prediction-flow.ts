'use server';
/**
 * @fileOverview An AI flow to predict severity and priority for a list of defects.
 */

import { ai, getAiModelConfig } from '@/ai/genkit';
import { GoogleGenAI } from '@google/genai';
import { Agent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
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
import { getGlobalAppConfig, getSharedFeedbackExamples } from '@/lib/app-config';

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

const DEFAULT_DHL_VERTEX_MODEL = 'gemini-2.0-flash-lite';

function buildPredictionPrompt(defect: Defect, examples: Array<{ input: Defect; output: SavedPrediction['prediction'] }>) {
  const exampleSection = examples.length
    ? `---\nExpert-Validated OTM Examples (Primary Knowledge Source):\n${examples
        .map(
          ({ input, output }) => `
Example Input Defect:
- Summary: ${input.summary}
- Description: ${input.description ?? ''}

Example Output Prediction:
- Predicted Severity: ${output.predictedSeverity}
- Predicted Priority: ${output.predictedPriority}
- Predicted Root Cause: ${output.predictedRootCause}
- Predicted Functional Area: ${output.predictedFunctionalArea}
- Predicted Suggestion: ${output.predictedDefectSuggestions}
---`
        )
        .join('\n')}`
    : '';

  return `As an expert QA analyst specializing in Oracle Transportation Management (OTM), analyze the following OTM-specific defect and predict its properties.

IMPORTANT: You have been provided with expert-validated OTM examples. If the current defect is similar or identical to any provided example, you MUST prioritize consistency. Ensure the predicted root cause and defect suggestions match the terminology and logic established in the examples.

- Severity should be one of: Critical, High, Medium, Low.
- Priority should be one of: Highest, High, Medium, Low, Lowest.
- The predicted root cause should be a short, one or two-word category (e.g., 'Automation Agent', 'Integration Mapping', 'Saved Query', 'Screen Set', 'Planning Logic').
- The functional area should be a short, one or two-word category reflecting OTM modules (e.g., 'Shipment Management', 'Financials', 'Order Mgmt', 'Contract Mgmt').
- The suggestion for reduction should be a concise, actionable OTM-specific suggestion for this specific defect. Focus on OTM configurations or standard workflows.
- Return only valid JSON with these exact keys: predictedSeverity, predictedPriority, predictedRootCause, predictedFunctionalArea, predictedDefectSuggestions.
- All values must be plain strings (not arrays or objects). For predictedDefectSuggestions, return a single string; if multiple suggestions apply, join them into one string separated by '; '.

${exampleSection}

Now, analyze the following new OTM defect:

Defect:
- Summary: ${defect.summary}
- Description: ${defect.description ?? ''}
- Domain: ${defect.domain ?? ''}
- Status: ${defect.status ?? ''}

Provide only the JSON object.`;
}

function parsePredictionResponse(rawText: string | undefined) {
  if (!rawText) {
    throw new Error('The DHL model returned an empty response.');
  }

  const normalized = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const parsed = JSON.parse(normalized);
  for (const key of [
    'predictedSeverity',
    'predictedPriority',
    'predictedRootCause',
    'predictedFunctionalArea',
    'predictedDefectSuggestions',
  ] as const) {
    const value = (parsed as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      (parsed as Record<string, unknown>)[key] = value
        .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
        .join('; ');
    } else if (value && typeof value === 'object') {
      (parsed as Record<string, unknown>)[key] = JSON.stringify(value);
    } else if (value != null && typeof value !== 'string') {
      (parsed as Record<string, unknown>)[key] = String(value);
    }
  }
  return DefectPredictionSchema.parse(parsed);
}

async function withOptionalInsecureTls<T>(enabled: boolean | undefined, action: () => Promise<T>): Promise<T> {
  if (!enabled) {
    return action();
  }

  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  // Node.js 20+ uses undici for global fetch; NODE_TLS_REJECT_UNAUTHORIZED
  // alone is not always respected. Override the global dispatcher temporarily.
  const previousDispatcher = getGlobalDispatcher();
  const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
  setGlobalDispatcher(insecureAgent);

  try {
    return await action();
  } finally {
    setGlobalDispatcher(previousDispatcher);
    insecureAgent.close();
    if (previous === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
    }
  }
}

async function predictDefectWithDhl(
  defect: Defect,
  examples: Array<{ input: Defect; output: SavedPrediction['prediction'] }>,
  config: AppConfiguration,
  modelOverride?: string
) {
  const apiKey = config.dhlApiKey ?? process.env.DHL_API_KEY;
  if (!apiKey) {
    throw new Error('DHL API key missing. Set dhlApiKey in configuration or DHL_API_KEY in the environment.');
  }

  const endpoint = config.dhlEndpoint ?? process.env.DHL_ENDPOINT;
  if (!endpoint) {
    throw new Error('DHL endpoint missing. Set dhlEndpoint in configuration or DHL_ENDPOINT in the environment.');
  }

  const client = new GoogleGenAI({
    vertexai: true,
    apiKey,
    httpOptions: {
      baseUrl: endpoint.replace(/\/+$/, ''),
    },
  } as any);

  const model = modelOverride || config.dhlModel || DEFAULT_DHL_VERTEX_MODEL;
  const prompt = buildPredictionPrompt(defect, examples);

  console.log('[Prediction Request]', {
    endpoint: endpoint.replace(/\/+$/, ''),
    model,
    defectId: defect.id,
    defectSummary: defect.summary,
    promptLength: prompt.length,
    temperature: 0.1,
  });

  const startTime = Date.now();

  let response;
  try {
    response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });
  } catch (err: any) {
    const cause = err?.cause ?? err;
    const detail = cause?.code || cause?.message || String(cause);
    throw new Error(
      `DHL endpoint fetch failed (${endpoint.replace(/\/+$/, '')}): ${detail}. ` +
      `Verify the endpoint is reachable and TLS certificates are valid (or enable Insecure TLS in configuration).`,
      { cause: err }
    );
  }

  const elapsed = Date.now() - startTime;

  console.log('[Prediction Response]', {
    defectId: defect.id,
    elapsed: `${elapsed}ms`,
    responseText: response.text,
    modelVersion: response.modelVersion ?? null,
  });

  return parsePredictionResponse(response.text);
}

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
    // Read app config + recent shared feedback examples from MongoDB.
    const config = (await getGlobalAppConfig()) as AppConfiguration | null;
    if (!config) {
        throw new Error("App configuration not found.");
    }
    // Resolve provider-aware retry model (e.g. googleai/... or openai/...).
    const { retryModel } = await getAiModelConfig();

    const examplesData = await getSharedFeedbackExamples(15);
    const examples = examplesData.map((data: any) => ({
        input: (data as SavedPrediction).defect,
        output: (data as SavedPrediction).prediction,
    }));

    const generatePredictions = async () => {
      return Promise.all(
        defects.map(async (defect) => {
          try {
            const output = await predictDefectWithDhl(defect, examples, config);
            return {
              id: defect.id,
              ...output,
            };
          } catch (e: any) {
            if (e?.message && (e.message.includes('429') || e.message.includes('503'))) {
              const output = await predictDefectWithDhl(
                defect,
                examples,
                config,
                config.dhlRetryModel || config.dhlModel || DEFAULT_DHL_VERTEX_MODEL
              );
              return {
                id: defect.id,
                ...output,
              };
            }
            throw e;
          }
        })
      );
    };

    const predictions = await withOptionalInsecureTls(!!config.dhlInsecureTls, generatePredictions);

    return { predictions };
  }
);
