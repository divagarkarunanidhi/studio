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
            return NextResponse.json({ error: "Configuration missing." }, { status: 400 });
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
            return NextResponse.json({ error: "Invalid URL format." }, { status: 400 });
        }

        // 1. Check if path is a direct link to an HTML file (ignoring query params)
        if (urlObj.pathname.toLowerCase().endsWith('.html')) {
            const res = await fetch(path, { headers });
            if (res.ok) {
                const content = await res.text();
                const fileName = urlObj.pathname.split('/').pop() || 'latest_report.html';
                return NextResponse.json({ success: true, fileName, content });
            }
        }

        // 2. Assume path is a Confluence Page URL and try to find the latest HTML attachment via REST API
        // Improved Regex: Handles ?pageId=123 (Server) and /pages/123/Title (Cloud)
        let pageId: string | null = null;
        const pageIdMatch = path.match(/pageId=(\d+)/) || path.match(/\/pages\/(\d+)(?:\/|$)/);
        
        if (pageIdMatch) {
            pageId = pageIdMatch[1];
        }

        if (!pageId) {
            return NextResponse.json({ 
                error: "Could not identify Page ID from the URL. Please use a link containing 'pageId=' (found in Page Information) or a Cloud link containing '/pages/[ID]/...'. Alternatively, provide a direct link to the .html attachment." 
            }, { status: 400 });
        }

        const baseUrl = urlObj.origin;
        // Confluence Cloud/Server standard attachment API
        const apiPath = `${baseUrl}/wiki/rest/api/content/${pageId}/child/attachment?limit=20&sort=created`;

        const listRes = await fetch(apiPath, { headers });
        if (!listRes.ok) {
            // Fallback for some instances that don't use the /wiki prefix
            const altApiPath = `${baseUrl}/rest/api/content/${pageId}/child/attachment?limit=20&sort=created`;
            const altRes = await fetch(altApiPath, { headers });
            
            if (!altRes.ok) {
                throw new Error(`Confluence API error: ${listRes.status} ${listRes.statusText}. Verify the URL and that the user has 'View' permissions.`);
            }
            
            const data = await altRes.json();
            return processAttachments(data, baseUrl, headers);
        }

        const data = await listRes.json();
        return processAttachments(data, baseUrl, headers);

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
        return NextResponse.json({ 
            error: "No HTML attachments found on the specified Confluence page." 
        }, { status: 404 });
    }

    // Download the content of the identified attachment
    const downloadRelativeUrl = latestHtml._links?.download || latestHtml._links?.content;
    if (!downloadRelativeUrl) {
        throw new Error("Could not find a valid download link for the attachment.");
    }

    const downloadUrl = downloadRelativeUrl.startsWith('http') ? downloadRelativeUrl : `${baseUrl}${downloadRelativeUrl}`;
    const contentRes = await fetch(downloadUrl, { headers });
    
    if (!contentRes.ok) {
        throw new Error(`Failed to download report content: ${contentRes.status}`);
    }

    const content = await contentRes.text();

    return NextResponse.json({ 
        success: true, 
        fileName: latestHtml.title, 
        content 
    });
}
