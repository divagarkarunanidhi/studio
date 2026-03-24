import { NextResponse } from 'next/server';

/**
 * POST /api/confluence/fetch
 * Attempts to fetch the latest HTML report from a Confluence instance.
 * Handles both direct attachment links and page URLs with specific v2 Cloud API support.
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
            'Accept': 'application/json',
            'X-Atlassian-Token': 'no-check' // Helps bypass some XSRF checks
        };

        let urlObj: URL;
        try {
            urlObj = new URL(path);
        } catch (e) {
            return NextResponse.json({ error: "Invalid URL format. Please provide a full URL including https://" }, { status: 400 });
        }

        const baseUrl = urlObj.origin;

        // 1. Check if path is a direct link to an HTML file
        if (urlObj.pathname.toLowerCase().endsWith('.html')) {
            const res = await fetch(path, { headers, signal: AbortSignal.timeout(15000) });
            if (res.ok) {
                const content = await res.text();
                const fileName = urlObj.pathname.split('/').pop() || 'latest_report.html';
                return NextResponse.json({ success: true, fileName, content });
            }
        }

        // 2. Identify Page ID from the URL
        let pageId: string | null = null;
        const pageIdMatch = path.match(/pageId=(\d+)/) || path.match(/\/pages\/(\d+)(?:\/|$)/);
        
        if (pageIdMatch) {
            pageId = pageIdMatch[1];
        }

        if (!pageId) {
            return NextResponse.json({ 
                error: "Could not identify Page ID from the URL. Please ensure your URL contains a numeric ID (e.g., .../pages/123456)." 
            }, { status: 400 });
        }

        /**
         * Define API endpoints to try in order of preference.
         * We include variants for both Cloud (with /wiki) and Server/DC.
         */
        const apiPaths = [
            `${baseUrl}/wiki/api/v2/pages/${pageId}/attachments?sort=-modified-date&limit=10`,
            `${baseUrl}/api/v2/pages/${pageId}/attachments?sort=-modified-date&limit=10`,
            `${baseUrl}/wiki/rest/api/content/${pageId}/child/attachment?limit=20&sort=created`,
            `${baseUrl}/rest/api/content/${pageId}/child/attachment?limit=20&sort=created`
        ];

        let lastStatus = 0;
        let lastError = "No connection established";

        for (const apiPath of apiPaths) {
            try {
                const listRes = await fetch(apiPath, { headers, signal: AbortSignal.timeout(10000) });
                lastStatus = listRes.status;
                
                const contentType = listRes.headers.get('content-type') || "";
                
                if (listRes.ok && contentType.includes('application/json')) {
                    const data = await listRes.json();
                    return await processAttachments(data, baseUrl, headers);
                } 
                
                if (listRes.status === 401) {
                    return NextResponse.json({ error: "Unauthorized: Please verify Username and API Token (Cloud) or Password (Server)." }, { status: 401 });
                }

                if (listRes.status === 403) {
                    return NextResponse.json({ error: "Forbidden: You don't have permission to access attachments on this page." }, { status: 403 });
                }

                // If it's not JSON, read as text to get error details (prevents "Unexpected end of JSON" error)
                const errorBody = await listRes.text();
                lastError = errorBody.substring(0, 200) || listRes.statusText;
                
            } catch (err: any) {
                lastError = err.message || "Network request failed";
            }
        }

        return NextResponse.json({ 
            error: `Failed to fetch from Confluence API. (Status: ${lastStatus}). Details: ${lastError}` 
        }, { status: 502 });

    } catch (e: any) {
        console.error("Confluence Fetch Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred during fetch." }, { status: 500 });
    }
}

/**
 * Helper to process the list of attachments and download the latest HTML file.
 * Handles both v1 and v2 API response formats.
 */
async function processAttachments(data: any, baseUrl: string, headers: any) {
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
            // Priority: v2 modifiedAt -> v1 history.createdDate -> fallback 0
            const dateA = new Date(a.modifiedAt || a.createdAt || a.history?.createdDate || 0).getTime();
            const dateB = new Date(b.modifiedAt || b.createdAt || b.history?.createdDate || 0).getTime();
            return dateB - dateA;
        })[0];

    if (!latestHtml) {
        throw new Error("No HTML attachments found on the page. Please upload a .html report to the page first.");
    }

    // Determine the download link
    // Cloud V2 uses 'downloadLink', V1 uses '_links.download'
    const downloadRelativeUrl = latestHtml.downloadLink || latestHtml._links?.download || latestHtml._links?.content;
    
    if (!downloadRelativeUrl) {
        throw new Error("Could not find a valid download link for the identified attachment.");
    }

    // Build the full download URL
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
        fileName: latestHtml.title || latestHtml.name, 
        content 
    });
}
