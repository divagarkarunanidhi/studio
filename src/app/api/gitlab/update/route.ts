import { NextResponse } from 'next/server';

/**
 * POST /api/gitlab/update
 * Fetches a JSON file from GitLab and updates specific scenarios' data in memory.
 * Supports an array of scenarioNames to handle multiple repairs in one file.
 * Enhanced: Performs automated date-gap healing for OTM pick-up and delivery fields.
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
        let totalDatesHealed = 0;
        const normalizedTargetNames = scenarioNames.map(n => n.toLowerCase().trim());

        // Fields to check for the minimum 4-day gap sequence
        const dateFields = ["EARLYPICKUPDATE", "LATEPICKUPDATE", "EARLYDELIVERYDATE", "LATEDELIVERYDATE"];

        /**
         * Helper to recursively check and heal date gaps within a matched scenario object.
         */
        const healDatesInScenario = (obj: any) => {
            if (typeof obj !== 'object' || obj === null) return;

            if (Array.isArray(obj)) {
                // Check if this array contains OTM "KEY=VAL" strings
                let currentMinVal = -99999; 
                
                dateFields.forEach((field, fIdx) => {
                    const foundIdx = obj.findIndex((item: any) => typeof item === 'string' && (item.startsWith(field + "=") || item.startsWith(field + " =")));
                    if (foundIdx !== -1) {
                        const parts = obj[foundIdx].split('=');
                        const prefix = parts[0] + "=";
                        const val = parseInt(parts[1]);
                        
                        if (!isNaN(val)) {
                            if (fIdx === 0) {
                                currentMinVal = val;
                            } else {
                                const targetVal = currentMinVal + 4;
                                if (val < targetVal) {
                                    obj[foundIdx] = prefix + String(targetVal);
                                    totalDatesHealed++;
                                    currentMinVal = targetVal;
                                } else {
                                    currentMinVal = val;
                                }
                            }
                        }
                    }
                });
                // Recurse into array items
                obj.forEach(item => healDatesInScenario(item));
            } else {
                // Check direct object keys
                let currentMinVal = -99999;
                dateFields.forEach((field, fIdx) => {
                    if (obj[field] !== undefined) {
                        const rawVal = obj[field];
                        const valStr = String(rawVal);
                        
                        let numericPart = valStr;
                        let prefix = "";
                        if (valStr.includes('=')) {
                            const parts = valStr.split('=');
                            prefix = parts[0] + "=";
                            numericPart = parts[1];
                        }

                        const val = parseInt(numericPart);
                        if (!isNaN(val)) {
                            if (fIdx === 0) {
                                currentMinVal = val;
                            } else {
                                const targetVal = currentMinVal + 4;
                                if (val < targetVal) {
                                    obj[field] = prefix + String(targetVal);
                                    totalDatesHealed++;
                                    currentMinVal = targetVal;
                                } else {
                                    currentMinVal = val;
                                }
                            }
                        }
                    }
                });
                // Recurse into nested objects
                for (const key in obj) {
                    if (typeof obj[key] === 'object') healDatesInScenario(obj[key]);
                }
            }
        };

        // Recursive search and update function
        const updateAgentKey = (obj: any): boolean => {
            let localFound = false;
            if (Array.isArray(obj)) {
                for (let i = 0; i < obj.length; i++) {
                    if (typeof obj[i] === 'object' && obj[i] !== null) {
                        if (updateAgentKey(obj[i])) localFound = true;
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
                    
                    // Perform Date Gap Healing for the matched scenario
                    healDatesInScenario(obj);
                    
                    localFound = true;
                }

                for (const key in obj) {
                    if (typeof obj[key] === 'object' && obj[key] !== null) {
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
            datesHealedCount: totalDatesHealed,
            filePath,
            updatedContent: jsonContent 
        });

    } catch (e: any) {
        console.error("GitLab Update Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred during GitLab preparation." }, { status: 500 });
    }
}
