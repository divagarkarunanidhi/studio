import { NextResponse } from 'next/server';

/**
 * POST /api/jira/search-defects
 * Searches Jira for existing defects linked to the given failed scenario names.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { jiraLink, jiraUser, jiraApiToken, jiraProjectKey, scenarioNames } = body;

        if (!jiraLink || !jiraUser || !jiraApiToken || !jiraProjectKey) {
            return NextResponse.json({ error: "Jira configuration is incomplete." }, { status: 400 });
        }

        if (!scenarioNames || !Array.isArray(scenarioNames) || scenarioNames.length === 0) {
            return NextResponse.json({ error: "No scenario names provided." }, { status: 400 });
        }

        const auth = Buffer.from(`${jiraUser}:${jiraApiToken}`).toString('base64');
        const headers: Record<string, string> = {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };

        const baseUrl = jiraLink.replace(/\/+$/, '');
        const defects: Array<{
            key: string;
            summary: string;
            status: string;
            assignee: string | null;
            priority: string;
            scenarioName: string;
        }> = [];

        // Search for each scenario name in Jira issue summaries/descriptions
        for (const scenarioName of scenarioNames) {
            // 1. Check if the scenario name contains Jira issue keys (e.g. TSTAUTO-29240)
            //    and fetch their linked defects via issue links
            const jiraKeyMatches = scenarioName.match(/[A-Z]{1,10}-\d+/gi) || [];
            const uniqueKeys = [...new Set(jiraKeyMatches.map((k: string) => k.toUpperCase()))];
            
            for (const jiraKey of uniqueKeys) {
                try {
                    const issueUrl = `${baseUrl}/rest/api/2/issue/${jiraKey}?fields=issuelinks,summary`;
                    const issueRes = await fetch(issueUrl, {
                        headers,
                        signal: AbortSignal.timeout(15000)
                    });

                    if (issueRes.ok) {
                        const issueData = await issueRes.json();
                        const issueLinks = issueData.fields?.issuelinks || [];

                        for (const link of issueLinks) {
                            // Check both inward and outward linked issues
                            const linkedIssue = link.inwardIssue || link.outwardIssue;
                            if (!linkedIssue) continue;

                            const issueType = linkedIssue.fields?.issuetype?.name?.toLowerCase() || '';
                            const linkTypeName = link.type?.name?.toLowerCase() || '';

                            // Include if issue type is Bug or link type is "Defect", exclude Done status
                            const issueStatus = linkedIssue.fields?.status?.statusCategory?.key?.toLowerCase() || '';
                            if ((issueType === 'bug' || linkTypeName === 'defect') && issueStatus !== 'done') {
                                if (!defects.some(d => d.key === linkedIssue.key && d.scenarioName === scenarioName)) {
                                    defects.push({
                                        key: linkedIssue.key,
                                        summary: linkedIssue.fields?.summary || '',
                                        status: linkedIssue.fields?.status?.name || 'Unknown',
                                        assignee: linkedIssue.fields?.assignee?.displayName || null,
                                        priority: linkedIssue.fields?.priority?.name || 'None',
                                        scenarioName
                                    });
                                }
                            }
                        }
                    }
                } catch {
                    // Continue with text search if issue link fetch fails
                }
            }

            // 2. Text-based JQL search as fallback/supplement
            const sanitized = scenarioName.replace(/[\\"\[\]{}()+\-&|!~*?:^/]/g, ' ').trim();
            if (!sanitized) continue;

            // Extract meaningful keywords (drop short/common words) for broader matching
            const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'is', 'in', 'to', 'of', 'for', 'on', 'at', 'by', 'with', 'from', 'after', 'before', 'should', 'that', 'this', 'it', 'be', 'not']);
            const keywords = sanitized
                .replace(/_/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));

            const queries: string[] = [];

            // Extract test case identifiers like GR_13, TC_1, etc.
            const idMatch = scenarioName.match(/[A-Z]{1,10}[_-]\d+/i);
            if (idMatch) {
                queries.push(`project = "${jiraProjectKey}" AND type = Bug AND statusCategory != Done AND (summary ~ "${idMatch[0]}" OR description ~ "${idMatch[0]}") ORDER BY created DESC`);
            }

            // Use top keywords (up to 6) joined for text search
            if (keywords.length > 0) {
                const keyTerms = keywords.slice(0, 6).join(' ');
                const searchTerm = keyTerms.length > 80 ? keyTerms.substring(0, 80) : keyTerms;
                queries.push(`project = "${jiraProjectKey}" AND type = Bug AND statusCategory != Done AND (summary ~ "${searchTerm}" OR description ~ "${searchTerm}") ORDER BY created DESC`);
            }

            for (const jql of queries) {
                try {
                    const searchUrl = `${baseUrl}/rest/api/2/search`;
                    const res = await fetch(searchUrl, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            jql,
                            maxResults: 5,
                            fields: ['summary', 'status', 'assignee', 'priority']
                        }),
                        signal: AbortSignal.timeout(15000)
                    });

                    if (res.ok) {
                        const data = await res.json();
                        if (data.issues && data.issues.length > 0) {
                            for (const issue of data.issues) {
                                if (!defects.some(d => d.key === issue.key && d.scenarioName === scenarioName)) {
                                    defects.push({
                                        key: issue.key,
                                        summary: issue.fields?.summary || '',
                                        status: issue.fields?.status?.name || 'Unknown',
                                        assignee: issue.fields?.assignee?.displayName || null,
                                        priority: issue.fields?.priority?.name || 'None',
                                        scenarioName
                                    });
                                }
                            }
                        }
                    }
                } catch {
                    // Skip individual failures silently to continue searching other scenarios
                }
            }
        }

        return NextResponse.json({ success: true, defects });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Internal server error." }, { status: 500 });
    }
}
