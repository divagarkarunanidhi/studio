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
