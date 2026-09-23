-- Migration 133: re-point the 40 taught tasks at the PDF edition of the register.
--
-- WHY THIS EXISTS
--   Migration 130 seeded 176 rows from `supabase/seed-data/academy-task-register.json`.
--   The Task Register PDF later supplied by the business is a DIFFERENT, de-duplicated
--   edition of the same register: it folds clarifications back into the request they
--   belong to and moves the standing rules to the end, so the numbering diverges.
--   Both editions carry 176 entries, which is why nothing ever failed a count check.
--
--   Examples of the divergence (PDF number -> what each edition calls it):
--       4   PDF "Goa lunch restaurant recommendations"  vs seeded "Vietnam family group tour"
--      14   PDF "Brother's birthday gift"               vs seeded "Laptop upgrade advice"
--      65   PDF "150-guest birthday party in August"    vs seeded "Seradhura to the office"
--   Some numbers agree in both (141, 150, 152), which makes the mismatch harder to spot,
--   not easier.
--
--   The business has confirmed the PDF is the source of truth, so the 40 tasks that make
--   up the four-day curriculum are re-pointed here.
--
-- SCOPE, STATED PLAINLY
--   Only the 40 taught task numbers are rewritten. The other 136 rows keep their
--   migration-130 content and remain available as archive/free practice. That means the
--   register is briefly mixed-edition: a handful of requests exist under two numbers
--   (e.g. the Goa lunch request is PDF 4 here and seeded 6 there). That is deliberate —
--   rewriting all 176 would renumber rows that completed sessions already point at.
--
-- HISTORY WARNING
--   `training_sessions.seed_id` is a UUID, so sessions survive this change — but a session
--   completed against the OLD content of one of these 40 rows will now display the NEW
--   title. Its transcript and score are untouched and still accurate; only the heading
--   moves. Run this before a cohort starts, not mid-programme.
--
-- MIGRATION NUMBER
--   133 is the next free number in the repo listing, but this repo has had numbering
--   collisions and ~25 uncommitted migrations. VERIFY against the live database before
--   applying. Migration 132 (training_response_signals) is also still unapplied.

BEGIN;

-- Difficulty follows the four-day progression: Day 1 easy -> Day 4 expert, using the
-- tiers the UI already renders. No new difficulty system.
UPDATE public.scenario_seeds AS s
SET title            = v.title,
    brief            = v.brief,
    opening_message  = v.opening_message,
    raised_by        = v.raised_by,
    difficulty       = v.difficulty,
    is_active        = true
