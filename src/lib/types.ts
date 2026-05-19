
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

export const FailureRuleSchema = z.object({
    pattern: z.string().min(1, 'Pattern is required'),
    category: z.enum(['Functional Issue', 'Data Issue', 'Environment Issue', 'Automation script issue']),
});

export type FailureRule = z.infer<typeof FailureRuleSchema>;

export const AppConfigurationSchema = z.object({
    aiProvider: z.enum(['googleai', 'dhl']).optional().default('googleai'),
    geminiApiKey: z.string().optional().nullable(),
    mongodbUri: z.string().min(1, 'MongoDB URI is required.'),
    mongodbDbName: z.string().min(1, 'MongoDB DB Name is required.'),
    geminiModel: z.string().optional().nullable().default('gemini-1.5-flash'),
    geminiRetryModel: z.string().optional().nullable().default('gemini-1.5-flash'),
    dhlApiKey: z.string().optional().nullable(),
    dhlEndpoint: z.string().optional().nullable(),
    dhlModel: z.string().optional().nullable().default('gemini-2.0-flash-lite'),
    dhlRetryModel: z.string().optional().nullable().default('gemini-2.0-flash-lite'),
    dhlInsecureTls: z.boolean().optional().default(false),
    jiraLink: z.string().url('Must be a valid URL.').min(1, 'JIRA Link is required.'),
    jiraUser: z.string().optional().nullable(),
    jiraApiToken: z.string().optional().nullable(),
    jiraProjectKey: z.string().optional().nullable(),
    jiraIssueType: z.string().optional().nullable().default('Bug'),
    jiraSearchLink: z.string().optional().nullable(),
    jiraSearchUser: z.string().optional().nullable(),
    jiraSearchApiToken: z.string().optional().nullable(),
    jiraSearchProjectKey: z.string().optional().nullable(),
    reusabilityLabels: z.string().optional().nullable(),
    seleniumDomainDateRanges: z.record(z.any()).optional(),
    confluencePath: z.string().optional().nullable(),
    confluencePageId: z.string().optional().nullable(),
    confluenceUser: z.string().optional().nullable(),
    confluencePassword: z.string().optional().nullable(),
    gitlabToken: z.string().optional().nullable(),
    gitlabBaseUrl: z.string().optional().nullable().default('https://gitlab.com'),
    gitlabInsecureTls: z.boolean().optional().default(false),
    gitlabAutoCommit: z.boolean().optional().default(true),
    jiraAutoCreate: z.boolean().optional().default(true),
    gitlabProjectId: z.string().optional().nullable(),
    gitlabBranch: z.string().optional().nullable().default('main'),
    gitlabFilePathPrefix: z.string().optional().nullable().default(''),
    gitlabPipelineScheduleDescription: z.string().optional().nullable(),
    teamsWebhookUrl: z.string().optional().nullable(),
    outlookClientId: z.string().optional().nullable(),
    outlookTenantId: z.string().optional().nullable(),
    outlookClientSecret: z.string().optional().nullable(),
    outlookUserEmail: z.string().optional().nullable(),
    outlookSenderFilter: z.string().optional().nullable().default('mareeswari'),
    outlookSubjectFilter: z.string().optional().nullable().default('Trigger cox regression'),
    autoTriggerEnabled: z.boolean().default(false),
    failureRules: z.array(FailureRuleSchema).optional().default([]),
    enableTier1Rules: z.boolean().default(true),
    enableTier2Python: z.boolean().default(true),
    enableTier3Heuristics: z.boolean().default(true),
    autoLogoutEnabled: z.boolean().default(true),
    autoLogoutTime: z.number().min(1, 'Logout time must be at least 1 minute.').default(5),
});
  
export type AppConfiguration = z.infer<typeof AppConfigurationSchema>;

export const UsageEventSchema = z.object({
    userId: z.string(),
    username: z.string().optional().nullable(),
    eventType: z.enum(['login', 'logout', 'menu_click', 'session_pulse']),
    menuId: z.string().optional().nullable(),
    timestamp: z.string(),
});
export type UsageEvent = z.infer<typeof UsageEventSchema>;

export const AutoTriggerLogSchema = z.object({
    id: z.string().optional(),
    emailId: z.string(),
    sender: z.string(),
    subject: z.string(),
    triggeredAt: z.string(),
    gitlabStatus: z.string(),
    message: z.string(),
});
export type AutoTriggerLog = z.infer<typeof AutoTriggerLogSchema>;

export const ReportParserOutputSchema = z.object({
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
    scenarios: z.array(z.object({
        name: z.string(),
        status: z.enum(['passed', 'failed']),
        tags: z.array(z.string()),
        logs: z.string().optional().nullable()
    }))
});
export type ReportParserOutput = z.infer<typeof ReportParserOutputSchema>;

export const FailureClassificationOutputSchema = z.object({
    classifications: z.array(z.object({
        scenarioName: z.string(),
        classification: z.enum(['Functional Issue', 'Data Issue', 'Environment Issue', 'Automation script issue']),
        reasoning: z.string(),
    })),
    summary: z.object({
        functionalCount: z.number(),
        dataCount: z.number(),
        environmentCount: z.number(),
        automationCount: z.number()
    })
});
export type FailureClassificationOutput = z.infer<typeof FailureClassificationOutputSchema>;

export const TestCaseAnalysisInputSchema = z.object({
    distributionData: z.string(),
    reusabilityData: z.string(),
});
export type TestCaseAnalysisInput = z.infer<typeof TestCaseAnalysisInputSchema>;

export const TestCaseAnalysisOutputSchema = z.object({
    analysis: z.string(),
});
export type TestCaseAnalysisOutput = z.infer<typeof TestCaseAnalysisOutputSchema>;

export const DefectAnalysisOutputSchema = z.object({
    defectCause: z.string(),
    defectSuggestions: z.string(),
    majorRootCauses: z.array(z.string()),
    majorReductionSuggestions: z.array(z.string()),
});
export type DefectAnalysisOutput = z.infer<typeof DefectAnalysisOutputSchema>;

export const DefectPredictionSchema = z.object({
    predictedSeverity: z.string(),
    predictedPriority: z.string(),
    predictedRootCause: z.string(),
    predictedFunctionalArea: z.string(),
    predictedDefectSuggestions: z.string(),
});
export type DefectPrediction = z.infer<typeof DefectPredictionSchema> & { id: string };

export const DefectPredictionOutputSchema = z.object({
    predictions: z.array(DefectPredictionSchema.extend({ id: z.string() })),
});
export type DefectPredictionOutput = z.infer<typeof DefectPredictionOutputSchema>;

export const SavedPredictionSchema = z.object({
    defect: DefectSchema,
    prediction: DefectPredictionSchema,
    savedAt: z.string(),
});
export type SavedPrediction = z.infer<typeof SavedPredictionSchema>;

const ChartDataPointSchema = z.object({
    name: z.string(),
    count: z.number(),
    defectIds: z.array(z.string()),
});

export const DefectSummaryOutputSchema = z.object({
    rootCause: z.array(ChartDataPointSchema),
    defectArea: z.array(ChartDataPointSchema),
});
export type DefectSummaryOutput = z.infer<typeof DefectSummaryOutputSchema>;
