import {z} from 'zod';

export type Defect = {
    [key: string]: string | number;
    id: number;
    summary: string;
    domain: string;
    status: string;
    reported_by: string;
    created_at: string;
    severity: string;
    priority: string;
  };
  
export const PredictDefectInputSchema = z.object({
  summary: z.string().describe('A short summary of the defect.'),
  description: z.string().describe('A detailed description of the defect.'),
});
export type PredictDefectInput = z.infer<typeof PredictDefectInputSchema>;

export const PredictDefectOutputSchema = z.object({
  predicted_priority: z.string().describe('The predicted priority of the defect (e.g., Low, Medium, High, Critical).'),
  predicted_severity: z.string().describe('The predicted severity of the defect (e.g., Low, Medium, High, Critical).'),
  suggested_domain: z.string().describe('The suggested domain for the defect (e.g., UI, API, Database, Authentication).'),
  confidence_score: z.number().describe('A confidence score for the prediction, from 0 to 1.'),
});
export type PredictDefectOutput = z.infer<typeof PredictDefectOutputSchema>;

export const BulkPredictDefectInputSchema = z.array(PredictDefectInputSchema);
export type BulkPredictDefectInput = z.infer<typeof BulkPredictDefectInputSchema>;

export const BulkPredictDefectOutputSchema = z.array(PredictDefectOutputSchema.extend({
  summary: z.string(),
}));
export type BulkPredictDefectOutput = z.infer<typeof BulkPredictDefectOutputSchema>;

export const SummarizePredictionsInputSchema = z.object({
  predictions: BulkPredictDefectOutputSchema.describe('A list of defect predictions.'),
});
export type SummarizePredictionsInput = z.infer<typeof SummarizePredictionsInputSchema>;

export const SummarizePredictionsOutputSchema = z.object({
    summary: z.string().describe('A high-level summary of the defect predictions.'),
});
export type SummarizePredictionsOutput = z.infer<typeof SummarizePredictionsOutputSchema>;

export const ChatInputSchema = z.object({
  history: z.array(z.any()).describe('The chat history.'),
  message: z.string().describe('The user message.'),
  defects: z.array(z.any()).describe('A list of defect objects.'),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

export const ChatOutputSchema = z.object({
  message: z.string().describe('The chatbot response.'),
});
export type ChatOutput = z.infer<typeof ChatOutputSchema>;