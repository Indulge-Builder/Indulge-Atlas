-- Migration 110: Concierge ticketing — seed reference data.
--
-- Sources: Indulge_SLA_Policies.pdf, Backend spec (canned responses + checklists).
-- Idempotent: each block is guarded by an empty-table check so re-running is safe.
--
-- SLA durations are CALENDAR minutes (24/7 concierge clock, lib/concierge/slaClock.ts):
--   8h = 480 | 4h = 240 | 1h = 60
--   1 day  = 1440
--   2 days = 2880 (Retail Watches & Bags sourcing)

-- ── Categories + SLA policies + checklist templates ──────────────────────────
DO $$
DECLARE
  travel_id           uuid;
  dining_id           uuid;
  retail_id           uuid;
  events_id           uuid;
  special_id          uuid;
  flight_id           uuid;
  hotel_id            uuid;
  car_id              uuid;
  exp_id              uuid;
  airport_id          uuid;
  itinerary_id        uuid;
  retail_general_id   uuid;
  retail_watches_id   uuid;
  retail_bags_id      uuid;
  retail_gifting_id   uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.ticket_categories LIMIT 1) THEN
    RETURN;  -- already seeded
  END IF;

  -- Top-level categories
  INSERT INTO public.ticket_categories (name, parent_id, sort_order) VALUES ('Travel', NULL, 1) RETURNING id INTO travel_id;
  INSERT INTO public.ticket_categories (name, parent_id, sort_order) VALUES ('Dining', NULL, 2) RETURNING id INTO dining_id;
  INSERT INTO public.ticket_categories (name, parent_id, sort_order) VALUES ('Retail', NULL, 3) RETURNING id INTO retail_id;
  INSERT INTO public.ticket_categories (name, parent_id, sort_order) VALUES ('Events', NULL, 4) RETURNING id INTO events_id;
  INSERT INTO public.ticket_categories (name, parent_id, sort_order) VALUES ('Special Request', NULL, 5) RETURNING id INTO special_id;

  -- Travel subcategories (Itinerary lives here as the canonical parent)
  INSERT INTO public.ticket_categories (name, parent_id, sort_order) VALUES ('Flight', travel_id, 1) RETURNING id INTO flight_id;
  INSERT INTO public.ticket_categories (name, parent_id, sort_order) VALUES ('Hotel Booking', travel_id, 2) RETURNING id INTO hotel_id;
  INSERT INTO public.ticket_categories (name, parent_id, sort_order) VALUES ('Car Transfer', travel_id, 3) RETURNING id INTO car_id;
  INSERT INTO public.ticket_categories (name, parent_id, sort_order) VALUES ('Experiences', travel_id, 4) RETURNING id INTO exp_id;
  INSERT INTO public.ticket_categories (name, parent_id, sort_order) VALUES ('Airport Protocols', travel_id, 5) RETURNING id INTO airport_id;
  INSERT INTO public.ticket_categories (name, parent_id, sort_order) VALUES ('Itinerary', travel_id, 6) RETURNING id INTO itinerary_id;

  -- Retail subcategories
  INSERT INTO public.ticket_categories (name, parent_id, sort_order) VALUES ('General', retail_id, 1) RETURNING id INTO retail_general_id;
  INSERT INTO public.ticket_categories (name, parent_id, sort_order) VALUES ('Watches', retail_id, 2) RETURNING id INTO retail_watches_id;
  INSERT INTO public.ticket_categories (name, parent_id, sort_order) VALUES ('Bags', retail_id, 3) RETURNING id INTO retail_bags_id;
  INSERT INTO public.ticket_categories (name, parent_id, sort_order) VALUES ('Gifting', retail_id, 4) RETURNING id INTO retail_gifting_id;

  -- ── SLA policies (business minutes; all category policies 15m first response) ──
  INSERT INTO public.sla_policies (name, category_id, priority, first_response_minutes, resolution_minutes, is_default, escalation_enabled) VALUES
    ('Travel',                  travel_id,         NULL, 15, 480,  false, true),
    ('Restaurant',              dining_id,         NULL, 15, 480,  false, true),
    ('Retail (General)',        retail_general_id, NULL, 15, 480,  false, true),
    ('Retail — Watches',        retail_watches_id, NULL, 15, 2880, false, true),
    ('Retail — Bags',           retail_bags_id,    NULL, 15, 2880, false, true),
    ('Gifting',                 retail_gifting_id, NULL, 15, 480,  false, true),
    ('Events',                  events_id,         NULL, 15, 480,  false, true),
    ('Special Request',         special_id,        NULL, 15, 480,  false, true);

  -- Default policy: one row per priority (graduated first response, 8h resolution)
  INSERT INTO public.sla_policies (name, category_id, priority, first_response_minutes, resolution_minutes, is_default, escalation_enabled) VALUES
    ('Default — Urgent', NULL, 'urgent', 60,  480, true, true),
    ('Default — High',   NULL, 'high',   240, 480, true, true),
    ('Default — Medium', NULL, 'medium', 480, 480, true, true),
    ('Default — Low',    NULL, 'low',    1440, 480, true, true);

  -- ── Checklist templates (Backend spec §Categories/Subcategories) ──────────────
  INSERT INTO public.ticket_checklist_templates (category_id, label, sort_order) VALUES
    -- Travel → Flight
    (flight_id, 'Departure', 1), (flight_id, 'Arrived', 2), (flight_id, 'MMT', 3),
    (flight_id, 'Recheck name', 4), (flight_id, 'Boarding pass', 5), (flight_id, 'FF number', 6),
    -- Travel → Hotel Booking
    (hotel_id, '5 star', 1), (hotel_id, 'Smoking / Non smoking', 2), (hotel_id, 'Twin / Non twin', 3),
    (hotel_id, 'Breakfast included', 4), (hotel_id, 'Frequent / membership', 5), (hotel_id, 'Check-in / Check-out time', 6),
    -- Travel → Car Transfer
    (car_id, 'Category', 1), (car_id, 'Check temper', 2), (car_id, 'Arrival Google location', 3),
    (car_id, 'English speaking', 4), (car_id, 'No phone policy', 5),
    -- Travel → Experiences
    (exp_id, 'Age limit', 1), (exp_id, 'Height limit', 2), (exp_id, 'Inclusions', 3),
    (exp_id, 'Private / Group', 4), (exp_id, 'English speaking', 5),
    -- Travel → Airport Protocols
    (airport_id, 'Inclusions', 1), (airport_id, 'Fast track', 2), (airport_id, 'Start / End point', 3),
    (airport_id, 'Porter details 3hrs prior', 4),
    -- Travel → Itinerary
    (itinerary_id, 'Stay', 1), (itinerary_id, 'Experience', 2), (itinerary_id, 'Restaurant', 3),
    (itinerary_id, 'If kids are travelling', 4), (itinerary_id, 'GPT (4 layer)', 5), (itinerary_id, 'IG (whats new)', 6),
    (itinerary_id, 'Distance from airport', 7), (itinerary_id, 'Visa details', 8), (itinerary_id, 'Weather', 9),
    (itinerary_id, 'Cultural norms', 10), (itinerary_id, 'Check availability', 11),
    -- Dining
    (dining_id, 'Check web', 1), (dining_id, 'Call', 2), (dining_id, 'General manager', 3),
    (dining_id, 'Hotel manager', 4), (dining_id, 'Hospitality group', 5), (dining_id, 'Owner', 6), (dining_id, 'Alternate', 7),
    -- Retail → Bags
    (retail_bags_id, 'Quotation format', 1), (retail_bags_id, 'MRP + premium', 2), (retail_bags_id, 'Year', 3),
    (retail_bags_id, 'Box', 4), (retail_bags_id, 'Bill (store)', 5), (retail_bags_id, 'Dustbag', 6),
    (retail_bags_id, 'Delivery time', 7), (retail_bags_id, 'Taxes', 8),
    -- Retail → Watches
    (retail_watches_id, 'Quotation format', 1), (retail_watches_id, 'MRP + premium', 2), (retail_watches_id, 'Model number [origin]', 3),
    (retail_watches_id, 'Year', 4), (retail_watches_id, 'Box', 5), (retail_watches_id, 'Warranty card', 6),
    (retail_watches_id, 'Bill (store)', 7), (retail_watches_id, 'Delivery time', 8), (retail_watches_id, 'Delivery location', 9),
    (retail_watches_id, 'Taxes', 10),
    -- Retail → General
    (retail_general_id, 'MRP', 1), (retail_general_id, 'MRP + facilitation (overseas)', 2), (retail_general_id, 'Delivery time', 3),
    (retail_general_id, 'POC', 4), (retail_general_id, 'Warranty', 5), (retail_general_id, 'Last mile check', 6),
    -- Retail → Gifting
    (retail_gifting_id, 'Timeline', 1), (retail_gifting_id, 'Date and location', 2), (retail_gifting_id, 'Remove tag', 3),
    (retail_gifting_id, 'Photo proof', 4), (retail_gifting_id, 'Wrap professionally', 5), (retail_gifting_id, 'Printed note', 6),
    (retail_gifting_id, 'Call receiver', 7),
    -- Events
    (events_id, 'Online (official)', 1), (events_id, 'Ticketing partner', 2), (events_id, 'Hospitality partner', 3),
    (events_id, 'Venue', 4), (events_id, 'Organiser', 5), (events_id, 'Sponsor', 6), (events_id, 'Secondary (Internal)', 7),
    (events_id, 'Ticket - digital / physical', 8), (events_id, 'Ticket delivery time', 9), (events_id, 'Name on ticket', 10),
    (events_id, 'Inclusions', 11), (events_id, 'Seat number', 12), (events_id, 'Proof', 13),
    -- Special Request
    (special_id, 'Industry', 1), (special_id, 'Stakeholder', 2), (special_id, 'Research', 3),
    (special_id, 'Timeline', 4), (special_id, 'Talk to the team', 5), (special_id, 'Escalate if medical', 6);
