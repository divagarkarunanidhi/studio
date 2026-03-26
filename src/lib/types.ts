
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

export const AppConfigurationSchema = z.object({
    geminiApiKey: z.string().min(1, 'Gemini API Key is required.'),
    mongodbUri: z.string().min(1, 'MongoDB URI is required.'),
    mongodbDbName: z.string().min(1, 'MongoDB DB Name is required.'),
    geminiModel: z.string().min(1, 'Gemini Model is required.'),
    geminiRetryModel: z.string().min(1, 'Gemini Retry Model is required.'),
    jiraLink: z.string().url('Must be a valid URL.').min(1, 'JIRA Link is required.'),
    jiraUser: z.string().optional().nullable(),
    jiraApiToken: z.string().optional().nullable(),
    jiraProjectKey: z.string().optional().nullable(),
    jiraIssueType: z.string().optional().nullable().default('Bug'),
    reusabilityLabels: z.string().optional().nullable(),
    seleniumDomainDateRanges: z.record(z.any()).optional(),
    // Confluence Fetcher Configuration
    confluencePath: z.string().optional().nullable(),
    confluencePageId: z.string().optional().nullable(),
    confluenceUser: z.string().optional().nullable(),
    confluencePassword: z.string().optional().nullable(),
    // GitLab Configuration
    gitlabToken: z.string().optional().nullable(),
    gitlabProjectId: z.string().optional().nullable(),
    gitlabBranch: z.string().optional().nullable().default('main'),
    gitlabFilePathPrefix: z.string().optional().nullable().default(''),
    // Session Settings
    autoLogoutEnabled: z.boolean().default(true),
    autoLogoutTime: z.number().min(1, 'Logout time must be at least 1 minute.').default(5),
});
  
export type AppConfiguration = z.infer<typeof AppConfigurationSchema>;

// Usage Tracking Schema
export const UsageEventSchema = z.object({
    userId: z.string(),
    username: z.string().optional().nullable(),
    eventType: z.enum(['login', 'logout', 'menu_click', 'session_pulse']),
    menuId: z.string().optional().nullable(),
    timestamp: z.string(),
});
export type UsageEvent = z.infer<typeof UsageEventSchema>;

// Agent Schemas
export const AgentTaskSchema = z.object({
    id: z.string(),
    startTime: z.string(),
    endTime: z.string().optional().nullable(),
    status: z.enum(['in-progress', 'completed', 'failed']),
    resultsSummary: z.string().optional().nullable(),
});
export type AgentTask = z.infer<typeof AgentTaskSchema>;

export const AgentActivitySchema = z.object({
    taskId: z.string(),
    agentId: f.number(),
    agentName: z.string(),
    status: z.enum(['pending', 'running', 'success', 'error']),
    message: z.string(),
    timestamp: z.string(),
    data: z.any().optional().nullable(),
});
export type AgentActivity = z.infer<typeof AgentActivitySchema>;

// AI Flow Schemas
export const DefectAnalysisInputSchema = z.object({
    defects: z.array(DefectSchema),
  });
  
export type DefectAnalysisInput = z.infer<typeof DefectAnalysisInputSchema>;

export const DefectAnalysisOutputSchema = z.object({
    defectCause: z.string().describe("An analysis of the root causes of the recurring defects."),
    defectSuggestions: z.string().describe("Actionable suggestions for engineering teams to reduce future defects."),
    majorRootCauses: z.array(z.string()).describe("Top 3 major recurring root causes identified in the dataset, with detailed explanations."),
    majorReductionSuggestions: z.array(z.string()).describe("Top 3 most impactful actionable suggestions for defect reduction, with comprehensive details."),
});

export type DefectAnalysisOutput = z.infer<typeof DefectAnalysisOutputSchema>;

