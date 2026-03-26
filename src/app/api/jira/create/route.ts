
import { NextResponse } from 'next/server';

/**
 * POST /api/jira/create
 * Creates a Jira issue and optionally attaches a file.
 */
export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const configStr = formData.get('config') as string;
        const issueDataStr = formData.get('issue') as string;
        const screenshot = formData.get('screenshot') as File | null;

        if (!configStr || !issueDataStr) {
            return NextResponse.json({ error: "Missing configuration or issue data." }, { status: 400 });
        }

        const config = JSON.parse(configStr);
        const issue = JSON.parse(issueDataStr);

        const { jiraLink, jiraUser, jiraApiToken, jiraProjectKey, jiraIssueType } = config;

        if (!jiraLink || !jiraUser || !jiraApiToken || !jiraProjectKey) {
            return NextResponse.json({ error: "Jira configuration is incomplete. Check Application Configuration." }, { status: 400 });
        }

        const auth = Buffer.from(`${jiraUser}:${jiraApiToken}`).toString('base64');
        const headers = {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Atlassian-Token': 'no-check'
        };

        // 1. Create the Issue
        const createUrl = `${jiraLink.replace(/\/+$/, '')}/rest/api/2/issue`;
        const payload = {
            fields: {
                project: { key: jiraProjectKey },
                summary: issue.summary || 'Selenium Test Failure',
                description: issue.description || 'No description provided.',
                issuetype: { name: jiraIssueType || 'Bug' }
            }
        };

        const createRes = await fetch(createUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (!createRes.ok) {
            const errBody = await createRes.text();
            console.error("Jira Create Issue Error:", errBody);
            return NextResponse.json({ error: `Jira API Error: ${createRes.status} ${createRes.statusText}`, details: errBody }, { status: createRes.status });
        }

        const issueResult = await createRes.json();
        const issueKey = issueResult.key;

        // 2. Attach Screenshot if present
        if (screenshot && issueKey) {
            const attachUrl = `${jiraLink.replace(/\/+$/, '')}/rest/api/2/issue/${issueKey}/attachments`;
            
            const attachFormData = new FormData();
            attachFormData.append('file', screenshot);

            const attachRes = await fetch(attachUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'X-Atlassian-Token': 'no-check'
                },
                body: attachFormData
            });

            if (!attachRes.ok) {
                console.warn(`Jira attachment failed for ${issueKey}:`, await attachRes.text());
            }
        }

        return NextResponse.json({ success: true, key: issueKey });

    } catch (e: any) {
        console.error("Jira Integration Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred." }, { status: 500 });
    }
}