END $$;

-- ── Canned responses (Backend spec §Template of each canned response) ─────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.canned_responses LIMIT 1) THEN
    RETURN;
  END IF;

  INSERT INTO public.canned_responses (name, shortcut, category_id, body_template) VALUES
  ('Email', '/c', NULL, $body$Dear team,

Hope you are well. This is {{agent_name}} from Indulge Global. We are a private concierge catering to UHNIs globally.

A cherished patron of ours has been blown away by your craftsmanship/establishment. While the online quota for the same seems to be exhausted, we wanted to humbly make a request to accommodate the request of our beloved patron.

Details of the product-
Link of the product-
Delivery location-

OR

Time of reservation:
Pax:
Any other request.

To help you know the patron, I am attaching their details-
Name-
Wikipedia Link-
Forbes/Economic Times link (preferably mentioning their net worth)-

We are optimistic that you shall extend your warm hospitality for which you are well known. I am personally available on {{agent_phone}}. Looking forward to hearing from you.

(P.S- Here is a glimpse of us — Forbes, BS, The Hindu, Livemint and more)

Regards
{{agent_name}}
{{agent_designation}}
{{agent_phone}}
www.indulge.global$body$),

  ('Events', '/c', (SELECT id FROM public.ticket_categories WHERE lower(name) = 'events' AND parent_id IS NULL), $body$Location-
Type-
Organiser-
Venue-
Ticketing partner-

Lusha
Name-
Number/Email-
Last communication-$body$),

  ('Finance', '/c', NULL, $body$Client name- {{client_name}}
Description- Date- Subject- Location- Pax-
Cost Price-
Selling Price-
Service charge-
Name & Bill of vendor-
Payment done via- Razorpay/Card/UPI/Etc

Note-
Please mention if the bill has to be issued in any other name. For online payments made, invoice from vendor is mandatory.$body$),

  ('Internal Vendor', '/c', NULL, $body$Dear team,

Thank you for sharing the details.

Kindly close the request for [product name].$body$),

  ('Itinerary', '/c', (SELECT c.id FROM public.ticket_categories c JOIN public.ticket_categories p ON c.parent_id = p.id WHERE lower(c.name) = 'itinerary' AND lower(p.name) = 'travel'), $body$Stay
1. Boutique hotel
Name-
Room type-
Cost including taxes-
Photos-

2. Modern hotel
Name-
Room type-
Cost including taxes-
Photos-

Itinerary Format

Day 1
Breakfast — Link- / Menu-
Lunch — Link- / Menu-
Activity 1 — Link- / Inclusions-
Dinner — Link- / Menu-
Bar/Club — Link- / Menu-

Repeat the same for the number of days. Additionally, add cafes and explorations from the pdf to visit.$body$),

  ('Rejection Message', '/c', NULL, $body$Dear team,

Thank you for trying and assisting us promptly.

We are optimistic that they will experience the (name/product) the next time.

If you are ever in Goa, India, we would love to host you.

Regards
{{agent_name}}
{{agent_designation}}
{{agent_phone}}
www.indulge.global$body$),

  ('Resolution Message', '/c', NULL, $body$Dear team,

Our patrons had a great time at the establishment.

Thanking you and the entire team for your hospitality.

Wishing you all the best.

Keep in touch :)

