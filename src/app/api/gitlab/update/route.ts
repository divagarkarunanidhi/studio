import { NextResponse } from 'next/server';

/**
 * POST /api/gitlab/update
 * Fetches a JSON file from GitLab and updates specific scenarios' data in memory.
 * Now supports an array of scenarioNames to handle multiple repairs in one file.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, projectId, branch, filePath, scenarioNames } = body;

        if (!token || !projectId || !filePath || !scenarioNames || !Array.isArray(scenarioNames)) {
            return NextResponse.json({ error: "Missing required GitLab configuration or scenario names list." }, { status: 400 });
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

        let totalUpdated = 0;
        const normalizedTargetNames = scenarioNames.map(n => n.toLowerCase().trim());

        // Recursive search and update function
        const updateAgentKey = (obj: any): boolean => {
            let localFound = false;
            if (Array.isArray(obj)) {
                for (let i = 0; i < obj.length; i++) {
                    const item = obj[i];
                    const nameInJson = (item.scenarioName || item.name || item.Scenario || "").toLowerCase().trim();
                    
                    const isMatch = normalizedTargetNames.some(target => 
                        nameInJson === target || (target.includes(nameInJson) && nameInJson.length > 5)
                    );

                    if (nameInJson && isMatch) {
                        if (obj[i].Agent !== "found") {
                            obj[i] = { ...item, Agent: "found" };
                            totalUpdated++;
                        }
                        localFound = true;
                    } else if (typeof item === 'object') {
                        if (updateAgentKey(item)) localFound = true;
                    }
                }
            } else if (typeof obj === 'object' && obj !== null) {
                const nameInJson = (obj.scenarioName || obj.name || obj.Scenario || "").toLowerCase().trim();
                const isMatch = normalizedTargetNames.some(target => 
                    nameInJson === target || (target.includes(nameInJson) && nameInJson.length > 5)
                );

                if (nameInJson && isMatch) {
                    if (obj.Agent !== "found") {
                        obj.Agent = "found";
                        totalUpdated++;
                    }
                    localFound = true;
                }

                for (const key in obj) {
                    const keyLower = key.toLowerCase().trim();
                    const isKeyMatch = normalizedTargetNames.some(target => keyLower === target);

                    if (isKeyMatch) {
                        if (typeof obj[key] === 'object' && obj[key] !== null) {
                            if (obj[key].Agent !== "found") {
                                obj[key].Agent = "found";
                                totalUpdated++;
                            }
                            localFound = true;
                        }
                    } else if (typeof obj[key] === 'object') {
                        if (updateAgentKey(obj[key])) localFound = true;
                    }
                }
            }
            return localFound;
        };

        updateAgentKey(jsonContent);

        if (totalUpdated === 0) {
            return NextResponse.json({ 
                error: `None of the scenarios were found or updated in the test data file.`, 
                updated: false,
                content: jsonContent 
            });
        }

        return NextResponse.json({ 
            success: true, 
            updated: true, 
            updateCount: totalUpdated,
            filePath,
            updatedContent: jsonContent 
        });

    } catch (e: any) {
        console.error("GitLab Update Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred during GitLab preparation." }, { status: 500 });
    }
}
