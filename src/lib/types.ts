import { z } from 'zod';

export const DefectSchema = z.object({
    id: z.string(),
    summary: z.string(),
    description: z.string().optional().nullable(),
    domain: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    reported_by: z.string().optional().nullable(),
    created_at: z.string(),
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
