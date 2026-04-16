
import { NextResponse } from 'next/server';

/**
 * POST /api/outlook/check
 * Monitors an Outlook inbox via MS Graph API for trigger emails.
 * If found, triggers the configured GitLab pipeline.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { config, gitlabConfig, processedEmailIds = [] } = body;

        const { 
            outlookClientId, 
            outlookTenantId, 
            outlookClientSecret, 
            outlookUserEmail,
            outlookSenderFilter,
            outlookSubjectFilter
        } = config;

        if (!outlookClientId || !outlookTenantId || !outlookClientSecret || !outlookUserEmail) {
            return NextResponse.json({ error: "Outlook configuration is incomplete." }, { status: 400 });
        }

        // 1. Get Access Token from Microsoft Identity Platform
        const tokenUrl = `https://login.microsoftonline.com/${outlookTenantId}/oauth2/v2.0/token`;
        const tokenParams = new URLSearchParams();
        tokenParams.append('client_id', outlookClientId);
        tokenParams.append('scope', 'https://graph.microsoft.com/.default');
        tokenParams.append('client_secret', outlookClientSecret);
        tokenParams.append('grant_type', 'client_credentials');

        const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            body: tokenParams,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (!tokenRes.ok) {
            const err = await tokenRes.text();
            return NextResponse.json({ error: "Failed to authenticate with Microsoft Graph.", details: err }, { status: 401 });
        }

        const { access_token } = await tokenRes.json();

        // 2. Poll for emails using OData filters
        // Search for recent emails (last 24 hours) from sender and matching subject
        const sender = outlookSenderFilter || "mareeswari";
        const subject = outlookSubjectFilter || "Trigger cox regression";
        
        // Use $filter for efficient server-side searching
        // Note: Graph API filtering by display name is sometimes restricted, so we use 'contains' or 'startsWith'
        const filter = `(from/emailAddress/name eq '${sender}' or contains(from/emailAddress/address, '${sender}')) and contains(subject, '${subject}')`;
        const mailUrl = `https://graph.microsoft.com/v1.0/users/${outlookUserEmail}/messages?$filter=${encodeURIComponent(filter)}&$top=5&$select=id,subject,from,receivedDateTime`;

        const mailRes = await fetch(mailUrl, {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });

        if (!mailRes.ok) {
            const err = await mailRes.text();
            return NextResponse.json({ error: "Failed to fetch emails from Outlook.", details: err }, { status: mailRes.status });
        }

        const { value: emails } = await mailRes.json();

        if (!emails || emails.length === 0) {
            return NextResponse.json({ success: true, triggered: false, message: "No matching emails found." });
        }

        // 3. Find the first unprocessed email
        const newEmail = emails.find((e: any) => !processedEmailIds.includes(e.id));

        if (!newEmail) {
            return NextResponse.json({ success: true, triggered: false, message: "All matching emails have already been processed." });
        }

        // 4. Trigger GitLab Pipeline
        const gitlabToken = gitlabConfig.gitlabToken;
        const gitlabProjectId = gitlabConfig.gitlabProjectId;
        const scheduleDesc = gitlabConfig.gitlabPipelineScheduleDescription;

        if (!gitlabToken || !gitlabProjectId || !scheduleDesc) {
            return NextResponse.json({ 
                success: true, 
                triggered: false, 
                emailFound: true,
                emailId: newEmail.id,
                message: "Found trigger email, but GitLab configuration is incomplete." 
            });
        }

        const triggerRes = await fetch(`${request.url.split('/api')[0]}/api/gitlab/trigger-schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: gitlabToken,
                projectId: gitlabProjectId,
                scheduleDescription: scheduleDesc
            })
        });

        const gitlabResult = await triggerRes.json();

        return NextResponse.json({
            success: true,
            triggered: triggerRes.ok,
            emailId: newEmail.id,
            sender: newEmail.from?.emailAddress?.name || newEmail.from?.emailAddress?.address,
            subject: newEmail.subject,
            gitlabMessage: gitlabResult.message || gitlabResult.error,
            message: triggerRes.ok ? `Successfully triggered pipeline from email: ${newEmail.subject}` : "Failed to trigger GitLab pipeline."
        });

    } catch (e: any) {
        console.error("Outlook Trigger Error:", e);
        return NextResponse.json({ error: e.message || "An unexpected error occurred." }, { status: 500 });
    }
}