FROM (VALUES
  -- ── Day 1 · easy ───────────────────────────────────────────────────────────
  (4,   'Goa lunch restaurant recommendations',
        'Table needed at 1:00 pm the same day. Share the link and images, and verify the place is actually open before recommending it.',
        'Need a lunch spot in Goa for 1 pm today. Send the link and some pictures — and please check it''s actually open before you send it.',
        'Savio', 'easy'),
  (14,  'Brother''s birthday gift',
        'Birthday on 27 July. Something cool.',
        'My brother''s birthday is on 27 July. Looking for something cool.',
        'Advita', 'easy'),
  (24,  'Airport meet and greet',
        'Typical cost in India.',
        'What does an airport meet and greet typically cost in India?',
        'Advita', 'easy'),
  (29,  'Five boxes of mini waffles',
        'For the team, to mark two renewals.',
        'Can you send five boxes of mini waffles for the team? We''ve closed two renewals.',
        'Advita', 'easy'),
  (31,  'ENT specialist in Goa',
        'Sore throat for over a week, already seen a doctor with no resolution.',
        'I''ve had a sore throat for over a week now. Already saw a doctor and it hasn''t helped — can you find me a good ENT in Goa?',
        'Advita', 'easy'),
  (47,  'Chennai weather',
        'Update for today.',
        'What''s the weather doing in Chennai today?',
        'Advita', 'easy'),
  (54,  'Quirky rakhis',
        'For her brothers.',
        'Looking for quirky rakhis for my brothers.',
        'Advita', 'easy'),
  (71,  'Watch for a 21-year-old',
        'Just starting a business. Budget 2 to 3 lakh.',
        'Need a watch for a 21-year-old who''s just starting his own business. Budget is 2 to 3 lakh.',
        'Advita', 'easy'),
  (84,  'Thailand visa process',
        'What the process is.',
        'What''s the process for a Thailand visa?',
        'Savio', 'easy'),
  (100, 'Post-wedding gift hamper',
        'Up to 10 lakh, Mumbai, needed by month end.',
        'Need a post-wedding gift hamper — up to 10 lakh, delivering in Mumbai, needed by month end.',
        'Ananyshree', 'easy'),

  -- ── Day 2 · medium ─────────────────────────────────────────────────────────
  (107, 'Kids'' activities in Baku',
        'A list.',
        'Can you send me a list of things for the kids to do in Baku?',
        'Savio', 'medium'),
  (110, 'Dubai itinerary',
        'For a couple.',
        'Need a Dubai itinerary — it''s for a couple.',
        'Advita', 'medium'),
  (115, 'Fountain pens for daily use',
        'Something heavy — like a Sailor but not a Sailor. Montblanc, LV and equivalent houses.',
        'Looking for a fountain pen for daily use. Something with weight to it — like a Sailor, but not a Sailor. Montblanc, LV, that level.',
        'Advita', 'medium'),
  (117, 'Linen workwear',
        'Work-appropriate linen for Goa, including linen blazers.',
        'I need work-appropriate linen for Goa — including linen blazers.',
        'Advita', 'medium'),
  (133, 'Hamper for a newborn baby girl',
        'Born in Mumbai. Something that can go tomorrow.',
        'A friend''s just had a baby girl in Mumbai. Need a hamper that can go out tomorrow.',
        'Advita', 'medium'),
  (141, 'Voter ID process in Delhi',
        'Does not have one — what is the election card process.',
        'I don''t have a voter ID. What''s the process for the election card in Delhi?',
        'Ananyshree', 'medium'),
  (150, 'Best mental health professional in India',
        'Recommendations.',
        'Can you recommend the best mental health professionals in India?',
        'Advita', 'medium'),
  (152, 'Nanny agencies in Delhi NCR',
        'Top notch, UHNI clientele, proven results. Shortlist five.',
        'I need nanny agencies in Delhi NCR — top notch, the ones that work with UHNI families and have proven results. Shortlist five for me.',
        'Syndia', 'medium'),
  (163, 'Flowers in Hyderabad',
        'Budget 6k. Share options.',
        'Need flowers in Hyderabad, budget around 6k. Send me options.',
        'Savio', 'medium'),
  (95,  'Radiologist appointment for ultrasound',
        'Today before 4:00 pm at the shared location. Written confirmation and the name the appointment sits under. Later postponed.',
        'Need a radiologist appointment for an ultrasound today, before 4 pm, at the location I shared. Send written confirmation and tell me whose name it''s under.',
        'Savio', 'medium'),

  -- ── Day 3 · advanced ───────────────────────────────────────────────────────
  (5,   'Goa to Hyderabad flights',
        '15 July, morning departures.',
        'Flights Goa to Hyderabad on 15 July — morning departures.',
        'Savio', 'advanced'),
  (3,   'Vietnam family group tour',
        '12 adults plus one child aged 7. Hanoi 2 nights plus a second location of your choosing for 2 nights, 4 nights total, travelling 15 October. Draft the itinerary.',
        'Planning Vietnam for 12 adults and one child aged 7. Hanoi for 2 nights plus a second spot of your choosing for 2 nights — 4 nights total, travelling 15 October. Draft the itinerary.',
        'Anishqa', 'advanced'),
  (2,   'Four watches from LuxurySouq',
        'Patek Philippe Nautilus 5712R-001, AP Code 11.59 26393NR, AP Code 11.59 26394OR, AP Code 11.59 Chronograph 26393OR. Reference number, cost, delivery time, year of billing, warranty validity, payment mode and timeline. Brand new unused pieces only. Regular buyer, likely to take at least two.',
        'Four pieces from LuxurySouq: Patek Philippe Nautilus 5712R-001, AP Code 11.59 26393NR, AP Code 11.59 26394OR, and the AP Code 11.59 Chronograph 26393OR. For each I need the reference number, cost, delivery time, year of billing, warranty validity, payment mode and timeline. Brand new unused pieces only — I''ll likely take at least two.',
        'Vikram', 'advanced'),
  (6,   'London countryside stay',
        'One night in the country, beautiful setting, ideally an old castle. Hotel around 100 pounds maximum. Room photos and Google Maps link.',
        'One night in the English countryside — beautiful setting, ideally an old castle. Around 100 pounds maximum. Send room photos and a Google Maps link.',
        'Anishqa', 'advanced'),
  (10,  'Braille tutor at home',
        'Has wanted to learn braille for a while. Can a tutor come to the house.',
        'I''ve wanted to learn braille for a while now. Can a tutor come to the house?',
        'Advita', 'advanced'),
  (12,  'Whoop charger',
        'Source a replacement.',
        'I need a replacement Whoop charger.',
        'Advita', 'advanced'),
  (16,  'Two wine chillers with lock',
        'Sized to the cabinet drawing supplied as a PDF — can be smaller than the marked space but not a tight snug fit. Refined: only 15-bottle units will fit, two required, lock is mandatory. Vendor details and a couple of options. Also wanted in Kolkata.',
        'I need two wine chillers, sized to the cabinet drawing I sent. They can be smaller than the marked space but not a tight snug fit. Only 15-bottle units will fit and the lock is mandatory. Send vendor details and a couple of options — also need this in Kolkata.',
        'Anishqa', 'advanced'),
  (18,  'Rolex Panda',
        'What it costs.',
        'What does the Rolex Panda cost?',
        'Advita', 'advanced'),
  (21,  'Rolex from store at MRP',
        'Can it be done. Confirm the piece is unused and there is no tax on it. Whatever is committed will have to be arranged.',
        'Can you get me a Rolex from the store at MRP? Confirm the piece is unused and there''s no tax on it — and whatever you commit to, you''ll have to arrange.',
        'Advita', 'advanced'),
  (23,  'Temples in Ratnagiri',
        'Refined after the first attempt: temples set in water and beautiful during the monsoon. Deeper research required.',
        'Not what I meant — I''m after temples in Ratnagiri that are set in water and look beautiful during the monsoon. Go deeper on this one.',
        'Advita', 'advanced'),

  -- ── Day 4 · expert ─────────────────────────────────────────────────────────
  (25,  'Property in South Coorg',
        'Near Virajpet, close to his coffee estate. Roughly 75 cents, around 4,000 sq ft, modern bungalow style, move-in ready — not old or rundown. The reference property sold, so watch for similar. Building on the existing estate is not ruled out. Connect with real estate agents and share their details.',
        'Looking for property in South Coorg, near Virajpet, close to my coffee estate. Roughly 75 cents, around 4,000 sq ft, modern bungalow style and move-in ready — not old or rundown. The one I referenced has sold, so watch for similar. I haven''t ruled out building on the existing estate. Connect with agents and share their details.',
        'Anishqa', 'expert'),
  (30,  'Australia and Fiji, 14 days',
        'Two friends travelling August or September. Sydney 3N, Hobart 2N, Melbourne 3N, Fiji 3N, Brisbane 2N. Hotels, dining, activities. Avant-garde suggestions only. Fiji optional if flights from the mainland prove too expensive. Compile into one PDF or PPT.',
        'Two friends travelling August or September, 14 days: Sydney 3N, Hobart 2N, Melbourne 3N, Fiji 3N, Brisbane 2N. Hotels, dining and activities — avant-garde suggestions only, nothing obvious. Drop Fiji if the flights from the mainland are too expensive. Compile it into one PDF or PPT.',
        'Ananyshree', 'expert'),
  (35,  'US visa',
        'Can it be arranged, at what cost, and can it be guaranteed. Happy to pay more.',
        'Can you arrange a US visa? What does it cost, and can it be guaranteed? Happy to pay more for certainty.',
        'Advita', 'expert'),
  (36,  'Personal stylist',
        'To build a wardrobe for work.',
        'I want a personal stylist to build out a wardrobe for work.',
        'Advita', 'expert'),
  (37,  'Cook for home',
        'Profiles. Team to know which PDF to send.',
        'Send me profiles for a cook for the house.',
        'Advita', 'expert'),
  (40,  'Table for two at Naru',
        'Unavailable on the night — premium nearby alternatives needed.',
        'Naru''s not available that night. What else is there nearby at that level?',
        'Advita', 'expert'),
  (42,  'Hermes Mini Kelly',
        'Some options.',
        'Hermes Mini Kelly — send me some options.',
        'Advita', 'expert'),
  (48,  'Sunday plan in Goa',
        'Good places for lunch, plus a Bollywood or jive workshop.',
        'Planning Sunday in Goa — good places for lunch, and see if there''s a Bollywood or jive workshop on.',
        'Advita', 'expert'),
  (57,  'Japan souvenirs',
        'What to bring back to India for the family.',
        'What should I bring back from Japan for the family?',
        'Ananyshree', 'expert'),
  (65,  '150-guest birthday party in August',
        'Restaurant in the Bastian by the Beach tier, no five-star hotels. Call Soraia Bombay, MERCII Mumbai, Milagro Mumbai, Scarlett House and Otra Mumbai to understand what each can do for 150 people. End-to-end plan with images, accommodation and meals. Guests aged 25 to 40.',
        'Birthday party in August for 150 guests, aged 25 to 40. I want a restaurant in the Bastian by the Beach tier — no five-star hotels. Call Soraia Bombay, MERCII Mumbai, Milagro Mumbai, Scarlett House and Otra Mumbai and find out what each can actually do for 150 people. I want an end-to-end plan with images, accommodation and meals.',
        'Anishqa', 'expert')
) AS v(task_number, title, brief, opening_message, raised_by, difficulty)
WHERE s.task_number = v.task_number;

-- Fail loudly rather than half-applying: all 40 taught tasks must exist.
DO $$
DECLARE
  found integer;
BEGIN
  SELECT COUNT(*) INTO found
  FROM public.scenario_seeds
  WHERE task_number IN (
    4,14,24,29,31,47,54,71,84,100,
    107,110,115,117,133,141,150,152,163,95,
    5,3,2,6,10,12,16,18,21,23,
    25,30,35,36,37,40,42,48,57,65
  );

  IF found <> 40 THEN
    RAISE EXCEPTION
      'Expected 40 taught tasks in scenario_seeds, found %. Migration 130 may not be applied, or task numbers differ. Nothing was committed.',
      found;
  END IF;
END $$;

COMMIT;
