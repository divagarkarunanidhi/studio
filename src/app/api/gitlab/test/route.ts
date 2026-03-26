
import { NextResponse } from 'next/server';

/**
 * POST /api/gitlab/test
 * Validates GitLab credentials and checks if the specified project path or ID exists.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, projectId } = body;

        if (!token || !projectId) {
            return NextResponse.json({ 
                error: "Configuration missing. Please provide a GitLab Private Token and Project ID/Path." 
            }, { status: 400 });
        }

        // GitLab Project API endpoint
        const baseUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}`;

        const res = await fetch(baseUrl, { 
            headers: { 'PRIVATE-TOKEN': token }, 
            signal: AbortSignal.timeout(10000) 
        });

        if (res.ok) {
            const data = await res.json();
            return NextResponse.json({ 
                success: true, 
                message: `Successfully connected! Found project: ${data.name_with_namespace}` 
            });
        }

        // Handle specific GitLab error codes
        if (res.status === 401) {
            return NextResponse.json({ 
                error: "Unauthorized (401): Invalid Private Token. Please check your GitLab user settings." 
            }, { status: 401 });
        }

        if (res.status === 404) {
            return NextResponse.json({ 
                error: `Project '${projectId}' was not found (404). Please ensure the Project ID or Path is correct.` 
            }, { status: 404 });
        }

        const errBody = await res.text();
        return NextResponse.json({ 
            error: `GitLab API Error: ${res.status}`,
            details: errBody 
        }, { status: res.status });

    } catch (e: any) {
        console.error("GitLab Test Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred during the GitLab test." }, { status: 500 });
    }
}
