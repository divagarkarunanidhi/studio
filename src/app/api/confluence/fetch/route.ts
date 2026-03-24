
import { NextResponse } from 'next/server';

/**
 * POST /api/confluence/fetch
 * Attempts to fetch the latest HTML report from a Confluence instance.
 * Optimized for Cloud v2 APIs with robust path normalization.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { path: rawPath, pageId: providedPageId, user, password } = body;

        if (!rawPath || !user || !password) {
            return NextResponse.json({ error: "Configuration missing. Please check URL, Username, and Password/Token." }, { status: 400 });
        }

        const auth = Buffer.from(`${user}:${password}`).toString('base64');
        const headers = { 
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
            'X-Atlassian-Token': 'no-check' 
        };

        // Normalize the path
        let path = rawPath.trim();
        if (!path.startsWith('http')) {
            path = `https://${path}`;
        }

        let urlObj: URL;
        try {
            urlObj = new URL(path);
        } catch (e) {
            return NextResponse.json({ error: "Invalid URL format. Please provide a full URL including https://" }, { status: 400 });
        }

        const origin = urlObj.origin;
        // Determine if we are likely using a /wiki context (Standard for Cloud)
        const hasWikiPrefix = urlObj.pathname.startsWith('/wiki') || path.includes('.atlassian.net/wiki');
        const baseUrl = hasWikiPrefix ? `${origin}/wiki` : origin;

        // 1. Identify Page ID
        let pageId: string | null = providedPageId || null;
        
        if (!pageId) {
            const pageIdMatch = path.match(/pageId=(\d+)/) || path.match(/\/pages\/(\d+)(?:\/|$)/);
            if (pageIdMatch) {
                pageId = pageIdMatch[1];
            }
        }

        if (!pageId) {
            return NextResponse.json({ 
                error: "Could not identify Page ID. Please ensure your URL contains a numeric ID or provide it separately in the Page ID field." 
            }, { status: 400 });
        }

        /**
         * Define API endpoints to try. 
         * We construct them carefully to avoid double /wiki or missing /wiki.
         */
        const apiPaths = [
            // Cloud v2 (Preferred)
            `${baseUrl}/api/v2/pages/${pageId}/attachments?sort=-modified-date&limit=10`,
            // Cloud v1
            `${baseUrl}/rest/api/content/${pageId}/child/attachment?limit=20&sort=created`,
            // Fallback: No /wiki prefix (Sometimes used in custom domains)
            `${origin}/api/v2/pages/${pageId}/attachments?sort=-modified-date&limit=10`,
            `${origin}/rest/api/content/${pageId}/child/attachment?limit=20&sort=created`
        ];

        // Filter out duplicate paths if origin === baseUrl
        const uniquePaths = Array.from(new Set(apiPaths));

        let lastStatus = 0;
        let lastError = "No connection established";

        for (const apiPath of uniquePaths) {
            try {
                const listRes = await fetch(apiPath, { headers, signal: AbortSignal.timeout(15000) });
                lastStatus = listRes.status;
                
                const contentType = listRes.headers.get('content-type') || "";
                
                if (listRes.ok && contentType.includes('application/json')) {
                    const data = await listRes.json();
                    return await processAttachments(data, origin, baseUrl, headers);
                } 
                
                if (listRes.status === 401) {
                    return NextResponse.json({ error: "Unauthorized (401): Please verify your Email and API Token. Note: Confluence Cloud requires an API Token, not your password." }, { status: 401 });
                }

                const errorBody = await listRes.text();
                lastError = errorBody.substring(0, 200) || listRes.statusText;
                
            } catch (err: any) {
                lastError = err.message || "Network request failed";
            }
        }

        const detailedMsg = lastStatus === 404 
            ? `Page ID ${pageId} was not found (404) at the expected API endpoints. Check if your Domain URL includes '/wiki' correctly or if your account has 'View' permissions for this page.`
            : `Failed to fetch from Confluence API. (Status: ${lastStatus}). Details: ${lastError}`;

        return NextResponse.json({ error: detailedMsg }, { status: 502 });

    } catch (e: any) {
        console.error("Confluence Fetch Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred during fetch." }, { status: 500 });
    }
}

/**
 * Helper to process the list of attachments and download the latest HTML file.
 */
async function processAttachments(data: any, origin: string, baseUrl: string, headers: any) {
    const attachments = data.results || [];

    if (attachments.length === 0) {
        throw new Error("No attachments found on the specified Confluence page.");
    }

    // Find the latest attachment ending in .html
    const latestHtml = attachments
        .filter((a: any) => {
            const title = a.title || a.name || "";
            return title.toLowerCase().endsWith('.html');
        })
        .sort((a: any, b: any) => {
            const dateA = new Date(a.modifiedAt || a.createdAt || a.history?.createdDate || 0).getTime();
            const dateB = new Date(b.modifiedAt || b.createdAt || b.history?.createdDate || 0).getTime();
            return dateB - dateA;
        })[0];

    if (!latestHtml) {
        throw new Error("No HTML attachments found on the page. Please upload a .html report to the page first.");
    }

    // Determine the download link
    const downloadRelativeUrl = latestHtml.downloadLink || latestHtml._links?.download || latestHtml._links?.content;
    
    if (!downloadRelativeUrl) {
        throw new Error("Could not find a valid download link for the identified attachment.");
    }

    // Build the full download URL carefully
    let downloadUrl = downloadRelativeUrl;
    if (!downloadUrl.startsWith('http')) {
        // If the link starts with /wiki but our baseUrl already ends with /wiki, don't double it
        if (downloadUrl.startsWith('/wiki') && baseUrl.endsWith('/wiki')) {
            downloadUrl = `${origin}${downloadUrl}`;
        } else {
            downloadUrl = `${baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl}${downloadUrl.startsWith('/') ? downloadUrl : '/' + downloadUrl}`;
        }
    }
    
    const contentRes = await fetch(downloadUrl, { 
        headers: { ...headers, 'Accept': '*/*' }, 
        signal: AbortSignal.timeout(20000) 
    });
    
    if (!contentRes.ok) {
        throw new Error(`Failed to download report content: ${contentRes.status} ${contentRes.statusText}`);
    }

    const content = await contentRes.text();

    return NextResponse.json({ 
        success: true, 
        fileName: latestHtml.title || latestHtml.name, 
        content 
    });
}
