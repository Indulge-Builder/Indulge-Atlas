-- ===========================================================================
-- ACADEMY PART 3 of 3 - 12 synthetic scenario seeds
-- ===========================================================================
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query.
--   Select ALL of this file (Ctrl+A in the editor after pasting) and Run.
--   IMPORTANT: the Supabase SQL editor runs only the HIGHLIGHTED text when a
--   selection exists. If part of the file is selected you will get errors
--   like `relation "our" does not exist` - that is a half-pasted string
--   literal, not a real missing table. Clear the selection / select all.
--
--   Run this LAST, after Part 2 succeeds.
--   Safe to re-run: the INSERT is guarded by WHERE NOT EXISTS on title,
--   so it will not duplicate seeds.
--
-- Source: supabase/migrations/126_academy_seed_library.sql
-- Generated 2026-07-27
-- ===========================================================================

-- Migration 126: Academy — 12 starter scenario seeds (2 per vertical).
--
-- Depends on 125 (scenario_seeds table).
--
-- ALL data here is SYNTHETIC. No real client names, numbers, or details.
-- Each seed carries hidden_constraints the client reveals ONLY when the intern
-- probes correctly. rubric_weights weight factual_accuracy higher so invented
-- details are penalised hard. {{name}} / {{date}} tokens are randomised
-- per-session at runtime (lib/academy/randomize.ts).
--
-- Data-only migration (no schema change) — applied via `supabase db push`.
--
-- RE-RUN SAFE: the whole INSERT is guarded by a NOT EXISTS on the seed titles,
-- so re-running after a partial failure will not duplicate the 12 seeds.

INSERT INTO public.scenario_seeds
  (title, archetype, vertical, opening_message, hidden_constraints, difficulty, escalation_trigger, ideal_outcome, rubric_weights)
SELECT * FROM (VALUES
-- ── Global ───────────────────────────────────────────────────────────────────
(
  'Cancelled dinner reservation, guests arriving tonight',
  'Frustrated host, high expectations',
  'Global',
  'Hi, {{name}} here. I booked a table for four at the harbour restaurant for tonight through your team last week, and the restaurant has just told me there is no reservation under my name. My guests land in two hours. I need this sorted.',
  '[
    {"id":"party_size","label":"Actual party size","reveal_when":"intern confirms the number of covers","value":"The party is actually six, not four - two colleagues joined last minute"},
    {"id":"allergy","label":"Shellfish allergy","reveal_when":"intern asks about dietary needs or preferences","value":"One guest has a severe shellfish allergy"}
  ]'::jsonb,
  'medium',
  'Intern is slow to acknowledge, offers no alternative within the first two replies, or blames the restaurant instead of owning the fix.',
  'Own the error, secure a comparable or better table for the correct party size tonight, capture the allergy, and confirm details back before guests arrive.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Private jet delayed, tight onward connection',
  'Time-pressured executive',
  'Global',
  'This is {{name}}. My charter out of Nice tomorrow is now showing a two hour delay for weather, and it will make me miss everything after. Can you look at options.',
  '[
    {"id":"deadline","label":"Real hard deadline","reveal_when":"intern asks why the timing matters or what is at stake","value":"There is a board meeting at 4pm that cannot move - everything else can flex"},
    {"id":"budget","label":"Budget is flexible","reveal_when":"intern asks about budget or proposes a costlier charter","value":"Cost is not the concern for this trip - a repositioned aircraft is acceptable"}
  ]'::jsonb,
  'hard',
  'Intern presents only the delay as fact, fails to ask what is time-critical, or proposes nothing actionable within two replies.',
  'Establish the true fixed constraint (the 4pm board meeting), propose a viable reposition or alternative that protects it, and confirm.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
