#!/usr/bin/env python3
"""
Zoho → Atlas Lead Import Script
---------------------------------
Reads Zoho-leads.csv and Zoho-notes.csv from the project root,
truncates leads + lead_activities + lead_collaborators,
then re-imports everything with correct field mapping.

Run from the project root:
  python3 scripts/zoho-import.py

Requires: pip install supabase python-dateutil
"""

import csv
import json
import re
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

try:
    from supabase import create_client, Client
except ImportError:
    print("ERROR: Install supabase client first → pip install supabase")
    sys.exit(1)

# ── Config ──────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://ytaaorxkmtcxjatfmuse.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6"
    "Inl0YWFvcnhrbXRjeGphdGZtdXNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6"
    "MTc3MzAwNjgyMywiZXhwIjoyMDg4NTgyODIzfQ.JFHfnfyPp-rhdqwEAtjsTdko9fvvwk3"
    "RcIfWUdadb2c"
)

ROOT = Path(__file__).parent.parent
LEADS_CSV = ROOT / "Zoho-leads.csv"
NOTES_CSV = ROOT / "Zoho-notes.csv"

BATCH_SIZE = 100  # rows per upsert call

# ── Domain mapping ───────────────────────────────────────────────────────────
DOMAIN_MAP = {
    "indulge global": "indulge_global",
    "indulge house": "indulge_house",
    "indulge legacy": "indulge_legacy",
    "indulge shop": "indulge_shop",
    "": "indulge_concierge",
}

def map_domain(raw: str) -> str:
    return DOMAIN_MAP.get(raw.strip().lower(), "indulge_concierge")


# ── Platform mapping ─────────────────────────────────────────────────────────
META_PLATFORMS = {"meta", "fb", "facebook_mobile_feed", "facebook_mobile_reels", "ig",
                  "instagram_feed", "instagram_reels", "instagram_stories"}
GOOGLE_PLATFORMS = {"google", "ppc", "google ads", "adwords"}
WEBSITE_PLATFORMS = {"website", "typeform"}

def map_platform(raw: str) -> str | None:
    v = raw.strip().lower()
    if not v:
        return None
    if v in META_PLATFORMS:
        return "meta"
    if v in GOOGLE_PLATFORMS:
        return "google"
    if v in WEBSITE_PLATFORMS:
        return "website"
    # unresolved macros or unknown → null
    if v.startswith("{") or v.startswith("{{"):
        return None
    return None


# ── UTM source normalisation ─────────────────────────────────────────────────
UTM_META = {"meta", "meta ads", "meta_ads", "fb", "facebook", "instagram"}
UTM_GOOGLE = {"google ads", "google", "adwords", "google-ads"}
UTM_WEBSITE = {"website", "dubai website leads"}
UTM_REFERRAL = {"referral", "referrals", "ref", "refferals", "renewal"}
UTM_WHATSAPP = {"whatsapp"}
UTM_EVENTS = {"events", "eventss"}

def map_utm_source(raw: str) -> str | None:
    v = raw.strip().lower()
    if not v:
        return None
    if v in UTM_META:
        return "meta"
    if v in UTM_GOOGLE:
        return "google"
    if v in UTM_WEBSITE:
        return "website"
    if v in UTM_REFERRAL:
        return "referral"
    if v in UTM_WHATSAPP:
        return "whatsapp"
    if v in UTM_EVENTS:
        return "events"
    if v in {"organic", "personal"}:
        return "website"
    # unresolved macros / dirty values → null
    if v.startswith("{{") or v in {"an", "ig", "chatgpt.com"}:
        return None
    return raw.strip().lower()  # keep as-is for anything else


# ── Status mapping ───────────────────────────────────────────────────────────
STATUS_MAP = {
    "touched": "attempted",
    "junk": "trash",
    "new": "new",
    "in discussion": "in_discussion",
    "lost": "lost",
    "nurturing": "nurturing",
    "qualified": "won",
}

def map_status(raw: str) -> str:
    return STATUS_MAP.get(raw.strip().lower(), "new")


