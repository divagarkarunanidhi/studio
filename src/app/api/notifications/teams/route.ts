
import { NextResponse } from 'next/server';

type AgentReportItem = {
    id: number;
    name: string;
    status: 'idle' | 'running' | 'success' | 'error';
    lastRun: string | null;
    extraInfo: string | null;
    metrics: { total: number; passed: number; failed: number } | null;
    recentLogs: string[];
};

type Summary = {
    solution?: string;
    reportName?: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    durationMs?: number | null;
    total?: number;
    passed?: number;
    failed?: number;
    classificationCounts?: Record<string, number>;
    classificationSummary?: any;
    failedScenarios?: string[];
    preparedDataFile?: string | null;
    preparedDataInfo?: string | null;
    gitlabUpdates?: number;
    gitlabCommitInfo?: string | null;
    orchestratorStatus?: string;
    pipelineUrl?: string | null;
    jiraStatus?: string;
    agents?: AgentReportItem[];
};

const STATUS_ICON: Record<string, string> = {
    success: '✅',
    error: '❌',
    running: '⏳',
    idle: '⚪',
};

function formatDuration(ms?: number | null): string {
    if (!ms || ms <= 0) return 'n/a';
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m === 0 ? `${s}s` : `${m}m ${s}s`;
}

function buildClassificationFacts(counts?: Record<string, number>) {
    if (!counts) return [];
    return Object.entries(counts).map(([k, v]) => ({ name: `• ${k}`, value: String(v) }));
}

function buildAgentSection(a: AgentReportItem) {
    const icon = STATUS_ICON[a.status] || '⚪';
    const facts: { name: string; value: string }[] = [
        { name: 'Status', value: `${icon} ${a.status.toUpperCase()}` },
    ];
    if (a.lastRun) facts.push({ name: 'Completed', value: new Date(a.lastRun).toLocaleString() });
    if (a.extraInfo) facts.push({ name: 'Result', value: a.extraInfo });
    if (a.metrics) {
        facts.push({ name: 'Metrics', value: `Total ${a.metrics.total} • Passed ${a.metrics.passed} • Failed ${a.metrics.failed}` });
    }
    if (a.recentLogs && a.recentLogs.length) {
        facts.push({ name: 'Recent Logs', value: a.recentLogs.map(l => `\n- ${l}`).join('') });
    }
    return {
        activityTitle: `**Agent ${a.id}: ${a.name}**`,
        facts,
        markdown: true,
    };
}

/**
 * POST /api/notifications/teams
 * Sends a comprehensive pipeline summary message to a Microsoft Teams channel using a webhook.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { webhookUrl, summary } = body as { webhookUrl?: string; summary?: Summary };

        if (!webhookUrl) {
            return NextResponse.json({ error: 'Teams Webhook URL is missing.' }, { status: 400 });
        }

        const s: Summary = summary || {};
        const failed = s.failed ?? 0;
        const headlineFacts: { name: string; value: string }[] = [
            { name: 'Solution', value: s.solution || 'Unknown' },
            { name: 'Source Report', value: s.reportName || 'Unknown' },
            { name: 'Started', value: s.startedAt ? new Date(s.startedAt).toLocaleString() : 'n/a' },
            { name: 'Finished', value: s.finishedAt ? new Date(s.finishedAt).toLocaleString() : 'n/a' },
            { name: 'Duration', value: formatDuration(s.durationMs) },
            { name: 'Total Scenarios', value: String(s.total ?? 0) },
            { name: 'Passed', value: String(s.passed ?? 0) },
            { name: 'Failed', value: String(failed) },
            { name: 'GitLab Updates', value: String(s.gitlabUpdates ?? 0) },
            { name: 'GitLab Commit', value: s.gitlabCommitInfo || 'n/a' },
            { name: 'Prepared Data File', value: s.preparedDataFile || 'n/a' },
            { name: 'Data Healing', value: s.preparedDataInfo || 'n/a' },
            { name: 'Pipeline Orchestrator', value: s.orchestratorStatus || 'Not Triggered' },
            ...(s.pipelineUrl ? [{ name: 'Pipeline URL', value: `[View Pipeline](${s.pipelineUrl})` }] : []),
            { name: 'Jira Defect Scout', value: s.jiraStatus || 'Skipped' },
        ];

        const sections: any[] = [
            {
                activityTitle: '🤖 TaaS BugSense AI Agent Pipeline',
                activitySubtitle: 'End-to-End Execution Report',
                facts: headlineFacts,
                markdown: true,
            },
        ];

        const classFacts = buildClassificationFacts(s.classificationCounts);
        if (classFacts.length) {
            sections.push({
                activityTitle: '**Failure Classification Breakdown**',
                facts: classFacts,
                markdown: true,
            });
        }

        if (s.failedScenarios && s.failedScenarios.length) {
            sections.push({
                activityTitle: '**Failed Scenarios (top 10)**',
                text: s.failedScenarios.map(n => `- ${n}`).join('\n'),
                markdown: true,
            });
        }

        if (s.agents && s.agents.length) {
            sections.push({
                activityTitle: '**Per-Agent Execution Details**',
                markdown: true,
            });
            s.agents.forEach(a => sections.push(buildAgentSection(a)));
        }

        const teamsMessage = {
            '@type': 'MessageCard',
            '@context': 'http://schema.org/extensions',
            themeColor: failed > 0 ? 'E81123' : '0078D4',
            summary: 'AI Agent Pipeline Comprehensive Report',
            title: `AI Agent Pipeline Report — ${s.solution || 'Unknown'}`,
            sections,
        };

        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(teamsMessage),
        });

        if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json({ error: `Teams API returned ${res.status}`, details: errText }, { status: res.status });
        }

        return NextResponse.json({ success: true, message: 'Notification sent successfully.' });

    } catch (e: any) {
        console.error('Teams Notification Error:', e);
        return NextResponse.json({ error: e.message || 'An unexpected error occurred.' }, { status: 500 });
    }
}
