
import { NextResponse } from 'next/server';

/**
 * POST /api/jira/test
 * Validates Jira credentials and checks if the specified project key exists.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { jiraLink, jiraUser, jiraApiToken, jiraProjectKey } = body;

        if (!jiraLink || !jiraUser || !jiraApiToken || !jiraProjectKey) {
            return NextResponse.json({ 
                error: "Configuration missing. Please provide URL, Username, API Token, and Project Key." 
            }, { status: 400 });
        }

        const auth = Buffer.from(`${jiraUser}:${jiraApiToken}`).toString('base64');
        const headers = {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
            'X-Atlassian-Token': 'no-check'
        };

        // Normalize URL and target the project metadata endpoint
        const baseUrl = jiraLink.replace(/\/+$/, '');
        const testUrl = `${baseUrl}/rest/api/2/project/${jiraProjectKey.trim().toUpperCase()}`;

        const res = await fetch(testUrl, { 
            headers, 
            signal: AbortSignal.timeout(10000) 
        });

        if (res.ok) {
            const data = await res.json();
            return NextResponse.json({ 
                success: true, 
                message: `Successfully connected! Found project: ${data.name} (${data.key})` 
            });
        }

        // Handle specific Jira error codes
        if (res.status === 401) {
            return NextResponse.json({ 
                error: "Unauthorized (401): Please verify your Email and API Token. Note: Jira Cloud requires an API Token, not your password." 
            }, { status: 401 });
        }

        if (res.status === 404) {
            return NextResponse.json({ 
                error: `Project '${jiraProjectKey}' was not found (404). Please ensure the Project Key is correct and your account has access to it.` 
            }, { status: 404 });
        }

        const errBody = await res.text();
        return NextResponse.json({ 
            error: `Jira API Error: ${res.status} ${res.statusText}`,
            details: errBody 
        }, { status: res.status });

    } catch (e: any) {
        console.error("Jira Test Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred during the Jira test." }, { status: 500 });
    }
}
