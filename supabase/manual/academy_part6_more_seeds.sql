-- ===========================================================================
-- ACADEMY PART 6 - 12 more scenario seeds (24 total)
-- ===========================================================================
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query.
--   Paste, then press Ctrl+A to be sure NOTHING is partially selected, Run.
--   (The SQL editor executes only the highlighted text when a selection
--    exists - a half-selected string literal produces confusing errors
--    like `relation "our" does not exist`.)
--
--   Run AFTER part 3. Adds 12 further synthetic seeds so the library covers
--   4 per vertical and the picker shuffle has real variety.
--   Safe to re-run: guarded by WHERE NOT EXISTS on title.
--
-- Source: supabase/migrations/128_academy_seed_library_expansion.sql
-- Generated 2026-07-27
-- ===========================================================================

-- Migration 128: Academy — 12 additional scenario seeds (24 total, 4 per vertical).
--
-- Doubles the drill library so interns cannot exhaust it in a session and so the
-- shuffle in the picker has real variety to draw on. Depends on 125 (table) and
-- complements 126 (the first 12).
--
-- ALL data is SYNTHETIC. No real client names, numbers, or details.
-- Several of these are written to invite a photo/video share (see migration 127),
-- e.g. "send me a picture of the room", so the attachment path gets exercised.
--
-- RE-RUN SAFE: guarded by WHERE NOT EXISTS on title.

INSERT INTO public.scenario_seeds
  (title, archetype, vertical, opening_message, hidden_constraints, difficulty, escalation_trigger, ideal_outcome, rubric_weights)
SELECT * FROM (VALUES
-- ── Global ───────────────────────────────────────────────────────────────────
(
  'Anniversary trip, wants it planned end to end',
  'Warm but exacting, delegates fully',
  'Global',
  'Hello, {{name}} here. My wife and I have our tenth anniversary {{date}} and I would like to hand the whole thing over to you - flights, somewhere special to stay, one really memorable evening. Where do we start.',
  '[
    {"id":"fear_flying","label":"Wife dislikes long flights","reveal_when":"intern asks about travel preferences or flight length","value":"His wife strongly dislikes flights over four hours - keep it short-haul"},
    {"id":"surprise","label":"It is a surprise","reveal_when":"intern asks whether she is involved in the planning","value":"It is a surprise - she must not be contacted or cc-ed on anything"},
    {"id":"anniversary_date","label":"Date is immovable","reveal_when":"intern confirms exact dates","value":"The date cannot move - it is the actual anniversary"}
  ]'::jsonb,
  'medium',
  'Intern starts proposing long-haul destinations without asking anything, or suggests contacting the wife to check her preferences.',
  'Discover the short-haul constraint and the surprise, then propose a short-haul plan with one standout evening, keeping her entirely out of the loop.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Lost luggage with medication inside',
  'Anxious traveller, genuinely urgent',
  'Global',
  '{{name}} here. The airline has lost my suitcase on arrival and my medication is in it. They are telling me twenty four hours minimum. I am not sure what to do.',
  '[
    {"id":"prescription","label":"Needs a prescription locally","reveal_when":"intern asks what the medication is for or whether it is essential","value":"It is daily blood pressure medication - missing it is a genuine health risk, not an inconvenience"},
    {"id":"doctor","label":"Has no local doctor","reveal_when":"intern asks whether they can get a local prescription","value":"They have no local doctor and do not speak the language"}
  ]'::jsonb,
  'hard',
  'Intern treats it as a routine baggage claim, chases the airline only, or fails to grasp the medical urgency once the medication is mentioned.',
  'Recognise the health risk immediately, arrange a local doctor or pharmacy route for the prescription, and chase the baggage in parallel rather than instead.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
