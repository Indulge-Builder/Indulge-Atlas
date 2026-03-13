import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { timingSafeEqual } from "crypto";

/**
 * POST /api/finance-notify
 *
 * Internal endpoint — only callable with INTERNAL_API_SECRET header.
 * Triggered automatically when a lead status is set to WON.
 * Fetches full lead + agent details and formats a structured
 * notification payload for the Finance Department.
 *
 * TODO: Plug in your email transport provider:
 *   - Option A: Resend (recommended) → `npm install resend`
 *   - Option B: Nodemailer with SMTP
 *   - Option C: Postmark / SendGrid
 *
 * The `sendEmail()` stub below shows where to integrate.
 */

interface FinanceNotifyPayload {
  leadId: string;
  agentId: string;
}

function secretsMatch(incoming: string, expected: string): boolean {
  try {
    const a = Buffer.from(incoming);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Guard: only allow calls that carry the internal API secret
  const incomingSecret = request.headers.get("x-internal-secret") ?? "";
  const expectedSecret = process.env.INTERNAL_API_SECRET ?? "";

  if (!incomingSecret || !expectedSecret || !secretsMatch(incomingSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: FinanceNotifyPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { leadId, agentId } = body;

  if (!leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 422 });
  }

  // ── Fetch lead details ─────────────────────────────────
  const supabase = await createServiceClient();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select(
      "*, assigned_agent:profiles!assigned_to(id, full_name, email)"
    )
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // ── Build the structured payload ───────────────────────
  const emailPayload = {
    to: process.env.FINANCE_EMAIL ?? "finance@indulgeglobal.com",
    subject: `[Indulge Global] New Qualified Lead — ${lead.first_name} ${lead.last_name ?? ""}`.trim(),
    body: buildEmailBody(lead),
    metadata: {
      lead_id: lead.id,
      agent_id: agentId,
      won_at: new Date().toISOString(),
    },
  };

  // ── TODO: Send email ───────────────────────────────────
  // OPTION A — Resend:
  // ─────────────────────────────────────────────────────
  // import { Resend } from "resend";
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({
  //   from: "Indulge Global CRM <crm@indulgeglobal.com>",
  //   to: emailPayload.to,
  //   subject: emailPayload.subject,
  //   html: buildHtmlEmail(lead),
  // });
  // ─────────────────────────────────────────────────────
  //
  // OPTION B — Nodemailer:
  // ─────────────────────────────────────────────────────
  // import nodemailer from "nodemailer";
  // const transporter = nodemailer.createTransport({
  //   host: process.env.SMTP_HOST,
  //   port: Number(process.env.SMTP_PORT),
  //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  // });
  // await transporter.sendMail({
  //   from: '"Indulge Global CRM" <crm@indulgeglobal.com>',
  //   to: emailPayload.to,
  //   subject: emailPayload.subject,
  //   text: emailPayload.body,
  // });
  // ─────────────────────────────────────────────────────

  // For now, log non-PII metadata only — replace console.log with real transport above
  console.log("[finance-notify] Email payload ready for lead:", emailPayload.metadata.lead_id);

  return NextResponse.json({
    success: true,
    message: "Finance notification prepared",
  });
}

// ── Email body formatter ───────────────────────────────────

function buildEmailBody(lead: Record<string, unknown>): string {
  const agent = lead.assigned_agent as Record<string, string> | null;

  return `
INDULGE GLOBAL — QUALIFIED LEAD NOTIFICATION
═══════════════════════════════════════════════

A lead has been marked as WON and is ready for Finance processing.

LEAD DETAILS
─────────────────────────
Name:       ${[lead.first_name, lead.last_name].filter(Boolean).join(" ")}
Phone:      ${lead.phone_number}
Email:      ${lead.email ?? "—"}
City:       ${lead.city ?? "—"}
Source:     ${lead.source ?? "—"}
Lead ID:    ${lead.id}

ASSIGNED AGENT
─────────────────────────
Name:       ${agent?.full_name ?? "—"}
Email:      ${agent?.email ?? "—"}

TIMELINE
─────────────────────────
Lead Created:   ${formatDateTime(lead.created_at as string)}
Won At:         ${formatDateTime(new Date().toISOString())}

═══════════════════════════════════════════════
This is an automated notification from the Indulge Global CRM.
Please do not reply directly to this message.
`.trim();
}

function buildHtmlEmail(lead: Record<string, unknown>): string {
  const agent = lead.assigned_agent as Record<string, string> | null;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: 'Helvetica Neue', sans-serif; color: #1A1A1A; background: #F9F9F6; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background: #fff; border: 1px solid #E5E4DF; border-radius: 12px; overflow: hidden; }
    .header { background: #0A0A0A; padding: 28px 32px; }
    .header h1 { color: #D4AF37; font-size: 18px; margin: 0; font-weight: 600; }
    .header p { color: #6B6B6B; font-size: 12px; margin: 4px 0 0; }
    .body { padding: 28px 32px; }
    .badge { display: inline-block; background: #EBF4EF; color: #4A7C59; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9E9E9E; margin: 20px 0 10px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 7px 0; font-size: 14px; }
    td:first-child { color: #9E9E9E; width: 110px; }
    td:last-child { font-weight: 500; color: #1A1A1A; }
    .footer { background: #F9F9F6; border-top: 1px solid #E5E4DF; padding: 16px 32px; font-size: 11px; color: #B5A99A; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Indulge Global CRM</h1>
      <p>Qualified Lead — Finance Notification</p>
    </div>
    <div class="body">
      <div class="badge">&#x2714; Lead Won</div>
      <p class="section-title">Lead Details</p>
      <table>
        <tr><td>Name</td><td>${[lead.first_name, lead.last_name].filter(Boolean).join(" ")}</td></tr>
        <tr><td>Phone</td><td>${lead.phone_number}</td></tr>
        <tr><td>Email</td><td>${lead.email ?? "—"}</td></tr>
        <tr><td>City</td><td>${lead.city ?? "—"}</td></tr>
        <tr><td>Source</td><td>${lead.source ?? "—"}</td></tr>
        <tr><td>Lead ID</td><td>${lead.id}</td></tr>
      </table>
      <p class="section-title">Assigned Agent</p>
      <table>
        <tr><td>Name</td><td>${agent?.full_name ?? "—"}</td></tr>
        <tr><td>Email</td><td>${agent?.email ?? "—"}</td></tr>
      </table>
      <p class="section-title">Timeline</p>
      <table>
        <tr><td>Lead Created</td><td>${formatDateTime(lead.created_at as string)}</td></tr>
        <tr><td>Won At</td><td>${formatDateTime(new Date().toISOString())}</td></tr>
      </table>
    </div>
    <div class="footer">Automated notification from Indulge Global CRM. Do not reply.</div>
  </div>
</body>
</html>
`;
}