-- ── House ────────────────────────────────────────────────────────────────────
(
  'Villa air-conditioning failed mid-stay',
  'Uncomfortable guest, family in tow',
  'House',
  '{{name}} here. We are two days into our stay at the villa and the air conditioning in the main bedrooms has stopped working. It is stifling. This is not what we paid for.',
  '[
    {"id":"infant","label":"Infant in the party","reveal_when":"intern asks who is affected or about the household","value":"There is a six month old baby - the heat is genuinely urgent, not just uncomfortable"},
    {"id":"move","label":"Open to a villa move","reveal_when":"intern asks what outcome would make it right","value":"They would happily move to another villa if the fix is not fast"}
  ]'::jsonb,
  'medium',
  'Intern offers only to log a maintenance request with no timeline, or fails to grasp urgency once the infant is mentioned.',
  'Acknowledge, treat as urgent given the infant, offer an immediate fix with a timeline AND a villa move as a fallback, and follow up.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Airport chauffeur did not show',
  'Stranded arrival, elderly parent',
  'House',
  'Hi, this is {{name}}. I have just landed and the car that was booked to collect us is nowhere to be seen. Nobody is answering the driver number. We are standing at arrivals.',
  '[
    {"id":"elderly","label":"Elderly parent waiting","reveal_when":"intern asks who is travelling or about any special needs","value":"An elderly parent is with them and cannot stand for long"},
    {"id":"wheelchair","label":"Accessibility need","reveal_when":"intern asks about accessibility or vehicle requirements","value":"They need a wheelchair accessible vehicle"}
  ]'::jsonb,
  'medium',
  'Intern spends replies apologising without dispatching a replacement, or sends a standard car after the accessibility need is known.',
  'Apologise briefly, dispatch a suitable accessible replacement immediately with an ETA, keep the guest informed, and confirm pickup.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
-- ── Shop ─────────────────────────────────────────────────────────────────────
(
  'Limited-edition handbag needed by Friday',
  'Determined shopper, firm deadline',
  'Shop',
  'Hello, {{name}} here. I am after the limited edition tote in the seasonal colour and I need it in hand by Friday. Every boutique I have called says it is sold out. Can your team find one.',
  '[
    {"id":"real_deadline","label":"Real deadline","reveal_when":"intern confirms exactly when and why Friday matters","value":"The real deadline is a gift on Thursday evening, not Friday - so it must arrive Thursday"},
    {"id":"colourway","label":"Colour flexibility","reveal_when":"intern asks whether an alternative colour or style is acceptable","value":"A different colourway in the same model would be perfectly acceptable"}
  ]'::jsonb,
  'medium',
  'Intern promises the exact item without checking availability, or gives up citing sold-out stock without exploring alternatives.',
  'Surface the true Thursday deadline and the colour flexibility, set realistic expectations, and pursue a sourced alternative rather than over-promising.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Anniversary gift, something nice',
  'Vague brief, wants to be guided',
  'Shop',
  'Hi {{name}}. It is my wife and my anniversary next week and I want to get her something really special this year. I am not sure what. Can you suggest something.',
  '[
    {"id":"dislikes","label":"Dislikes jewellery","reveal_when":"intern asks about her tastes or what she already owns","value":"She is not a jewellery person and would find another watch impersonal"},
    {"id":"vegan","label":"Recipient is vegan","reveal_when":"intern asks about lifestyle, values or materials","value":"She is vegan and cares about it - no leather or animal products"},
    {"id":"budget","label":"Budget flexible up","reveal_when":"intern asks about budget","value":"Budget is genuinely open for the right thing"}
  ]'::jsonb,
  'hard',
  'Intern proposes generic gifts (jewellery, a watch) without asking a single discovery question, or presents leather goods after vegan is known.',
  'Ask discovery questions, uncover the vegan and no-jewellery constraints, and propose a thoughtful, personal, values-aligned gift.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
-- ── Legacy ───────────────────────────────────────────────────────────────────
(
  'Long-standing member feels overlooked',
  'Loyal member, quietly hurt',
  'Legacy',
  'Good afternoon. This is {{name}}. I have been a member for many years. My anniversary with Indulge is coming up and, frankly, I have felt rather forgotten of late. I wanted to raise it.',
  '[
    {"id":"widowed","label":"Recently widowed","reveal_when":"intern asks a gentle, personal question or listens for the emotional context","value":"Recently widowed - this milestone is emotionally heavy and needs sensitivity"},
    {"id":"privacy","label":"Wants privacy","reveal_when":"intern proposes any celebration or gesture","value":"Wants something private and understated - absolutely no social posts or public recognition"}
  ]'::jsonb,
  'hard',
  'Intern responds transactionally, proposes a public celebration, or misses the emotional register entirely.',
  'Lead with warmth and listening, honour the sensitivity, and propose a private, personal gesture - never public.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Rare wine for the family cellar',
  'Collector, detail-oriented',
  'Legacy',
  'Hello, {{name}} speaking. I am looking to acquire a case of a particular older vintage for the cellar. I have seen a few listings but I want to go through you. Can you help source it.',
  '[
    {"id":"provenance","label":"Provenance is the real concern","reveal_when":"intern asks what matters most or about authentication","value":"Price is secondary - provenance and authentication are the real worry after being sold a fake once before"},
    {"id":"gathering","label":"Deadline is a family gathering","reveal_when":"intern asks about timing","value":"It is for a family gathering in three weeks"}
  ]'::jsonb,
  'medium',
  'Intern focuses on price and speed while ignoring provenance, or promises authenticity it cannot verify.',
  'Recognise provenance and authentication as the priority, commit to verified sourcing with documentation, and align to the three-week timeline.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