Regards
{{agent_name}}
{{agent_designation}}
{{agent_phone}}
www.indulge.global$body$),

  ('Restaurant', '/c', (SELECT id FROM public.ticket_categories WHERE lower(name) = 'dining' AND parent_id IS NULL), $body$Location-
Manager-
Group Owner-
Owner-

Lusha-
Name-
Number/Email-

Proof of confirmation-$body$),

  ('Retail', '/c', (SELECT id FROM public.ticket_categories WHERE lower(name) = 'retail' AND parent_id IS NULL), $body$Product link-
Vendor name-
Response from Vendor-

Lusha-
Name-
Number/Email-

Instagram-

(Inform vendor in case not needed)$body$),

  ('Spa & Beauty', '/c', NULL, $body$Location-
Menu of services and inclusion-
Duration-
Age-
Written confirmation-$body$),

  ('Travel', '/c', (SELECT id FROM public.ticket_categories WHERE lower(name) = 'travel' AND parent_id IS NULL), $body$Hotels
1. Share as a pdf from Canva
2. Pick options from the web - 4 and 5 star
3. Share them as - an image + Hotel name + Google link (with room cost if dates are mentioned)

Restaurants
1. Share as a pdf from Canva
2. Pick options (fine dine - rating 4+ with more than 300 reviews)
3. Share them as - an image + restaurant name and cuisine + Google link (not the website)
4. If client asks for something specific - share the menu

Activities
1. Share as a pdf from Canva
2. Check the web (keywords - offbeat, VIP, new)
3. Check Instagram (keyword - things to do in "city name")
4. Share them as - an image + place name and activity + Google link$body$),

  ('WhatsApp Initiate Message', '/c', NULL, $body$Hey {{client_name}},

Hope you are well. This is {{agent_name}} from Indulge Global.

We have been trying to reach out to your team regarding (thing/event) but have not heard back. Could you please connect us to the concerned person/authority to take it further.

Looking forward to hearing from you.

(P.S- This is us — www.indulge.global)$body$);
END $$;
