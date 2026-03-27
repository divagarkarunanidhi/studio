
import { NextResponse } from 'next/server';

/**
 * POST /api/gitlab/trigger-schedule
 * Finds a GitLab pipeline schedule by its description (name) and triggers it.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, projectId, scheduleDescription } = body;

        if (!token || !projectId || !scheduleDescription) {
            return NextResponse.json({ error: "Missing required details: token, projectId, or scheduleDescription." }, { status: 400 });
        }

        const baseUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}`;
        
        // 1. Fetch all pipeline schedules
        const listRes = await fetch(`${baseUrl}/pipeline_schedules`, {
            headers: { 'PRIVATE-TOKEN': token }
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
            headers: { 'PRIVATE-TOKEN': token }
        });

        if (!triggerRes.ok) {
            const err = await triggerRes.text();
            return NextResponse.json({ error: `Failed to trigger schedule: ${triggerRes.status}`, details: err }, { status: triggerRes.status });
        }

        return NextResponse.json({ 
            success: true, 
            message: `Pipeline schedule '${targetSchedule.description}' triggered successfully.`,
            scheduleId: targetSchedule.id
        });

    } catch (e: any) {
        console.error("GitLab Trigger Schedule Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred." }, { status: 500 });
    }
}
