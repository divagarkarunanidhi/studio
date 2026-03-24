import { NextResponse } from 'next/server';

/**
 * POST /api/confluence/test
 * Performs a real authentication check against the Confluence REST API.
 * This ensures that credentials, URL, and connectivity are valid.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { path, user, password } = body;

        if (!path || !user || !password) {
            return NextResponse.json({ error: "Configuration missing. Please provide URL, Username, and Password/Token." }, { status: 400 });
        }

        const auth = Buffer.from(`${user}:${password}`).toString('base64');
        const headers = { 
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
            'X-Atlassian-Token': 'no-check'
        };

        let urlObj: URL;
        try {
            urlObj = new URL(path);
        } catch (e) {
            return NextResponse.json({ error: "Invalid URL format. Please provide a full URL including https://" }, { status: 400 });
        }

        const origin = urlObj.origin;
        
        /**
         * We attempt a "whoami" style request to verify credentials.
         * The /wiki/rest/api/user/current endpoint is standard for checking the authenticated user.
         */
        const testPaths = [
            `${origin}/wiki/rest/api/user/current`,
            `${origin}/rest/api/user/current`,
            `${origin}/wiki/api/v2/users/me`,
            `${origin}/api/v2/users/me`
        ];

        let lastStatus = 0;
        let lastError = "Could not reach server";

        for (const testPath of testPaths) {
            try {
                const res = await fetch(testPath, { headers, signal: AbortSignal.timeout(10000) });
                lastStatus = res.status;

                if (res.ok) {
                    const data = await res.json();
                    const displayName = data.displayName || data.name || user;
                    return NextResponse.json({ 
                        success: true, 
                        message: `Successfully authenticated as ${displayName}. Connection is healthy!` 
                    });
                }

                if (res.status === 401) {
                    return NextResponse.json({ 
                        error: "Unauthorized (401): Invalid credentials. Note: Confluence Cloud requires an Email and API Token, not your password." 
                    }, { status: 401 });
                }

                if (res.status === 403) {
                    return NextResponse.json({ 
                        error: "Forbidden (403): Your account does not have sufficient API permissions." 
                    }, { status: 403 });
                }

                const errorBody = await res.text();
                lastError = errorBody.substring(0, 100) || res.statusText;
            } catch (err: any) {
                lastError = err.message || "Network request failed";
            }
        }

        return NextResponse.json({ 
            error: `Connection test failed. (Status: ${lastStatus}). Details: ${lastError}` 
        }, { status: 502 });

    } catch (e: any) {
        console.error("Confluence Test Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred during the test." }, { status: 500 });
    }
}
