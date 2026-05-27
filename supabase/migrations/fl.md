Entry: POST /api/webhooks/leads?source=meta|google|website (rate-limited, Bearer-auth via PABBLY_WEBHOOK_SECRET)

The webhook is sent by Pabbly as middleware from Meta Ads / Google Ads / Website forms.
Validation & Sanitization (lib/services/leadIngestion.ts)

Zod validation with transforms (empty string → null)
Phone → E.164 via normalizeToE164() (IN default)
Text → sanitizeText() (XSS strip)
Full name split if no first*name
Domain resolved from campaign prefix (e.g. TG_Shop*_ → indulge*shop, TG_Global - indulge_concierge, TG_Legacy - indulge_legacy, TG_House*_ - indulge_house)

c) Agent Assignment
agent form same domian assinged on round robin,
liek a lead came from TG*Global*\* then 1st it will be saved in db wiht doain as indulge_concierge, and all the agents that have domain indulge_concierge in there profile will be assinged this lead on round robin no agent from another domain.
also it in agent profile there will be a column, named is_active if that is true then only that agent qualifies for asssignment we are building this so that if a agent takes a holiday we can remove them form the assignemnt pool easily

the leads table :
first*name, last_name, created_at, modified_at, utm_source, utm_campagin, utm_medium, assigned_to, assigned_at
Campaign/UTM: campaign_id, campaign_name, ad_name, platform, utm*\*
Raw form: form_data (JSONB)
Call tracking: call_count, last_call_outcome
Agent notes: private_scratchpad (agent-only), follow_up_drafts
lead_intent: hot | cold

table 2: lead_activities
actor_id, action_type, details (JSONB)
Types: lead_created | status_changed | note_added | agent_assigned
notes Indexed on (lead_id, created_at DESC)
agent_routing_config — per-agent assignment settings
shift_start, shift_end, is_active

Journey status
New - Touched - In Discussion - Won
other status ( nurturing, lost, junk )

Every transition: lib/actions/leads.ts updates leads.status, logs lead_activities (status_changed, old_status, new_status).

Won additionally: inserts a row into clients table (lead_origin_id FK), fires finance notification endpoint.

Nurturing additionally: auto-creates a task with due_date = now + 3 months.
Agent clicks Called button → CalledModal.tsx opens → agent picks outcome + types a note.

addLeadCallNote(leadId, content, callOutcome) server action:

Inserts lead_notes row (append-only)
Increments leads.call_count, updates leads.last_call_outcome
Auto-advances new → attempted on first call
Logs lead_activities (note_added, details.call_outcome
Outcomes: rnr | switched_off | wrong_number | conversing | other

note on lead

1. private (only visble to agent)
2. common (anyone who came to this lead can see)

Tasks on a Lead
Auto-created when status → nurturing (3-month follow-up)
Auto-created by retry scheduling (call task with due_date)
Manually created by agent from dossier
Shown in LeadDossierTasksAsync widget (next due task)
task_type: call | whatsapp_message | email | general_follow_up |

teh lead page app/(dashboard)/leads/[id]/page.tsx

StatusActionPanel — Called / Lost / Trash / Won / Nurture buttons
LeadInfoCard — Contact fields, demographics, intent, tags
AgentScratchpad — Private notes (assigned agent + admins)
LeadNotesSection — Timeline of all call notes
LeadJourneyTimeline — Visual stage path with dwell times (from leadJourneyStages.ts)
LeadDossierTasksAsync — Next due task
DynamicFormResponses — Raw form_data rendered
Lead List & Access Control
leads/page.tsx + LeadsTable.tsx:

Agents: only their leads
Managers/Admins: all leads in domain, can filter by assigned agent
Filters: status, campaign, source, date range, search

Webhook arrives (Meta/Google/Website)
→ Validate + Sanitize → Resolve domain
→ Route: rules engine → round-robin pool
→ INSERT leads (status=new, assigned_to=agent)
→ LOG lead_created activity
→ NOTIFY agent (WhatsApp, non-blocking)

Agent receives lead
→ Opens dossier → Calls → Logs outcome via CalledModal
→ lead_notes INSERT + call_count++ + status: new→toucehd
→ Can schedule retry → task created with due_date
→ Uses private scratchpad for internal memos

Lead progresses: touched → in_discussion
→ Each step: activity logged, dwell time tracked

Resolution:
→ Won: client record created, deal stored
→ Nurturing: 3-month task auto-created
→ Lost: reason stored, activity logged
→ Junk: reason stored

All history: immutable in lead_activities
All calls: append-only in lead_notes
All tasks: tasks table with lead_id FK
