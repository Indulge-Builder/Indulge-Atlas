-- ============================================================
-- Indulge Atlas — Initial Schema Migration
-- ============================================================

-- 1. Custom Enum Types
CREATE TYPE user_role AS ENUM ('sales_agent', 'manager', 'admin', 'finance');
CREATE TYPE indulge_domain AS ENUM ('indulge_global', 'indulge_shop', 'the_indulge_house', 'indulge_legacy');
CREATE TYPE lead_status AS ENUM ('new', 'attempted', 'in_discussion', 'won', 'lost', 'nurturing', 'trash');
CREATE TYPE task_type AS ENUM ('call', 'whatsapp_message', 'email', 'file_dispatch', 'general_follow_up');
CREATE TYPE task_status AS ENUM ('pending', 'completed', 'overdue');


-- ============================================================
-- 2. Profiles
--    Extends Supabase auth.users with app-level metadata.
-- ============================================================
CREATE TABLE profiles (
    id          UUID        REFERENCES auth.users(id) PRIMARY KEY,
    full_name   TEXT        NOT NULL,
    email       TEXT        UNIQUE NOT NULL,
    role        user_role   DEFAULT 'sales_agent',
    domain      indulge_domain DEFAULT 'indulge_global',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ============================================================
-- 3. Leads
-- ============================================================
CREATE TABLE leads (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    first_name      TEXT        NOT NULL,
    last_name       TEXT,
    email           TEXT,
    phone_number    TEXT        NOT NULL,
    city            TEXT,

    -- Routing & Tracking
    domain          indulge_domain  DEFAULT 'indulge_global' NOT NULL,
    source          TEXT,           -- e.g. 'meta_ad', 'website_form', 'whatsapp_direct'
    campaign_id     TEXT,           -- Ad-level bifurcation

    -- Status & Assignment
    status          lead_status DEFAULT 'new' NOT NULL,
    assigned_to     UUID        REFERENCES profiles(id),

    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ============================================================
-- 4. Tasks & Follow-ups
-- ============================================================
CREATE TABLE tasks (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id     UUID        REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
    assigned_to UUID        REFERENCES profiles(id) NOT NULL,

    task_type   task_type   NOT NULL,
    status      task_status DEFAULT 'pending' NOT NULL,
    due_date    TIMESTAMP WITH TIME ZONE NOT NULL,
    notes       TEXT,

    created_at  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ============================================================
-- 5. updated_at Auto-Trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER update_leads_modtime
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();


-- ============================================================
-- 6. Row Level Security (RLS)
--    Enable RLS on all tables — policies to be added per role.
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks    ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own row
CREATE POLICY "profiles: own row select"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "profiles: own row update"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Leads: agents see only leads assigned to them; admins/managers see all
CREATE POLICY "leads: assigned agent select"
    ON leads FOR SELECT
    USING (
        assigned_to = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'manager')
        )
    );

CREATE POLICY "leads: assigned agent update"
    ON leads FOR UPDATE
    USING (
        assigned_to = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'manager')
        )
    );

-- Tasks: agents see only their own tasks; admins/managers see all
CREATE POLICY "tasks: assigned agent select"
    ON tasks FOR SELECT
    USING (
        assigned_to = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'manager')
        )
    );

CREATE POLICY "tasks: assigned agent update"
    ON tasks FOR UPDATE
    USING (
        assigned_to = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'manager')
        )
    );
