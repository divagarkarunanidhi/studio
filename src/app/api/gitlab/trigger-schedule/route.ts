
import { NextResponse } from 'next/server';
import { getGitlabDispatcher } from '@/lib/gitlab-fetch';

/**
 * POST /api/gitlab/trigger-schedule
 * Finds a GitLab pipeline schedule by its description (name) and triggers it.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, projectId, scheduleDescription, baseUrl: rawBaseUrl, insecureTls } = body;

        if (!token || !projectId || !scheduleDescription) {
            return NextResponse.json({ error: "Missing required details: token, projectId, or scheduleDescription." }, { status: 400 });
        }

        const host = (rawBaseUrl && typeof rawBaseUrl === 'string' && rawBaseUrl.trim())
            ? rawBaseUrl.trim().replace(/\/+$/, '')
            : 'https://gitlab.com';
        const baseUrl = `${host}/api/v4/projects/${encodeURIComponent(projectId)}`;
        
        // 1. Fetch all pipeline schedules
        const listRes = await fetch(`${baseUrl}/pipeline_schedules`, {
            headers: { 'PRIVATE-TOKEN': token },
            // @ts-expect-error - undici dispatcher is supported by Node fetch
            dispatcher: getGitlabDispatcher({ insecureTls: !!insecureTls }),
        });

        if (!listRes.ok) {
            const err = await listRes.text();
            return NextResponse.json({ error: `Failed to fetch pipeline schedules: ${listRes.status}`, details: err }, { status: listRes.status });
        }

        const schedules = await listRes.json();
        
        // 2. Find schedule by description
        const targetSchedule = schedules.find((s: any) => 
            s.description.toLowerCase().trim() === scheduleDescription.toLowerCase().trim()
        );

        if (!targetSchedule) {
            return NextResponse.json({ 
                error: `No pipeline schedule found with description matching: '${scheduleDescription}'`,
                availableSchedules: schedules.map((s: any) => s.description)
            }, { status: 404 });
        }

        // 3. Trigger (Play) the schedule
        const triggerRes = await fetch(`${baseUrl}/pipeline_schedules/${targetSchedule.id}/play`, {
            method: 'POST',
            headers: { 'PRIVATE-TOKEN': token },
            // @ts-expect-error - undici dispatcher is supported by Node fetch
            dispatcher: getGitlabDispatcher({ insecureTls: !!insecureTls }),
        });

        if (!triggerRes.ok) {
            const err = await triggerRes.text();
            return NextResponse.json({ error: `Failed to trigger schedule: ${triggerRes.status}`, details: err }, { status: triggerRes.status });
        }

        // 4. Fetch the latest pipeline triggered by this schedule
        let pipelineInfo: any = null;
        try {
            // Wait briefly for the pipeline to be created
            await new Promise(resolve => setTimeout(resolve, 2000));
            const pipelinesRes = await fetch(`${baseUrl}/pipelines?per_page=1&order_by=id&sort=desc`, {
                headers: { 'PRIVATE-TOKEN': token },
                // @ts-expect-error - undici dispatcher is supported by Node fetch
                dispatcher: getGitlabDispatcher({ insecureTls: !!insecureTls }),
            });
            if (pipelinesRes.ok) {
                const pipelines = await pipelinesRes.json();
                if (pipelines.length > 0) {
                    pipelineInfo = {
                        id: pipelines[0].id,
                        status: pipelines[0].status,
                        ref: pipelines[0].ref,
                        webUrl: pipelines[0].web_url,
                        createdAt: pipelines[0].created_at,
                        source: pipelines[0].source,
                    };
                }
            }
        } catch (pipelineErr) {
            // Non-critical: pipeline info fetch failed, still report success
            console.warn("Could not fetch triggered pipeline details:", pipelineErr);
        }

        return NextResponse.json({ 
            success: true, 
            message: `Pipeline schedule '${targetSchedule.description}' triggered successfully.`,
            scheduleId: targetSchedule.id,
            pipeline: pipelineInfo
        });

    } catch (e: any) {
        console.error("GitLab Trigger Schedule Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred." }, { status: 500 });
    }
}
