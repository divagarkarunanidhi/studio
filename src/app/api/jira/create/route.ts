
import { NextResponse } from 'next/server';

/**
 * POST /api/jira/create
 * Creates a Jira issue and optionally attaches a file.
 * Includes improved sanitization and error message extraction.
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
            return NextResponse.json({ error: "Jira configuration is incomplete. Please check the Application Configuration page." }, { status: 400 });
        }

        const auth = Buffer.from(`${jiraUser}:${jiraApiToken}`).toString('base64');
        const headers = {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Atlassian-Token': 'no-check'
        };

        // 1. Create the Issue
        const baseUrl = jiraLink.replace(/\/+$/, '');
        const createUrl = `${baseUrl}/rest/api/2/issue`;
        
        // Sanitize Summary: Must be single line and max ~255 chars
        const safeSummary = (issue.summary || 'Selenium Test Failure')
            .replace(/\n/g, ' ')
            .replace(/\r/g, ' ')
            .substring(0, 250)
            .trim();

        const payload = {
            fields: {
                project: { key: jiraProjectKey.trim().toUpperCase() },
                summary: safeSummary,
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
            let errorMessage = `Jira API Error: ${createRes.status} ${createRes.statusText}`;
            
            try {
                const parsedError = JSON.parse(errBody);
                if (parsedError.errors && Object.keys(parsedError.errors).length > 0) {
                    errorMessage = Object.entries(parsedError.errors)
                        .map(([key, val]) => `${key}: ${val}`)
                        .join(', ');
                } else if (parsedError.errorMessages && parsedError.errorMessages.length > 0) {
                    errorMessage = parsedError.errorMessages.join(', ');
                }
            } catch (e) {
                // Not JSON, fallback to raw text if it's short
                if (errBody && errBody.length < 200) {
                    errorMessage = errBody;
                }
            }

            return NextResponse.json({ error: errorMessage, details: errBody }, { status: createRes.status });
        }

        const issueResult = await createRes.json();
        const issueKey = issueResult.key;

        // 2. Attach Screenshot if present
        if (screenshot && issueKey) {
            const attachUrl = `${baseUrl}/rest/api/2/issue/${issueKey}/attachments`;
            
            const attachFormData = new FormData();
            attachFormData.append('file', screenshot);

            // Fetch without JSON headers for multi-part upload
            const attachRes = await fetch(attachUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'X-Atlassian-Token': 'no-check'
                },
                body: attachFormData
            });

            if (!attachRes.ok) {
                // Non-critical failure for the overall process
                console.warn(`Jira attachment failed for ${issueKey}: status ${attachRes.status}`);
            }
        }

        return NextResponse.json({ success: true, key: issueKey });

    } catch (e: any) {
        return NextResponse.json({ error: e.message || "An unexpected error occurred in the Jira integration." }, { status: 500 });
    }
}
