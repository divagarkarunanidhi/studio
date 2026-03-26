
import { NextResponse } from 'next/server';

/**
 * POST /api/gitlab/commit
 * Commits provided JSON content to a GitLab repository.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, projectId, branch, filePath, content, commitMessage } = body;

        if (!token || !projectId || !filePath || !content) {
            return NextResponse.json({ error: "Missing required GitLab details for commit." }, { status: 400 });
        }

        const baseUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}`;
        const commitUrl = `${baseUrl}/repository/commits`;
        
        const commitPayload = {
            branch: branch || 'main',
            commit_message: commitMessage || 'AI Agent: Auto-healing test data update',
            actions: [
                {
                    action: 'update',
                    file_path: filePath,
                    content: typeof content === 'string' ? content : JSON.stringify(content, null, 2)
                }
            ]
        };

        const commitRes = await fetch(commitUrl, {
            method: 'POST',
            headers: {
                'PRIVATE-TOKEN': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(commitPayload)
        });

        if (!commitRes.ok) {
            const err = await commitRes.text();
            return NextResponse.json({ error: `Failed to commit changes to GitLab: ${commitRes.status}`, details: err }, { status: commitRes.status });
        }

        const result = await commitRes.json();

        return NextResponse.json({ 
            success: true, 
            commitHash: result.id,
            filePath
        });

    } catch (e: any) {
        console.error("GitLab Commit Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred during GitLab commit." }, { status: 500 });
    }
}