// Prediction Flow Schemas
export const DefectPredictionSchema = z.object({
    predictedSeverity: z.string().describe("The predicted severity of the defect (Critical, High, Medium, Low)."),
    predictedPriority: z.string().describe("The predicted priority of the defect (Highest, High, Medium, Low, Lowest)."),
    predictedRootCause: z.string().describe("A brief, one or two-word potential root cause for the defect (e.g., 'Data Integrity', 'Configuration', 'UI/UX')."),
    predictedFunctionalArea: z.string().describe("A short, one or two-word category for the functional area affected (e.g., 'User Auth', 'Billing', 'Search', 'Reporting', 'Checkout')."),
    predictedDefectSuggestions: z.string().describe("A concise, actionable suggestion to engineering teams to prevent this type of defect in the future."),
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


export const SavedPredictionSchema = z.object({
    defect: DefectSchema,
    prediction: DefectPredictionSchema,
    savedAt: z.string(),
});
export type SavedPrediction = z.infer<typeof SavedPredictionSchema>;

// Summary Flow Schemas
const ChartDataPointSchema = z.object({
    name: z.string(),
    count: z.number(),
    defectIds: z.array(z.string()),
});

export const DefectSummaryOutputSchema = z.object({
    rootCause: z.array(ChartDataPointSchema).describe("An array of objects representing defect counts and IDs grouped by their predicted root cause."),
    defectArea: z.array(ChartDataPointSchema).describe("An array of objects representing defect counts and IDs grouped by their predicted functional area."),
});

export type DefectSummaryOutput = z.infer<typeof DefectSummaryOutputSchema>;

export const DefectSummaryInputSchema = z.object({
    defects: z.array(DefectSchema),
});

export type DefectSummaryInput = z.infer<typeof DefectSummaryInputSchema>;

// Test Case Analysis Flow Schemas
export const TestCaseAnalysisInputSchema = z.object({
    distributionData: z.string().describe("JSON string of test case distribution data."),
    reusabilityData: z.string().describe("JSON string of test case reusability data."),
});
export type TestCaseAnalysisInput = z.infer<typeof TestCaseAnalysisInputSchema>;

export const TestCaseAnalysisOutputSchema = z.object({
    analysis: z.string().describe("A concise summary of the test case portfolio, including distribution and reusability insights."),
});
export type TestCaseAnalysisOutput = z.infer<typeof TestCaseAnalysisOutputSchema>;

// Agent 2 Report Parser Schema
export const ReportParserOutputSchema = z.object({
    total: z.number().describe("The total number of scenarios identified."),
    passed: z.number().describe("The number of passed scenarios."),
    failed: z.number().describe("The number of failed scenarios."),
    scenarios: z.array(z.object({
        name: z.string().describe("The name of the test scenario."),
        status: z.enum(['passed', 'failed']).describe("The final status of the test scenario."),
        tags: z.array(z.string()).describe("A list of name tags or identifiers associated with the scenario (e.g. @TC_101)."),
        logs: z.string().optional().nullable().describe("The failure message or error logs if the scenario failed.")
    })).describe("A detailed list of scenarios found in the report.")
});
export type ReportParserOutput = z.infer<typeof ReportParserOutputSchema>;

// Agent 3 Failure Classifier Schema
export const FailureClassificationSchema = z.object({
    scenarioName: z.string().describe("The name of the failed test scenario."),
    classification: z.enum(['Functional Issue', 'Data Issue', 'Environment Issue']).describe("The categorized cause of the failure."),
    reasoning: z.string().describe("The explanation for why the failure was categorized this way."),
});

export const FailureClassificationOutputSchema = z.object({
    classifications: z.array(FailureClassificationSchema),
    summary: z.object({
        functionalCount: z.number().describe("Total number of functional issues identified."),
        dataCount: z.number().describe("Total number of data-related issues identified."),
        environmentCount: z.number().describe("Total number of environment-related issues identified.")
    })
});
export type FailureClassificationOutput = z.infer<typeof FailureClassificationOutputSchema>;