-- ── House ────────────────────────────────────────────────────────────────────
(
  'Villa photos do not match the listing',
  'Disappointed on arrival, wants proof taken seriously',
  'House',
  'Hi, this is {{name}}. We have just arrived at the villa and it does not look like the photos at all. The pool area is half under construction. I am sending you a picture.',
  '[
    {"id":"noise","label":"Construction starts at 7am","reveal_when":"intern asks how it is affecting the stay day to day","value":"Construction noise starts at 7am daily - the real problem is sleep, not looks"},
    {"id":"stay_length","label":"Ten more nights booked","reveal_when":"intern asks how long they are staying","value":"They have ten more nights booked - this is not a one-night inconvenience"}
  ]'::jsonb,
  'medium',
  'Intern accepts the complaint without asking for or acknowledging the photo, offers a token discount, or fails to establish how long they must endure it.',
  'Acknowledge the evidence, establish the ten-night duration and the 7am noise, and drive to a relocation or substantive remedy rather than a gesture.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Housekeeping broke a personal item',
  'Upset but reasonable, values the object not the money',
  'House',
  '{{name}} here. Housekeeping has broken a framed photograph of my late father that I travel with. I am not angry about the money, but I am quite upset.',
  '[
    {"id":"repair","label":"Frame is repairable","reveal_when":"intern asks about the item itself rather than compensation","value":"The photograph is fine - only the frame is broken, and it could be restored"},
    {"id":"no_money","label":"Refuses compensation","reveal_when":"intern offers money or a credit","value":"They will be offended by a cash offer - they want care, and an apology from the person involved"}
  ]'::jsonb,
  'hard',
  'Intern leads with compensation or a credit, treats it as a claims process, or misses the emotional weight entirely.',
  'Respond with genuine care first, establish that the photograph survived and the frame can be restored, arrange restoration, and never reduce it to money.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
-- ── Shop ─────────────────────────────────────────────────────────────────────
(
  'Watch arrived with a scratch',
  'Collector, precise, wants it made right',
  'Shop',
  'Hello, {{name}}. The watch arrived this morning and there is a hairline scratch on the clasp. I have photographed it. This was meant to be new.',
  '[
    {"id":"gift_deadline","label":"It is a gift for Saturday","reveal_when":"intern asks whether it is needed by a particular date","value":"It is a gift being given on Saturday - a four-week replacement is useless"},
    {"id":"accepts_polish","label":"Would accept same-day polish","reveal_when":"intern asks what outcome would be acceptable","value":"They would accept a same-day professional polish rather than wait for a replacement"}
  ]'::jsonb,
  'medium',
  'Intern immediately promises a replacement without asking about timing, or disputes whether the scratch was pre-existing.',
  'Accept the evidence without argument, surface the Saturday deadline, and land the same-day polish as the option that actually works.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Wants a sold-out sneaker for a teenager',
  'Parent out of their depth, slightly embarrassed',
  'Shop',
  'Hi {{name}} here. My son wants a particular pair of trainers for his birthday and I am told they are impossible to get. I do not really understand any of this, honestly.',
  '[
    {"id":"size","label":"Does not know the size","reveal_when":"intern asks for the size","value":"They do not know his size and will need to find out discreetly"},
    {"id":"resale_ok","label":"Open to verified resale","reveal_when":"intern explains sourcing options including resale","value":"They are fine with a verified resale purchase as long as it is authentic"},
    {"id":"birthday","label":"Birthday is in three weeks","reveal_when":"intern asks when it is needed","value":"The birthday is in three weeks, so there is more time than they implied"}
  ]'::jsonb,
  'easy',
  'Intern uses sneaker jargon without explaining, makes the member feel foolish, or declares it impossible.',
  'Be patient and jargon-free, surface the size gap and the three-week runway, and propose an authenticated resale route with clear next steps.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
-- ── Legacy ───────────────────────────────────────────────────────────────────
(
  'Wants to add a family member to the membership',
  'Careful, privacy-conscious patriarch',
  'Legacy',
  'Good morning. {{name}} here. I would like to add my daughter to my membership, but there are some things about my account I would prefer she does not see.',
  '[
    {"id":"privacy","label":"Wants spend hidden","reveal_when":"intern asks what specifically should stay private","value":"He does not want her to see historical spend or past gift purchases"},
    {"id":"gift","label":"It is a graduation gift","reveal_when":"intern asks about the occasion or timing","value":"It is a graduation gift and he wants it to feel like a gift, not an administrative change"}
  ]'::jsonb,
  'medium',
  'Intern promises full account visibility separation without checking what is possible, or treats it as a pure admin task and ignores the gift framing.',
  'Establish exactly what must stay private, be honest about what separation is and is not possible, and make the addition feel like the gift it is.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Art acquisition, wants discretion',
  'Serious collector, tests you before trusting you',
  'Legacy',
  'This is {{name}}. There is a piece coming to auction {{date}} that I am interested in. I would rather my interest not be widely known. Can you assist.',
  '[
    {"id":"anonymity","label":"Must bid anonymously","reveal_when":"intern asks about discretion or how they wish to bid","value":"He must not be publicly connected to the bid - a known interest would drive the price up"},
    {"id":"ceiling","label":"Has a hard ceiling","reveal_when":"intern asks about a maximum","value":"There is a firm ceiling he will not exceed, and he wants to be talked out of chasing it"}
  ]'::jsonb,
  'hard',
  'Intern discusses the piece openly, promises to secure it, or pushes him to bid higher.',
  'Treat discretion as the primary requirement, arrange anonymous representation, respect the ceiling, and never promise an auction outcome.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