# ── Loss / trash reason mapping ──────────────────────────────────────────────
def map_loss_reason(zoho_status: str, zoho_loss_reason: str):
    """
    Returns (lost_reason, trash_reason, nurture_reason) tuple.
    Only one will be non-None, matching the Atlas status.
    """
    atlas_status = map_status(zoho_status)
    lr = zoho_loss_reason.strip()
    lost_reason = None
    trash_reason = None
    nurture_reason = None

    LOST_REASON_MAP = {
        "Not Interested": "Not Interested",
        "High Cost": "Price Objection",
        "Not Our TG": None,          # goes to trash
        "Not Ready": "Not Interested",
        "Cold": "Not Interested",
        "RNR": "Not Interested",
        "Wrong Number": "Other",
        "Switched Off": "Not Interested",
        "Collaboration": "Other",
    }

    TRASH_REASON_FOR = {"Not Our TG"}
    TRASH_REASON_MAP = {
        "Not Our TG": "Not our TG",
        "Wrong Number": "Incorrect Data",
    }

    if atlas_status == "lost" and lr:
        if lr in TRASH_REASON_FOR:
            # reclassify to trash
            trash_reason = TRASH_REASON_MAP.get(lr, "Not our TG")
        else:
            lost_reason = LOST_REASON_MAP.get(lr, "Other")

    elif atlas_status == "trash" and lr:
        trash_reason = TRASH_REASON_MAP.get(lr, "Not our TG")

    elif atlas_status == "nurturing" and lr:
        nurture_reason = "Future Prospect"

    # If loss reason is present but status is something else, store in notes
    return lost_reason, trash_reason, nurture_reason


# ── Phone normalisation (basic — prefer Mobile, fallback to Phone) ───────────
def pick_phone(mobile: str, phone: str) -> str:
    """Return the best phone string; does NOT E.164-format (DB accepts raw)."""
    val = mobile.strip() or phone.strip()
    return val or ""


# ── Personal details assembly ────────────────────────────────────────────────
def build_personal_details(interest: str, intent_level: str, client_details: str) -> str | None:
    parts = []
    if interest.strip():
        parts.append(f"Interest: {interest.strip()}")
    if intent_level.strip():
        parts.append(f"Intent Level: {intent_level.strip()}")
    if client_details.strip():
        parts.append(f"Client Details: {client_details.strip()}")
    return "\n".join(parts) if parts else None


# ── Notes → composite notes string ───────────────────────────────────────────
def build_notes_string(
    progress_notes: str,
    quick_notes: str,
    lost_reason_note: str,
    zoho_notes_list: list[dict],
) -> str | None:
    """
    Merge all textual notes sources into a single `notes` string.
    Zoho notes are appended in chronological order with timestamps.
    """
    parts = []

    if progress_notes.strip():
        parts.append(progress_notes.strip())

    if quick_notes.strip():
        parts.append(quick_notes.strip())

    if lost_reason_note.strip():
        parts.append(f"[Lost Reason Note] {lost_reason_note.strip()}")

    if zoho_notes_list:
        sorted_notes = sorted(zoho_notes_list, key=lambda n: n.get("Created Time", ""))
        for note in sorted_notes:
            content = note.get("Note Content", "").strip()
            ts = note.get("Created Time", "").strip()
            if content:
                if ts:
                    parts.append(f"[{ts}] {content}")
                else:
                    parts.append(content)

    return "\n\n".join(parts) if parts else None


# ── Timestamp normalisation ───────────────────────────────────────────────────
def parse_ts(val: str) -> str | None:
    """Return ISO8601 UTC string or None."""
    if not val or not val.strip():
        return None
    val = val.strip()
    # Already ISO format
    if "T" in val and val.endswith("Z"):
        return val
    # Zoho datetime: '2026-03-26 17:50:12'
    try:
        dt = datetime.strptime(val, "%Y-%m-%d %H:%M:%S")
        return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        pass
    # Date only: '2026-03-25T00:00:00Z' already handled above
    try:
        dt = datetime.strptime(val, "%Y-%m-%dT%H:%M:%SZ")
        return val
    except ValueError:
        pass
    return None


