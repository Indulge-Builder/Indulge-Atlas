/**
 * Columns required by `LeadsTable` — avoids shipping heavy JSON blobs (form_data, drafts, etc.) per row.
 * Keep in sync anywhere leads are listed for the table.
 */
export const LEADS_TABLE_SELECT = [
  "id",
  "first_name",
  "last_name",
  "phone_number",
  "email",
  "status",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "notes",
  "created_at",
  "assigned_agent:profiles!assigned_to(id, full_name, email)",
].join(", ");
