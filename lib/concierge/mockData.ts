export type MemberTier = "Founding" | "Diamond" | "Platinum" | "Gold";

export interface ConciergeClient {
  id: string;
  name: string;
  initials: string;
  tier: MemberTier;
  memberSince: string;
  avatarColor: string;
  lastActivity: string;
  isActive?: boolean;
}

export interface ClientProfile {
  id: string;
  name: string;
  age: number;
  dob: string;
  tier: MemberTier;
  memberSince: string;
  tagline: string;
  phone: string;
  email: string;
  nationality: string;
  city: string;
  indexedInteractions: number;
  indexedItineraries: number;
  communicationStyle: {
    channel: string;
    format: string;
    tone: string;
    escalation: string;
  };
  preferences: {
    dining: string[];
    wellness: string[];
    travel: string[];
    allergies: string[];
  };
  pastHighlights: Array<{
    year: string;
    event: string;
    rating?: string;
    note?: string;
  }>;
  sentimentFlags: Array<{
    severity: "critical" | "warning" | "info";
    label: string;
    detail: string;
  }>;
  conciergeNotes: string;
}

export const mockClients: ConciergeClient[] = [
  {
    id: "advita",
    name: "Advita Bihani",
    initials: "AB",
    tier: "Founding",
    memberSince: "2024",
    avatarColor: "#1A1814",
    lastActivity: "2h ago",
    isActive: true,
  },
  {
    id: "rohan",
    name: "Rohan Mehra",
    initials: "RM",
    tier: "Diamond",
    memberSince: "2023",
    avatarColor: "#1C2333",
    lastActivity: "Yesterday",
  },
  {
    id: "priya",
    name: "Priya Oberoi",
    initials: "PO",
    tier: "Diamond",
    memberSince: "2023",
    avatarColor: "#1A2420",
    lastActivity: "3d ago",
  },
  {
    id: "arjun",
    name: "Arjun Kapoor",
    initials: "AK",
    tier: "Platinum",
    memberSince: "2024",
    avatarColor: "#1E1A2E",
    lastActivity: "1w ago",
  },
  {
    id: "nina",
    name: "Nina Walia",
    initials: "NW",
    tier: "Gold",
    memberSince: "2024",
    avatarColor: "#201A18",
    lastActivity: "2w ago",
  },
];

export const advitaProfile: ClientProfile = {
  id: "advita",
  name: "Advita Bihani",
  age: 25,
  dob: "April 2000",
  tier: "Founding",
  memberSince: "January 2024",
  tagline: "Founder. Gen Z UHNW. Minimalist by design.",
  phone: "+91 98100 XXXXX",
  email: "private — concierge relay only",
  nationality: "Indian",
  city: "Mumbai, Maharashtra",
  indexedInteractions: 412,
  indexedItineraries: 14,
  communicationStyle: {
    channel: "WhatsApp only",
    format: "Bullet points. Never paragraphs.",
    tone: "Zero small talk. Direct and action-oriented.",
    escalation: "Do NOT call unless Level 1 emergency.",
  },
  preferences: {
    dining: [
      "Michelin-starred Omakase",
      "Refined vegan options",
      "Private chef experiences",
      "No group restaurant bookings",
    ],
    wellness: [
      "Boutique wellness retreats",
      "Aman properties preferred",
      "Private yoga & breathwork",
      "Cold-water therapy / ice baths",
    ],
    travel: [
      "Solo for wellness",
      "2 close female companions for events",
      "Private villa over hotel when possible",
      "Maximum 8-hour flights (direct only)",
    ],
    allergies: ["Pine nuts — CRITICAL ALLERGY. All vendors must be briefed."],
  },
  pastHighlights: [
    {
      year: "2025",
      event: "Aman Tokyo — Solo Wellness Retreat",
      rating: "10/10",
      note: "Requested same suite on return visit",
    },
    {
      year: "2024",
      event: "Private Villa — Lake Como, Italy",
      rating: "9/10",
      note: "Accompanied by 2 friends. Requested private chef",
    },
    {
      year: "2024",
      event: "Paris Fashion Week — George V Penthouse",
      rating: "Mixed",
      note: "Suite: 10/10. Driver vendor removed — arrived 5 min late",
    },
    {
      year: "2024",
      event: "Milan Itinerary — Fashion & Dining",
      rating: "9/10",
      note: "Omakase at Sushi B rated as highlight of the trip",
    },
  ],
  sentimentFlags: [
    {
      severity: "critical",
      label: "Pine nut allergy",
      detail: "All catering vendors must be pre-briefed without exception.",
    },
    {
      severity: "warning",
      label: "Punctuality SLA",
      detail: "Flagged Paris driver for 5-minute delay. Vendor blacklisted.",
    },
    {
      severity: "info",
      label: "Prefers solo wellness",
      detail: "Do not suggest group wellness packages.",
    },
  ],
  conciergeNotes:
    "Advita is a founding member with exceptional taste and zero tolerance for mediocrity. She expects all briefs to arrive 24h before any engagement. Always confirm dietary requirements in writing with every venue.",
};

export type EliaMessage = {
  id: string;
  role: "user" | "elia";
  content: string;
  timestamp: Date;
};

export type MockQA = {
  keywords: string[];
  response: string;
};

export const eliaQABank: MockQA[] = [
  {
    keywords: ["food", "eat", "dining", "restaurant", "cuisine", "like", "prefer"],
    response:
      "Based on her WhatsApp history and last year's Milan itinerary, Advita prefers high-end Japanese (specifically Michelin-star Omakase) and refined vegan options.\n\n**CRITICAL:** She is highly allergic to pine nuts. Ensure all vendors are briefed before any engagement.",
  },
  {
    keywords: ["birthday", "celebration", "turning", "born", "bday", "special"],
    response:
      "Advita is turning 26. Since she prefers wellness and exclusivity, I recommend a private yacht charter along the Amalfi Coast, accompanied by a curated wellness chef.\n\nShall I generate a preliminary itinerary and check availability for our top-tier vessels?",
  },
  {
    keywords: ["companion", "travel", "friend", "with", "who", "usual"],
    response:
      "She typically travels solo for wellness retreats (e.g., her Aman Tokyo trip), but for celebratory events, she is usually accompanied by 2 close female friends.\n\nI have their dietary restrictions on file as well.",
  },
  {
    keywords: ["communication", "contact", "reach", "message", "style", "preferred", "talk", "call"],
    response:
      "Strictly WhatsApp. She prefers zero small talk and requires updates to be in short, scannable bullet points.\n\nNever call unless it is a Level 1 emergency.",
  },
  {
    keywords: ["paris", "feedback", "review", "last", "trip", "driver", "george"],
    response:
      "She highly rated the George V penthouse suite (10/10), but left a negative vendor note because the private driver was 5 minutes late to the airport transfer.\n\nI have permanently removed that transport vendor from her approved list.",
  },
];
