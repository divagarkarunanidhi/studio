import { NextResponse } from 'next/server';
import { getGitlabDispatcher } from '@/lib/gitlab-fetch';

/**
 * POST /api/gitlab/update
 * Fetches a JSON file from GitLab and updates specific scenarios' data in memory.
 * Supports an array of scenarioNames to handle multiple repairs in one file.
 * Enhanced: Performs automated date-gap healing for OTM pick-up and delivery fields.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, projectId, branch, filePath, scenarioNames, baseUrl: rawBaseUrl, insecureTls, rateRecords } = body;

        if (!token || !projectId || !filePath || !scenarioNames || !Array.isArray(scenarioNames)) {
            return NextResponse.json({ error: "Missing required GitLab configuration or scenario names list." }, { status: 400 });
        }

        const encodedFilePath = encodeURIComponent(filePath);
        const host = (rawBaseUrl && typeof rawBaseUrl === 'string' && rawBaseUrl.trim())
            ? rawBaseUrl.trim().replace(/\/+$/, '')
            : 'https://gitlab.com';
        const baseUrl = `${host}/api/v4/projects/${encodeURIComponent(projectId)}`;
        const fileUrl = `${baseUrl}/repository/files/${encodedFilePath}?ref=${branch || 'main'}`;

        const fetchRes = await fetch(fileUrl, {
            headers: { 'PRIVATE-TOKEN': token },
            // @ts-expect-error - undici dispatcher is supported by Node fetch
            dispatcher: getGitlabDispatcher({ insecureTls: !!insecureTls }),
        });

        if (!fetchRes.ok) {
            const err = await fetchRes.text();
            return NextResponse.json({ error: `Failed to fetch file from GitLab: ${fetchRes.status}`, details: err }, { status: fetchRes.status });
        }

        const fileData = await fetchRes.json();
        const rawContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
        
        // Strip single-line (//) and multi-line (/* */) comments that are invalid in JSON
        const stripComments = (str: string) => {
            let result = str
                .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\r\n]*/g, (match, quoted) => quoted || '')
                .replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\//g, (match, quoted) => quoted || '');
            // Remove trailing commas before } or ] (left behind after stripping commented lines)
            result = result.replace(/,\s*([}\]])/g, '$1');
            // Remove blank lines left behind
            result = result.replace(/^\s*[\r\n]/gm, '');
            return result;
        };

        let jsonContent;
        try {
            jsonContent = JSON.parse(rawContent);
        } catch {
            // Retry after stripping comments
            try {
                const cleaned = stripComments(rawContent);
                jsonContent = JSON.parse(cleaned);
                console.warn('Test data file contained comments - parsed after stripping them.');
            } catch (e2: any) {
                let lineInfo = '';
                const posMatch = e2?.message?.match(/position\s+(\d+)/i);
                if (posMatch) {
                    const pos = parseInt(posMatch[1]);
                    const lines = rawContent.substring(0, pos).split('\n');
                    const lineNum = lines.length;
                    const colNum = lines[lines.length - 1].length + 1;
                    lineInfo = ` (Line ${lineNum}, Column ${colNum})`;
                }
                const errorMsg = `The test data file is not valid JSON${lineInfo}: ${e2?.message || 'Unknown parse error'}`;
                console.error('JSON parse error for test data file:', errorMsg);
                return NextResponse.json({ error: errorMsg }, { status: 422 });
            }
        }

        let totalUpdated = 0;
        let totalDatesHealed = 0;
        const scenarioHealDetails: { name: string; datesHealed: string[]; datesCorrect: string[] }[] = [];
        
        // Clean and prepare target names for robust matching
        const cleanName = (name: string) => name.toLowerCase().replace(/^scenario\s+\d+:\s*/, '').trim();
        const normalizedTargetNames = scenarioNames.map(n => cleanName(n));

        const isMatch = (jsonName: any) => {
            if (typeof jsonName !== 'string') return false;
            const target = cleanName(jsonName);
            if (!target) return false;
            
            return normalizedTargetNames.some(reportName => {
                return target === reportName || 
                       (target.length > 5 && reportName.includes(target)) ||
                       (reportName.length > 5 && target.includes(reportName));
            });
        };

        // Fields to check for the minimum 4-day gap sequence
        const dateFields = ["EARLYPICKUPDATE", "LATEPICKUPDATE", "EARLYDELIVERYDATE", "LATEDELIVERYDATE"];

        /**
         * Helper to recursively check and heal date gaps within a matched scenario object.
         * Returns { datesHealed: string[], datesCorrect: string[] } for logging.
         */
        const healDatesInScenario = (obj: any, details?: { datesHealed: string[]; datesCorrect: string[] }) => {
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
                                if (details) details.datesCorrect.push(`${field}=${val}`);
                            } else {
                                const targetVal = currentMinVal + 4;
                                if (val < targetVal) {
                                    obj[foundIdx] = prefix + String(targetVal);
                                    totalDatesHealed++;
                                    if (details) details.datesHealed.push(`${field}: ${val} -> ${targetVal}`);
                                    currentMinVal = targetVal;
                                } else {
                                    currentMinVal = val;
                                    if (details) details.datesCorrect.push(`${field}=${val}`);
                                }
                            }
                        }
                    }
                });
                // Recurse into array items
                obj.forEach(item => healDatesInScenario(item, details));
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
                                if (details) details.datesCorrect.push(`${field}=${val}`);
                            } else {
                                const targetVal = currentMinVal + 4;
                                if (val < targetVal) {
                                    obj[field] = prefix + String(targetVal);
                                    totalDatesHealed++;
                                    if (details) details.datesHealed.push(`${field}: ${val} -> ${targetVal}`);
                                    currentMinVal = targetVal;
                                } else {
                                    currentMinVal = val;
                                    if (details) details.datesCorrect.push(`${field}=${val}`);
                                }
                            }
                        }
                    }
                });
                // Recurse into nested objects
                for (const key in obj) {
                    if (key !== 'Agent' && typeof obj[key] === 'object') healDatesInScenario(obj[key], details);
                }
            }
        };

        // Recursive search and update function with fuzzy key support
        // Build rate record lookup from the optional rateRecords parameter
        const rateEntries: [string, string][] = (rateRecords && typeof rateRecords === 'object') ? Object.entries(rateRecords) : [];
        let rateRecordInjected = 0;

        const findRateRecord = (jsonName: string): string | null => {
            if (rateEntries.length === 0) return null;
            const target = cleanName(jsonName);
            if (!target) return null;
            const matched = rateEntries.find(([sName]) => {
                const rateName = cleanName(sName);
                return rateName === target || 
                       (rateName.length > 5 && target.includes(rateName)) ||
                       (target.length > 5 && rateName.includes(target));
            });
            return matched ? matched[1] : null;
        };

        const updateAgentKey = (obj: any): boolean => {
            let localFound = false;
            if (!obj || typeof obj !== 'object') return false;

            if (Array.isArray(obj)) {
                for (let i = 0; i < obj.length; i++) {
                    if (updateAgentKey(obj[i])) localFound = true;
                }
            } else {
                // 1. Check if this object itself has matching scenario-related fields
                const nameInJson = obj.scenarioName || obj.name || obj.Scenario || obj.ID || "";
                if (isMatch(nameInJson)) {
                    totalUpdated++;
                    const detail = { name: nameInJson, datesHealed: [] as string[], datesCorrect: [] as string[] };
                    healDatesInScenario(obj, detail);
                    if (detail.datesHealed.length > 0 || detail.datesCorrect.length > 0) {
                        scenarioHealDetails.push(detail);
                    }
                    // Inject rate record if available
                    const rr = findRateRecord(nameInJson);
                    if (rr) {
                        obj['Update Value in Constraints tab'] = 'Yes';
                        obj['Rate Record ID'] = rr;
                        rateRecordInjected++;
                    }
                    localFound = true;
                }

                // 2. Check keys of this object (Common OTM JSON structure where Scenario Name is the Key)
                for (const key in obj) {
                    const value = obj[key];
                    
                    if (isMatch(key)) {
                        if (typeof value === 'object' && value !== null) {
                            if (Array.isArray(value)) {
                                totalUpdated++;
                                const detail = { name: key, datesHealed: [] as string[], datesCorrect: [] as string[] };
                                healDatesInScenario(value, detail);
                                if (detail.datesHealed.length > 0 || detail.datesCorrect.length > 0) {
                                    scenarioHealDetails.push(detail);
                                }
                                // Inject rate record as array entries
                                const rr = findRateRecord(key);
                                if (rr) {
                                    const constraintIdx = value.findIndex((item: any) => typeof item === 'string' && item.startsWith('Update Value in Constraints tab='));
                                    if (constraintIdx === -1) {
                                        value.push('Update Value in Constraints tab=Yes');
                                    } else {
                                        value[constraintIdx] = 'Update Value in Constraints tab=Yes';
                                    }
                                    const rrIdx = value.findIndex((item: any) => typeof item === 'string' && item.startsWith('Rate Record ID='));
                                    if (rrIdx === -1) {
                                        value.push(`Rate Record ID=${rr}`);
                                    } else {
                                        value[rrIdx] = `Rate Record ID=${rr}`;
                                    }
                                    rateRecordInjected++;
                                }
                            } else {
                                // For object values: set properties directly
                                totalUpdated++;
                                const detail = { name: key, datesHealed: [] as string[], datesCorrect: [] as string[] };
                                healDatesInScenario(value, detail);
                                if (detail.datesHealed.length > 0 || detail.datesCorrect.length > 0) {
                                    scenarioHealDetails.push(detail);
                                }
                                // Inject rate record if available
                                const rr = findRateRecord(key);
                                if (rr) {
                                    value['Update Value in Constraints tab'] = 'Yes';
                                    value['Rate Record ID'] = rr;
                                    rateRecordInjected++;
                                }
                            }
                            localFound = true;
                        }
                    }
                    
                    // Recursively check inner objects/arrays
                    if (typeof value === 'object' && value !== null) {
                        if (updateAgentKey(value)) localFound = true;
                    }
                }
            }
            return localFound;
        };

        updateAgentKey(jsonContent);

        console.log(`GitLab Update: ${totalUpdated} scenarios updated, ${totalDatesHealed} dates healed, ${rateRecordInjected} rate records injected. Rate entries provided: ${rateEntries.length}`);

        if (totalUpdated === 0) {
            return NextResponse.json({ 
                error: `None of the scenarios were found or updated in the test data file. (Searched for: ${normalizedTargetNames.join(', ')})`, 
                updated: false,
                content: jsonContent 
            });
        }

        return NextResponse.json({ 
            success: true, 
            updated: true, 
            updateCount: totalUpdated,
            datesHealedCount: totalDatesHealed,
            rateRecordInjected,
            scenarioHealDetails,
            filePath,
            updatedContent: jsonContent 
        });

    } catch (e: any) {
        console.error("GitLab Update Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred during GitLab preparation." }, { status: 500 });
    }
}
