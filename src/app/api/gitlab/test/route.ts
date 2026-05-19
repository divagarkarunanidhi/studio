
import { NextResponse } from 'next/server';
import { getGitlabDispatcher } from '@/lib/gitlab-fetch';

/**
 * POST /api/gitlab/test
 * Validates GitLab credentials and checks if the specified project path or ID exists.
 * On failure, returns the full upstream response (status, headers, body) so the
 * client can surface the complete error.
 */
export async function POST(request: Request) {
    let requestUrl = '';
    try {
        const body = await request.json();
        const { token, projectId, baseUrl: rawBaseUrl, insecureTls } = body;

        if (!token || !projectId) {
            return NextResponse.json({
                error: "Configuration missing. Please provide a GitLab Private Token and Project ID/Path."
            }, { status: 400 });
        }

        const host = (rawBaseUrl && typeof rawBaseUrl === 'string' && rawBaseUrl.trim())
            ? rawBaseUrl.trim().replace(/\/+$/, '')
            : 'https://gitlab.com';
        requestUrl = `${host}/api/v4/projects/${encodeURIComponent(projectId)}`;

        const res = await fetch(requestUrl, {
            headers: { 'PRIVATE-TOKEN': token },
            signal: AbortSignal.timeout(10000),
            // @ts-expect-error - undici dispatcher is supported by Node fetch
            dispatcher: getGitlabDispatcher({ insecureTls: !!insecureTls }),
        });

        const rawBody = await res.text();
        let parsedBody: any = null;
        try { parsedBody = rawBody ? JSON.parse(rawBody) : null; } catch { /* not JSON */ }

        if (res.ok) {
            return NextResponse.json({
                success: true,
                message: `Successfully connected! Found project: ${parsedBody?.name_with_namespace ?? projectId}`,
                status: res.status,
                url: requestUrl,
            });
        }

        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => { headers[k] = v; });

        const upstreamMessage =
            parsedBody?.message ||
            parsedBody?.error ||
            parsedBody?.error_description ||
            (typeof parsedBody === 'string' ? parsedBody : null) ||
            rawBody ||
            res.statusText ||
            'Unknown error';

        return NextResponse.json({
            error: `GitLab ${res.status} ${res.statusText || ''}: ${upstreamMessage}`.trim(),
            status: res.status,
            statusText: res.statusText,
            url: requestUrl,
            headers,
            body: parsedBody ?? rawBody,
        }, { status: res.status });

    } catch (e: any) {
        console.error("GitLab Test Error:", e);
        const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError' || /timeout/i.test(e?.message || '');
        const isConnRefused = /ECONNREFUSED/i.test(e?.message || '') || /ECONNREFUSED/i.test(String(e?.cause?.code || ''));
        const baseMessage = isTimeout
            ? `Connection timed out after 10s. Verify the Base URL is reachable from this server (corporate networks may block https://gitlab.com — try your self-hosted GitLab URL).`
            : isConnRefused
                ? `Connection refused while contacting GitLab. This usually means outbound internet is blocked for the server. Configure HTTPS_PROXY/HTTP_PROXY environment variables or use your internal GitLab base URL.`
                : (e?.message || "An unexpected error occurred during the GitLab test.");

        return NextResponse.json({
            error: baseMessage,
            url: requestUrl || undefined,
            cause: e?.cause ? (typeof e.cause === 'object' ? { name: e.cause.name, code: (e.cause as any).code, message: e.cause.message } : String(e.cause)) : undefined,
            name: e?.name,
            code: e?.code,
            stack: process.env.NODE_ENV !== 'production' ? e?.stack : undefined,
        }, { status: 500 });
    }
}
