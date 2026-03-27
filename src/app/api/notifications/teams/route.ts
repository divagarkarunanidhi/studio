
import { NextResponse } from 'next/server';

/**
 * POST /api/notifications/teams
 * Sends a pipeline summary message to a Microsoft Teams channel using a webhook.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { webhookUrl, summary } = body;

        if (!webhookUrl) {
            return NextResponse.json({ error: "Teams Webhook URL is missing." }, { status: 400 });
        }

        const teamsMessage = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "themeColor": summary.failed > 0 ? "E81123" : "0078D4",
            "summary": "AI Agent Pipeline Summary",
            "sections": [{
                "activityTitle": "🤖 TaaS BugSense AI Agent Pipeline",
                "activitySubtitle": `Project Status Report`,
                "facts": [
                    { "name": "Source Report:", "value": summary.reportName || 'Unknown' },
                    { "name": "Total Scenarios:", "value": String(summary.total || 0) },
                    { "name": "Passed:", "value": String(summary.passed || 0) },
                    { "name": "Failed:", "value": String(summary.failed || 0) },
                    { "name": "Jira Defect Scout:", "value": summary.jiraStatus || 'Skipped' },
                    { "name": "GitLab Data Repaired:", "value": String(summary.gitlabUpdates || 0) },
                    { "name": "Pipeline Orchestrator:", "value": summary.orchestratorStatus || 'Not Triggered' }
                ],
                "markdown": true
            }]
        };

        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(teamsMessage)
        });

        if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json({ error: `Teams API returned ${res.status}`, details: errText }, { status: res.status });
        }

        return NextResponse.json({ success: true, message: "Notification sent successfully." });

    } catch (e: any) {
        console.error("Teams Notification Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred." }, { status: 500 });
    }
}
