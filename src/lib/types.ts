
import { z } from 'zod';

export const DefectSchema = z.object({
    id: z.string(),
    summary: z.string(),
    description: z.string().optional().nullable(),
    domain: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    reported_by: z.string().optional().nullable(),
    created_at: z.string(),
    updated: z.string().optional().nullable(),
    severity: z.string().optional().nullable(),
    priority: z.string().optional().nullable(),
});

export type Defect = z.infer<typeof DefectSchema>;

// AI Flow Schemas
export const DefectAnalysisInputSchema = z.object({
    defects: z.array(DefectSchema),
  });
  
export type DefectAnalysisInput = z.infer<typeof DefectAnalysisInputSchema>;

export const DefectAnalysisOutputSchema = z.object({
    defectCause: z.string().describe("An analysis of the root causes of the recurring defects."),
    defectSuggestions: z.string().describe("Actionable suggestions for engineering teams to reduce future defects."),
    defectSource: z.string().describe("An identification of where most defects are originating from (e.g., a specific domain, component, or issue type)."),
});

export type DefectAnalysisOutput = z.infer<typeof DefectAnalysisOutputSchema>;

// Prediction Flow Schemas
export const DefectPredictionSchema = z.object({
    predictedSeverity: z.string().describe("The predicted severity of the defect (Critical, High, Medium, Low)."),
    predictedPriority: z.string().describe("The predicted priority of the defect (Highest, High, Medium, Low)."),
    predictionDescription: z.string().describe("A short, one-sentence description explaining the reasoning for the prediction."),
    predictedRootCause: z.string().describe("A brief, one or two-word potential root cause for the defect (e.g., 'Data Integrity', 'Configuration', 'UI/UX')."),
});

export type DefectPrediction = z.infer<typeof DefectPredictionSchema> & { id: string };

export const DefectPredictionOutputSchema = z.object({
    predictions: z.array(
        DefectPredictionSchema.extend({
            id: z.string(),
        })
    ),
});

export type DefectPredictionOutput = z.infer<typeof DefectPredictionOutputSchema>;
