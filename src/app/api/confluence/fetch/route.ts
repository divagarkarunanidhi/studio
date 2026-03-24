import { NextResponse } from 'next/server';

/**
 * POST /api/confluence/fetch
 * Attempts to fetch the latest HTML report from a Confluence instance.
 * Handles both direct attachment links and page URLs.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { path, user, password } = body;

        if (!path || !user || !password) {
            return NextResponse.json({ error: "Configuration missing. Please check URL, Username, and Password/Token." }, { status: 400 });
        }

        const auth = Buffer.from(`${user}:${password}`).toString('base64');
        const headers = { 
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json'
        };

        let urlObj: URL;
        try {
            urlObj = new URL(path);
        } catch (e) {
            return NextResponse.json({ error: "Invalid URL format. Please provide a full URL including https://" }, { status: 400 });
        }

        // 1. Check if path is a direct link to an HTML file (ignoring query params)
        if (urlObj.pathname.toLowerCase().endsWith('.html')) {
            const res = await fetch(path, { headers, signal: AbortSignal.timeout(15000) });
            if (res.ok) {
                const content = await res.text();
                const fileName = urlObj.pathname.split('/').pop() || 'latest_report.html';
                return NextResponse.json({ success: true, fileName, content });
            }
        }

        // 2. Assume path is a Confluence Page URL and try to find the latest HTML attachment via REST API
        let pageId: string | null = null;
        const pageIdMatch = path.match(/pageId=(\d+)/) || path.match(/\/pages\/(\d+)(?:\/|$)/);
        
        if (pageIdMatch) {
            pageId = pageIdMatch[1];
        }

        if (!pageId) {
            return NextResponse.json({ 
                error: "Could not identify Page ID from the URL. Ensure the URL contains a numeric ID (e.g., /pages/123456)." 
            }, { status: 400 });
        }

        const baseUrl = urlObj.origin;
        
        // Try standard Cloud path first
        const apiPaths = [
            `${baseUrl}/wiki/rest/api/content/${pageId}/child/attachment?limit=20&sort=created`,
            `${baseUrl}/rest/api/content/${pageId}/child/attachment?limit=20&sort=created`
        ];

        let lastError = "Confluence API error";

        for (const apiPath of apiPaths) {
            try {
                const listRes = await fetch(apiPath, { headers, signal: AbortSignal.timeout(10000) });
                const contentType = listRes.headers.get('content-type');
                
                if (listRes.ok && contentType?.includes('application/json')) {
                    const data = await listRes.json();
                    return await processAttachments(data, baseUrl, headers);
                } else if (listRes.status === 401) {
                    return NextResponse.json({ error: "Unauthorized: Please verify your Username and API Token/Password." }, { status: 401 });
                } else if (listRes.status === 403) {
                    return NextResponse.json({ error: "Forbidden: You don't have permission to access attachments on this page." }, { status: 403 });
                }
                
                lastError = `API endpoint ${apiPath} returned ${listRes.status} ${listRes.statusText}`;
            } catch (err: any) {
                lastError = err.message || "Network request failed";
            }
        }

        return NextResponse.json({ error: `Failed to connect to Confluence API: ${lastError}` }, { status: 502 });

    } catch (e: any) {
        console.error("Confluence Fetch Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred during fetch." }, { status: 500 });
    }
}

/**
 * Helper to process the list of attachments and download the latest HTML file.
 */
async function processAttachments(data: any, baseUrl: string, headers: any) {
    const attachments = data.results || [];

    // Find the latest attachment ending in .html
    const latestHtml = attachments
        .filter((a: any) => a.title.toLowerCase().endsWith('.html'))
        .sort((a: any, b: any) => {
            const dateA = new Date(a.history?.createdDate || 0).getTime();
            const dateB = new Date(b.history?.createdDate || 0).getTime();
            return dateB - dateA;
        })[0];

    if (!latestHtml) {
        throw new Error("No HTML attachments found on the specified Confluence page. Please upload a .html report to the page first.");
    }

    // Download the content of the identified attachment
    const downloadRelativeUrl = latestHtml._links?.download || latestHtml._links?.content;
    if (!downloadRelativeUrl) {
        throw new Error("Could not find a valid download link for the attachment.");
    }

    const downloadUrl = downloadRelativeUrl.startsWith('http') ? downloadRelativeUrl : `${baseUrl}${downloadRelativeUrl}`;
    const contentRes = await fetch(downloadUrl, { 
        headers: { ...headers, 'Accept': '*/*' }, 
        signal: AbortSignal.timeout(15000) 
    });
    
    if (!contentRes.ok) {
        throw new Error(`Failed to download report content: ${contentRes.status} ${contentRes.statusText}`);
    }

    const content = await contentRes.text();

    return NextResponse.json({ 
        success: true, 
        fileName: latestHtml.title, 
        content 
    });
}