-- ── Dubai ────────────────────────────────────────────────────────────────────
(
  'Last-minute yacht charter for guests',
  'Host arranging for VIPs',
  'Dubai',
  'Hi, {{name}} here. I need a yacht for a group of my guests this weekend, roughly a dozen people, a full day out from the marina. Can you arrange it.',
  '[
    {"id":"vvip","label":"A VVIP guest","reveal_when":"intern asks about the guests or any discretion needs","value":"One guest is a VVIP who requires complete discretion and no crew photographs"},
    {"id":"no_alcohol","label":"No alcohol to be served","reveal_when":"intern asks about catering or preferences","value":"No alcohol is to be served on board for this group"}
  ]'::jsonb,
  'medium',
  'Intern books a standard party charter, arranges alcohol, or ignores discretion after the VVIP is flagged.',
  'Capture the discretion and no-alcohol constraints, arrange a suitable charter and catering, and confirm the privacy handling.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Desert experience and fine dining for guests',
  'Host planning an evening',
  'Dubai',
  'Good evening, {{name}}. I would love to arrange a special desert evening for a couple of guests tomorrow - something memorable, dinner included. What can you put together.',
  '[
    {"id":"pregnant","label":"A guest is pregnant","reveal_when":"intern asks about the guests or any activity limits","value":"One guest is pregnant - no dune bashing or adventurous activity"},
    {"id":"halal","label":"Halal required","reveal_when":"intern asks about dietary needs","value":"The dining must be fully halal"},
    {"id":"budget","label":"Budget flexible","reveal_when":"intern asks about budget","value":"Budget is flexible for the right experience"}
  ]'::jsonb,
  'medium',
  'Intern proposes dune bashing or a non-halal menu, or plans the evening without any discovery.',
  'Discover the pregnancy and halal constraints, design a gentle, memorable halal desert evening, and confirm.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
-- ── GMR (Global Member Relations) ────────────────────────────────────────────
(
  'Membership billing looks wrong',
  'Confused, mildly annoyed member',
  'GMR',
  'Hi {{name}}. I have just seen my membership renewal come through and the amount is higher than I expected. I am thinking I may just cancel. Can someone explain this.',
  '[
    {"id":"mischarge","label":"Actually mischarged","reveal_when":"intern investigates the charge rather than defending it","value":"They were genuinely charged for a tier they did not upgrade to - it is a billing error"},
    {"id":"downgrade","label":"Wants to downgrade not cancel","reveal_when":"intern asks what they actually want or explores options","value":"They do not really want to leave - a lower tier would keep them happy"}
  ]'::jsonb,
  'medium',
  'Intern defends the charge without checking, or lets the member walk toward cancellation without exploring the real want.',
  'Investigate and own the billing error, correct it, and retain the member by surfacing the downgrade option rather than cancellation.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Repeated service failures, threatening to leave',
  'Fed-up member at the edge',
  'GMR',
  'This is {{name}}. Honestly I have had enough. Three requests in a row have gone wrong and I am seriously considering cancelling my membership. I wanted to give you one last chance to change my mind.',
  '[
    {"id":"single_poc","label":"Wants one point of contact","reveal_when":"intern asks what would rebuild trust or make it right","value":"The real fix is a single dedicated concierge - they hate being passed around"},
    {"id":"comms","label":"Real issue is communication","reveal_when":"intern digs into what actually went wrong each time","value":"The failures were mostly poor communication, not the services themselves"}
  ]'::jsonb,
  'hard',
  'Intern gets defensive, offers a generic apology or a discount without addressing the trust issue, or fails to ask what would rebuild the relationship.',
  'De-escalate with genuine ownership, uncover that the real issue is communication and continuity, and offer a dedicated concierge to retain them.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
)) AS v(
  title, archetype, vertical, opening_message, hidden_constraints,
  difficulty, escalation_trigger, ideal_outcome, rubric_weights
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.scenario_seeds s WHERE s.title = v.title
);