-- ── Dubai ────────────────────────────────────────────────────────────────────
(
  'Restaurant refused entry over dress code',
  'Embarrassed and angry, in public',
  'Dubai',
  '{{name}} here. We have just been turned away from the restaurant you booked because of a dress code nobody mentioned. I am standing outside with four guests. This is humiliating.',
  '[
    {"id":"guests","label":"Guests are business clients","reveal_when":"intern asks who they are with","value":"The guests are business clients he was trying to impress - the embarrassment is the real damage"},
    {"id":"nearby","label":"Will accept anywhere good nearby","reveal_when":"intern offers an immediate alternative","value":"He will accept any strong alternative within ten minutes walk - speed matters more than prestige"}
  ]'::jsonb,
  'hard',
  'Intern explains the dress code policy, defends the restaurant, or takes more than one reply to offer an immediate alternative.',
  'Own the miss without excuses, get a strong alternative within walking distance immediately, and follow up afterwards about the booking failure.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Wants a helicopter transfer for guests',
  'Efficient, transactional, hates being upsold',
  'Dubai',
  'Hi. {{name}}. I need a helicopter transfer for two guests {{date}}. Straightforward request. What do you need from me.',
  '[
    {"id":"weight","label":"One guest exceeds standard weight limit","reveal_when":"intern asks for passenger details or weights","value":"One guest is well above the standard weight allowance and a different aircraft is required"},
    {"id":"fear","label":"Guest is nervous flying","reveal_when":"intern asks whether the guests have flown by helicopter before","value":"One guest is nervous and would prefer a car if the flight is rough"}
  ]'::jsonb,
  'medium',
  'Intern books without collecting passenger details, or pads the request with unnecessary extras after being told it is straightforward.',
  'Ask the few operationally necessary questions, surface the weight and nerves, confirm the right aircraft, and stay brisk without upselling.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
-- ── GMR ──────────────────────────────────────────────────────────────────────
(
  'Asking what the membership actually includes',
  'Polite, unconvinced, quietly auditing you',
  'GMR',
  'Hi {{name}}. I have been a member about a year and, honestly, I am not sure I understand what I am actually getting. Could you walk me through it.',
  '[
    {"id":"unused","label":"Has barely used the service","reveal_when":"intern asks what they have used so far","value":"They have made only two requests all year and did not realise most of the service existed"},
    {"id":"renewal","label":"Renewal is next month","reveal_when":"intern asks about timing or renewal","value":"Their renewal is next month and they are quietly deciding whether to continue"}
  ]'::jsonb,
  'medium',
  'Intern recites a feature list without asking about their actual usage, or misses that this is a retention conversation.',
  'Recognise this as a renewal risk, discover the near-zero usage, and translate the membership into concrete things relevant to how they actually live.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
),
(
  'Complaint about a previous concierge',
  'Measured, but wants accountability',
  'GMR',
  'Good afternoon, {{name}} speaking. I would like to raise something about how a request of mine was handled last month. I am not looking to get anyone in trouble, but it should not have happened.',
  '[
    {"id":"promise","label":"Was promised something undeliverable","reveal_when":"intern asks what specifically went wrong","value":"The previous concierge promised a confirmed booking that never existed, then went quiet"},
    {"id":"wants","label":"Wants process change not punishment","reveal_when":"intern asks what they would like to happen now","value":"They want assurance the process has changed - explicitly not disciplinary action"}
  ]'::jsonb,
  'hard',
  'Intern becomes defensive of the colleague, promises disciplinary action, or fails to establish what actually happened.',
  'Listen without defensiveness, establish that a false confirmation was given, and commit to a concrete process assurance rather than punishment.',
  '{"comprehension":1,"brand_tone":1,"factual_accuracy":1.5,"proactivity":1,"escalation_judgment":1,"closure":1}'::jsonb
)) AS v(
  title, archetype, vertical, opening_message, hidden_constraints,
  difficulty, escalation_trigger, ideal_outcome, rubric_weights
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.scenario_seeds s WHERE s.title = v.title
);
