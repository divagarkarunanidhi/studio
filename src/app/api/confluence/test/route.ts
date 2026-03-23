import { NextResponse } from 'next/server';

/**
 * POST /api/confluence/test
 * Mocks a connection test to a Confluence repository.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { path, user, password } = body;

        if (!path || !user || !password) {
            return NextResponse.json({ error: "Missing required configuration fields." }, { status: 400 });
        }

        // Simulate network latency for the connection check
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Mock failure scenarios based on input strings for demonstration
        if (path.toLowerCase().includes('fail') || user.toLowerCase().includes('error')) {
            return NextResponse.json({ 
                error: "Authentication failed or host unreachable. Please verify your credentials and network path." 
            }, { status: 401 });
        }

        return NextResponse.json({ 
            success: true, 
            message: "Successfully connected to Confluence. Agent 1 is ready to fetch reports." 
        });
    } catch (e: any) {
        return NextResponse.json({ error: "An unexpected error occurred during the connection test." }, { status: 500 });
    }
}
