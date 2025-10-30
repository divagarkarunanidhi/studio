import { z } from 'zod';

export const DefectSchema = z.object({
    id: z.coerce.number(),
    summary: z.string(),
    description: z.string().optional().nullable(),
    domain: z.string(),
    status: z.string(),
    reported_by: z.string(),
    created_at: z.string(),
    severity: z.string(),
    priority: z.string(),
});

export type Defect = z.infer<typeof DefectSchema>;

const SEVERITY_LEVELS = ['Critical', 'High', 'Medium', 'Low', 'Trivial'];
const PRIORITY_LEVELS = ['Urgent', 'High', 'Medium', 'Low'];

export const PredictDefectInputSchema = z.object({
  id: z.coerce.number().describe('The ID of the defect.'),
  summary: z.string().describe('A brief summary of the defect.'),
  description: z.string().describe('A detailed description of the defect.').optional(),
});
export type PredictDefectInput = z.infer<typeof PredictDefectInputSchema>;

export const PredictDefectOutputSchema = z.object({
  id: z.coerce.number().describe('The ID of the defect.'),
  predicted_severity: z.enum(SEVERITY_LEVELS as [string, ...string[]]).describe('The predicted severity of the defect.'),
  predicted_priority: z.enum(PRIORITY_LEVELS as [string, ...string[]]).describe('The predicted priority of the defect.'),
  prediction_summary: z.string().describe('A brief summary of the prediction and reasoning.'),
});
export type Prediction = z.infer<typeof PredictDefectOutputSchema>;

export const BulkPredictDefectInputSchema = z.object({
  defects: z.array(PredictDefectInputSchema),
});
export type BulkPredictDefectInput = z.infer<typeof BulkPredictDefectInputSchema>;

export const BulkPredictDefectOutputSchema = z.object({
  predictions: z.array(PredictDefectOutputSchema),
});
export type BulkPredictDefectOutput = z.infer<typeof BulkPredictDefectOutputSchema>;

export const ChatInputSchema = z.object({
  history: z.array(z.object({ role: z.string(), content: z.string() })),
  defects: z.array(DefectSchema),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

export type ChatOutput = string;