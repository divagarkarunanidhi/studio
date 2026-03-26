
import { NextResponse } from 'next/server';

/**
 * POST /api/gitlab/update
 * Fetches a JSON file from GitLab and updates a specific scenario's data in memory.
 * Returns the updated JSON for preview/preparation.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, projectId, branch, filePath, scenarioName } = body;

        if (!token || !projectId || !filePath || !scenarioName) {
            return NextResponse.json({ error: "Missing required GitLab configuration or file details." }, { status: 400 });
        }

        const encodedFilePath = encodeURIComponent(filePath);
        const baseUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}`;
        const fileUrl = `${baseUrl}/repository/files/${encodedFilePath}?ref=${branch || 'main'}`;

        const fetchRes = await fetch(fileUrl, {
            headers: { 'PRIVATE-TOKEN': token }
        });

        if (!fetchRes.ok) {
            const err = await fetchRes.text();
            return NextResponse.json({ error: `Failed to fetch file from GitLab: ${fetchRes.status}`, details: err }, { status: fetchRes.status });
        }

        const fileData = await fetchRes.json();
        const rawContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
        
        let jsonContent;
        try {
            jsonContent = JSON.parse(rawContent);
        } catch (e) {
            return NextResponse.json({ error: "The test data file is not valid JSON." }, { status: 422 });
        }

        let updated = false;
        const targetName = scenarioName.toLowerCase().trim();

        // Recursive search and update function
        const updateAgentKey = (obj: any): boolean => {
            let found = false;
            if (Array.isArray(obj)) {
                for (let i = 0; i < obj.length; i++) {
                    const item = obj[i];
                    const nameInJson = (item.scenarioName || item.name || item.Scenario || "").toLowerCase().trim();
                    
                    if (nameInJson && (nameInJson === targetName || targetName.includes(nameInJson) && nameInJson.length > 5)) {
                        obj[i] = { ...item, Agent: "found" };
                        found = true;
                    } else if (typeof item === 'object') {
                        if (updateAgentKey(item)) found = true;
                    }
                }
            } else if (typeof obj === 'object' && obj !== null) {
                // Check if this object itself is the scenario
                const nameInJson = (obj.scenarioName || obj.name || obj.Scenario || "").toLowerCase().trim();
                if (nameInJson && (nameInJson === targetName || targetName.includes(nameInJson) && nameInJson.length > 5)) {
                    obj.Agent = "found";
                    found = true;
                }

                // Check children
                for (const key in obj) {
                    if (key.toLowerCase().trim() === targetName) {
                        if (typeof obj[key] === 'object' && obj[key] !== null) {
                            obj[key].Agent = "found";
                            found = true;
                        }
                    } else if (typeof obj[key] === 'object') {
                        if (updateAgentKey(obj[key])) found = true;
                    }
                }
            }
            return found;
        };

        updated = updateAgentKey(jsonContent);

        if (!updated) {
            return NextResponse.json({ 
                error: `Scenario '${scenarioName}' not found in the test data file.`, 
                updated: false,
                content: jsonContent 
            });
        }

        return NextResponse.json({ 
            success: true, 
            updated: true, 
            filePath,
            updatedContent: jsonContent 
        });

    } catch (e: any) {
        console.error("GitLab Update Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred during GitLab preparation." }, { status: 500 });
    }
}
