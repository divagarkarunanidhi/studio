
import { NextResponse } from 'next/server';

/**
 * POST /api/gitlab/process
 * Fetches a JSON test data file from GitLab, updates a specific scenario's data,
 * and commits the change back to the repository.
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

        // 1. Fetch the file content
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

        // 2. Search and Update the scenario in JSON
        // Note: This logic assumes the JSON structure is either an object with scenario keys
        // or an array of objects where one of the fields matches the scenario name.
        let updated = false;

        if (Array.isArray(jsonContent)) {
            // Find in array
            jsonContent = jsonContent.map(item => {
                const nameInJson = item.scenarioName || item.name || item.Scenario || "";
                if (nameInJson === scenarioName || scenarioName.includes(nameInJson) && nameInJson.length > 5) {
                    updated = true;
                    return { ...item, Agent: "found" };
                }
                return item;
            });
        } else if (typeof jsonContent === 'object') {
            // Check direct keys or inner fields
            if (jsonContent[scenarioName]) {
                jsonContent[scenarioName].Agent = "found";
                updated = true;
            } else {
                // Iterative search
                for (const key in jsonContent) {
                    if (key === scenarioName || scenarioName.includes(key) && key.length > 5) {
                        if (typeof jsonContent[key] === 'object' && jsonContent[key] !== null) {
                            jsonContent[key].Agent = "found";
                            updated = true;
                        }
                        break;
                    }
                }
            }
        }

        if (!updated) {
            return NextResponse.json({ error: `Scenario '${scenarioName}' not found in the test data file.`, updated: false });
        }

        // 3. Commit the change back to GitLab
        const commitUrl = `${baseUrl}/repository/commits`;
        const updatedContentString = JSON.stringify(jsonContent, null, 2);
        const commitPayload = {
            branch: branch || 'main',
            commit_message: `AI Agent: Auto-healing test data for scenario '${scenarioName}'`,
            actions: [
                {
                    action: 'update',
                    file_path: filePath,
                    content: updatedContentString
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

        return NextResponse.json({ 
            success: true, 
            updated: true, 
            filePath,
            updatedContent: jsonContent // Return the updated object for preview
        });

    } catch (e: any) {
        console.error("GitLab Process Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred during GitLab sync." }, { status: 500 });
    }
}