# ── Name handling ─────────────────────────────────────────────────────────────
def build_name(first: str, last: str, email: str) -> tuple[str, str | None]:
    """
    Returns (first_name, last_name).
    Zoho sometimes has email in First Name when name is absent.
    """
    fn = first.strip()
    ln = last.strip()

    # If first_name looks like an email address, use email or 'Unknown'
    if "@" in fn:
        # Try to extract a real name from email if no other name available
        fn = email.split("@")[0].replace(".", " ").title() if email else "Unknown"

    if not fn:
        fn = "Unknown"

    return fn, ln if ln else None


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("── Zoho → Atlas Import ──────────────────────────────────────────")

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    # 1. Load CSVs
    print(f"\n[1/4] Loading CSVs…")
    with open(LEADS_CSV, newline="", encoding="utf-8-sig") as f:
        leads_rows = list(csv.DictReader(f))
    print(f"      Leads: {len(leads_rows)}")

    with open(NOTES_CSV, newline="", encoding="utf-8-sig") as f:
        notes_rows = list(csv.DictReader(f))
    print(f"      Notes: {len(notes_rows)}")

    # Index notes by zoho lead_id
    notes_by_lead: dict[str, list[dict]] = defaultdict(list)
    for note in notes_rows:
        notes_by_lead[note["lead_id"]].append(note)

    # 2. Truncate tables
    print("\n[2/4] Truncating leads, lead_activities, lead_collaborators…")
    print("      (Tasks table is NOT touched)")

    # Use raw SQL via RPC approach — disable triggers, truncate, re-enable
    # Supabase Python client doesn't expose raw SQL directly, so we use
    # the REST API with service role to call a stored procedure or use
    # the execute() method if available.
    #
    # We call each table's delete with a condition that matches all rows
    # (safer than relying on CASCADE in a single TRUNCATE via REST).

    # Delete in dependency order: collaborators → activities → leads
    res = supabase.table("lead_collaborators").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    print(f"      lead_collaborators cleared")

    res = supabase.table("lead_activities").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    print(f"      lead_activities cleared")

    res = supabase.table("leads").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    print(f"      leads cleared")

    # 3. Build lead records
    print("\n[3/4] Building and inserting leads…")

    lead_records = []
    # Map zoho_lead_id → new atlas UUID so we can insert activities
    zoho_to_atlas: dict[str, str] = {}

    skipped_no_phone = 0

    for row in leads_rows:
        zoho_id = row["lead_id"].strip()
        atlas_id = str(uuid.uuid4())
        zoho_to_atlas[zoho_id] = atlas_id

        # Phone
        phone = pick_phone(row.get("Mobile", ""), row.get("Phone", ""))
        if not phone:
            skipped_no_phone += 1
            phone = "unknown"  # keep record but flag it

        # Name
        first_name, last_name = build_name(
            row.get("First Name", ""),
            row.get("Last Name", ""),
            row.get("Email", ""),
        )

        # Domain
        domain = map_domain(row.get("Business Vertical", ""))

        # Status
        zoho_status = row.get("Lead Status", "New")
        atlas_status = map_status(zoho_status)

        # Platform / UTM
        platform = map_platform(row.get("Platform", ""))
        utm_source = map_utm_source(row.get("UTM Source", ""))
        utm_medium = row.get("UTM Medium", "").strip() or None

        # Loss / trash / nurture reasons
        lost_reason, trash_reason, nurture_reason = map_loss_reason(
            zoho_status, row.get("Loss Reason", "")
        )

        # Notes (merged from all text sources + zoho notes)
        notes_str = build_notes_string(
            row.get("Progress Notes", ""),
            row.get("Quick Notes", ""),
            row.get("Lost Reason Note", ""),
            notes_by_lead.get(zoho_id, []),
        )

        # Personal details: interest + intent + client details
        personal_details = build_personal_details(
            row.get("Interest", ""),
            row.get("Intent Level", ""),
            row.get("Client Details", ""),
        )

        # Assigned agent — Lead Owner is already a Supabase user UUID.
        # Validate strict UUID format (8-4-4-4-12); malformed/fake IDs → null.
        lead_owner = row.get("Lead Owner", "").strip()
        uuid_pattern = re.compile(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            re.IGNORECASE
        )
        # These sequential dummy UUID blocks from Zoho are not real profiles
        DUMMY_UUID_PREFIXES = (
            "431d2641-5fe5-4fe0-9b8d-0c211f3be6",
            "b61744a6-2ba8-4ced-a33d-39a820be1b",
        )
        if uuid_pattern.match(lead_owner) and not any(lead_owner.startswith(p) for p in DUMMY_UUID_PREFIXES):
            assigned_to = lead_owner
        else:
            assigned_to = None
        assigned_at = parse_ts(row.get("Modified Time", "")) if assigned_to else None

        # Attempt count
        attempt_count_raw = row.get("Call Attempt Count", "").strip()
        attempt_count = int(attempt_count_raw) if attempt_count_raw.isdigit() else 0

        # Deal value
        deal_raw = row.get("Deal Amount", "").strip()
        deal_value = None
        if deal_raw:
            try:
                deal_value = float(re.sub(r"[^\d.]", "", deal_raw))
            except ValueError:
                pass

        # Form data — store form response as JSONB if present
        form_response = row.get("Form Response", "").strip()
        form_data = {"form_response": form_response} if form_response else None

        # Timestamps
        created_raw = row.get("created_at", "").strip()
        created_at = parse_ts(created_raw) or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        updated_at = parse_ts(row.get("Modified Time", "")) or created_at

        # Campaign / ad info
        campaign_name = row.get("Ad Campaign", "").strip() or None
        # clean unresolved macros from campaign_name
        if campaign_name and campaign_name in {"/", "{adname}", "{{adname}}"}:
            campaign_name = None

        lead_records.append({
            "id": atlas_id,
            "first_name": first_name,
            "last_name": last_name,
            "phone_number": phone,
            "email": row.get("Email", "").strip() or None,
            "city": row.get("City", "").strip() or None,
            "domain": domain,
            "status": atlas_status,
            "platform": platform,
            "utm_source": utm_source,
            "utm_medium": utm_medium,
            "campaign_name": campaign_name,
            "form_data": form_data,
            "assigned_to": assigned_to,
            "assigned_at": assigned_at,
            "notes": notes_str,
            "personal_details": personal_details,
            "lost_reason": lost_reason,
            "trash_reason": trash_reason,
            "nurture_reason": nurture_reason,
            "attempt_count": attempt_count,
            "deal_value": deal_value,
            "is_off_duty": False,
            "tags": [],
            "created_at": created_at,
            "updated_at": updated_at,
        })

    print(f"      Built {len(lead_records)} lead records ({skipped_no_phone} had no phone → set to 'unknown')")

    # Insert in batches
    inserted = 0
    errors = 0
    for i in range(0, len(lead_records), BATCH_SIZE):
        batch = lead_records[i : i + BATCH_SIZE]
        try:
            res = supabase.table("leads").insert(batch).execute()
            inserted += len(batch)
            if (i // BATCH_SIZE) % 10 == 0:
                print(f"      … inserted {inserted}/{len(lead_records)}")
        except Exception as e:
            errors += len(batch)
            print(f"      ERROR on batch {i//BATCH_SIZE}: {e}")

    print(f"      ✓ Leads inserted: {inserted}  |  errors: {errors}")

    # 4. Build and insert lead_activities (one per Zoho note, using created_time)
    print("\n[4/4] Building and inserting lead_activities from notes…")

    activity_records = []

    for note in notes_rows:
        zoho_id = note["lead_id"].strip()
        atlas_lead_id = zoho_to_atlas.get(zoho_id)
        if not atlas_lead_id:
            continue

        content = note.get("Note Content", "").strip()
        if not content:
            continue

        note_ts = parse_ts(note.get("Created Time", ""))
        modified_ts = parse_ts(note.get("Modified Time", ""))

        # Modified By is the Supabase agent UUID — skip names and non-UUID values
        agent_id_raw = note.get("Modified By", "").strip()
        # Validate it looks like a UUID (8-4-4-4-12 hex)
        import re as _re
        agent_id = agent_id_raw if agent_id_raw and _re.match(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            agent_id_raw, _re.IGNORECASE
        ) else None

        activity_records.append({
            "id": str(uuid.uuid4()),
            "lead_id": atlas_lead_id,
            # legacy columns
            "performed_by": agent_id,
            "type": "note",
            "payload": json.dumps({"note": content}),
            # new columns
            "actor_id": agent_id,
            "action_type": "note_added",
            "details": json.dumps({"note": content}),
            "created_at": note_ts or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        })

    print(f"      Built {len(activity_records)} activity records")

    inserted_acts = 0
    errors_acts = 0
    for i in range(0, len(activity_records), BATCH_SIZE):
        batch = activity_records[i : i + BATCH_SIZE]
        try:
            res = supabase.table("lead_activities").insert(batch).execute()
            inserted_acts += len(batch)
        except Exception as e:
            errors_acts += len(batch)
            print(f"      ERROR on activity batch {i//BATCH_SIZE}: {e}")

    print(f"      ✓ Activities inserted: {inserted_acts}  |  errors: {errors_acts}")

    print("\n── Import complete ──────────────────────────────────────────────")
    print(f"   Leads:      {inserted}")
    print(f"   Activities: {inserted_acts}")
    print(f"   Errors:     {errors + errors_acts}")
    if errors + errors_acts > 0:
        print("   ⚠ Check the error messages above and re-run failed batches manually.")


if __name__ == "__main__":
    main()
