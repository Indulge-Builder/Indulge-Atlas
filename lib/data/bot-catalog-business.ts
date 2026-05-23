/**
 * Indulge Gupshup bot catalog — sourced from business PDF (May 2026).
 * Each row is one recommendable product or experience tier the bot can surface in lists.
 */

import type { BotCatalogCategory } from "@/lib/types/database";

export interface BotCatalogSeedItem {
  category: BotCatalogCategory;
  name: string;
  description: string;
  price_range: string;
  tags: string[];
}

const UPON_REQUEST = "Upon request";

export const BOT_CATALOG_BUSINESS: BotCatalogSeedItem[] = [
  // ── Art & cultural fairs ───────────────────────────────────────────────────
  {
    category: "art",
    name: "Art Basel 2026 — VIP Preview",
    description:
      "Privileged early entry to the world's most prestigious contemporary art fair in Switzerland. Private gallery viewings, expert acquisition support, and exclusive collector lounges.",
    price_range: UPON_REQUEST,
    tags: ["art-basel", "switzerland", "art-fair", "vip", "collectors", "contemporary-art"],
  },
  {
    category: "art",
    name: "Art Basel 2026 — Prestige Fair",
    description:
      "Seamless Art Basel access with curated walkthroughs, priority entry to top galleries, and luxury hospitality for a refined art immersion in Switzerland.",
    price_range: UPON_REQUEST,
    tags: ["art-basel", "switzerland", "art-fair", "curated", "galleries"],
  },
  {
    category: "art",
    name: "Venice Biennale — Opening VIP",
    description:
      "Opening week at the Venice Biennale: early access, curator-led tours, and invitations to exclusive soirées across Italy's historic art capital.",
    price_range: UPON_REQUEST,
    tags: ["venice-biennale", "italy", "opening-week", "vip", "curator-led"],
  },
  {
    category: "art",
    name: "Venice Biennale — Curated Tour",
    description:
      "Personalized Biennale journey with guided tours, priority venue access, and insider entry to exclusive exhibitions in Venice.",
    price_range: UPON_REQUEST,
    tags: ["venice-biennale", "italy", "guided-tour", "curated", "architecture"],
  },
  {
    category: "art",
    name: "FIFA World Cup 2026 Trophy Replica",
    description:
      "Officially licensed limited-edition 24K gold-plated FIFA World Cup trophy replica — exclusive memorabilia for discerning collectors.",
    price_range: UPON_REQUEST,
    tags: ["collectible", "fifa", "football", "limited-edition", "memorabilia"],
  },

  // ── Events & festivals ─────────────────────────────────────────────────────
  {
    category: "events",
    name: "Paris Fashion Week — Show Access",
    description:
      "Invite-only Paris Fashion Week runway access with backstage exposure, designer previews, and elite after-parties at global fashion's pinnacle event.",
    price_range: UPON_REQUEST,
    tags: ["paris-fashion-week", "france", "runway", "invite-only", "fashion"],
  },
  {
    category: "events",
    name: "Paris Fashion Week — Insider",
    description:
      "Fashion Week insider package: private styling sessions, personal shopping, premium showroom access, and curated Paris nightlife.",
    price_range: UPON_REQUEST,
    tags: ["paris-fashion-week", "france", "styling", "personal-shopping", "fashion"],
  },
  {
    category: "events",
    name: "KASHISH Festival — VIP Access",
    description:
      "VIP access to Mumbai's leading LGBTQ+ film festival: opening night glamour, red carpet, priority screenings, and curated networking.",
    price_range: UPON_REQUEST,
    tags: ["kashish", "mumbai", "film-festival", "vip", "cinema", "india"],
  },
  {
    category: "events",
    name: "KASHISH Festival — Curated Cinema",
    description:
      "Concierge-led KASHISH journey with private screenings, exclusive panels, and a tailored festival experience in Mumbai.",
    price_range: UPON_REQUEST,
    tags: ["kashish", "mumbai", "film-festival", "curated", "cinema"],
  },
  {
    category: "events",
    name: "International Yoga — VIP Access",
    description:
      "Exclusive yoga ceremonies across India with priority sessions with renowned gurus and intimate wellness gatherings.",
    price_range: UPON_REQUEST,
    tags: ["yoga", "wellness", "india", "vip", "spiritual"],
  },
  {
    category: "events",
    name: "International Yoga — Wellness Retreat",
    description:
      "Luxury yoga retreats with personalized programs, detox therapies, and guided spiritual journeys across India's premier wellness destinations.",
    price_range: UPON_REQUEST,
    tags: ["yoga", "wellness", "retreat", "india", "detox"],
  },
  {
    category: "events",
    name: "Primavera Sound — VIP",
    description:
      "VIP Primavera Sound Barcelona: premium viewing, exclusive lounges, after-parties, and seamless logistics at this world-renowned music festival.",
    price_range: UPON_REQUEST,
    tags: ["primavera-sound", "barcelona", "spain", "concert", "vip", "music-festival"],
  },
  {
    category: "events",
    name: "Primavera Sound — Curated Journey",
    description:
      "Curated Primavera Sound experience in Barcelona with priority access, bespoke scheduling, and white-glove festival logistics.",
    price_range: UPON_REQUEST,
    tags: ["primavera-sound", "barcelona", "spain", "concert", "curated"],
  },
  {
    category: "events",
    name: "Sónar Festival — Full VIP",
    description:
      "Full VIP Sónar Barcelona across all zones — electronic music, innovation, and digital culture with exclusive night events.",
    price_range: UPON_REQUEST,
    tags: ["sonar", "barcelona", "spain", "electronic", "vip", "music-festival"],
  },
  {
    category: "events",
    name: "Sónar Festival — Elevated Access",
    description:
      "Elevated Sónar experience with priority entry, curated access, and seamless hospitality at Barcelona's iconic electronic festival.",
    price_range: UPON_REQUEST,
    tags: ["sonar", "barcelona", "spain", "electronic", "curated"],
  },
  {
    category: "events",
    name: "BST Hyde Park — Premium",
    description:
      "Premium BST Hyde Park London: exclusive enclosures, fine dining, and world-class open-air performances in a luxury concert setting.",
    price_range: UPON_REQUEST,
    tags: ["bst-hyde-park", "london", "uk", "concert", "premium", "open-air"],
  },
  {
    category: "events",
    name: "BST Hyde Park — Priority Access",
    description:
      "Priority BST Hyde Park access with elevated viewing, hospitality suites, and seamless matchday-style concert logistics in London.",
    price_range: UPON_REQUEST,
    tags: ["bst-hyde-park", "london", "uk", "concert", "priority"],
  },
  {
    category: "events",
    name: "Shimla Summer Festival — Premium",
    description:
      "Shimla Summer Festival with reserved seating, priority access, and curated Himachali cultural experiences in the scenic hills.",
    price_range: UPON_REQUEST,
    tags: ["shimla", "india", "cultural-festival", "hills", "premium"],
  },
  {
    category: "events",
    name: "Shimla Summer Festival — Luxury Escape",
    description:
      "Luxury Shimla package: premium stay, private transfers, spa options, and curated festival access in the Himalayas.",
    price_range: UPON_REQUEST,
    tags: ["shimla", "india", "luxury-stay", "spa", "cultural-festival"],
  },
  {
    category: "events",
    name: "Hemis Festival — Monastery Access",
    description:
      "Rare Hemis Festival Ladakh with exclusive monastery access, expert-led insights into masked dances, and ancient Buddhist rituals.",
    price_range: UPON_REQUEST,
    tags: ["hemis", "ladakh", "india", "buddhist", "monastery", "cultural"],
  },
  {
    category: "events",
    name: "Hemis Festival — Luxury Ladakh",
    description:
      "Luxury Ladakh journey for Hemis Festival: curated boutique stays, private transfers, and immersive Himalayan cultural experiences.",
    price_range: UPON_REQUEST,
    tags: ["hemis", "ladakh", "india", "luxury-travel", "buddhist"],
  },

  // ── Sporting experiences ───────────────────────────────────────────────────
  {
    category: "sports",
    name: "Wimbledon — Centre Court VIP",
    description:
      "Centre Court VIP at Wimbledon: the world's most prestigious tennis tournament with fine dining, exclusive lounges, and prime seating in London.",
    price_range: UPON_REQUEST,
    tags: ["wimbledon", "tennis", "london", "uk", "vip", "centre-court"],
  },
  {
    category: "sports",
    name: "Wimbledon — Premium Matchday",
    description:
      "Premium Wimbledon matchday with seamless hospitality, elevated viewing, and curated access to tennis's most iconic championship.",
    price_range: UPON_REQUEST,
    tags: ["wimbledon", "tennis", "london", "uk", "hospitality"],
  },
  {
    category: "sports",
    name: "Le Mans 24h — Trackside Suite",
    description:
      "Trackside hospitality at the 24 Hours of Le Mans with pit lane access, gourmet dining, and prime endurance motorsport viewing in France.",
    price_range: UPON_REQUEST,
    tags: ["le-mans", "motorsport", "france", "pit-lane", "vip", "racing"],
  },
  {
    category: "sports",
    name: "Le Mans 24h — Race Day Curated",
    description:
      "Curated Le Mans race-day experience with prime viewing points, expert hosts, and luxury logistics at endurance racing's ultimate event.",
    price_range: UPON_REQUEST,
    tags: ["le-mans", "motorsport", "france", "curated", "racing"],
  },
  {
    category: "sports",
    name: "Royal Ascot — Royal Enclosure",
    description:
      "Royal Enclosure access at Royal Ascot: champagne hospitality, legendary horse racing, and Britain's most prestigious social sporting occasion.",
    price_range: UPON_REQUEST,
    tags: ["royal-ascot", "horse-racing", "uk", "royal-enclosure", "champagne"],
  },
  {
    category: "sports",
    name: "Royal Ascot — Ladies' Day Premium",
    description:
      "Premium Royal Ascot social experience for Ladies' Day and Gold Cup with curated hospitality and fashion-forward race day elegance.",
    price_range: UPON_REQUEST,
    tags: ["royal-ascot", "horse-racing", "uk", "ladies-day", "gold-cup"],
  },
  {
    category: "sports",
    name: "India vs Pakistan W T20 — VIP Box",
    description:
      "VIP box for India vs Pakistan Women's T20 World Cup — cricket's greatest rivalry with all-inclusive hospitality and prime stadium views.",
    price_range: UPON_REQUEST,
    tags: ["cricket", "t20", "world-cup", "india", "pakistan", "vip-box"],
  },
  {
    category: "sports",
    name: "India vs Pakistan W T20 — 5-Star Package",
    description:
      "5-star cricket package: luxury stay, curated matchday, fine dining, and seamless logistics for the Women's T20 World Cup rivalry fixture.",
    price_range: UPON_REQUEST,
    tags: ["cricket", "t20", "world-cup", "luxury-stay", "matchday"],
  },
  {
    category: "sports",
    name: "Prestige Masters Series — Golf",
    description:
      "Invite-only Prestige Masters Series golf in Bangalore for HNIs: clubhouse access, networking, and elite fairway experiences.",
    price_range: UPON_REQUEST,
    tags: ["golf", "bangalore", "india", "networking", "hni", "invite-only"],
  },
  {
    category: "sports",
    name: "Prestige Masters Series — Lifestyle Day",
    description:
      "Premium lifestyle day at Prestige Masters Series Bangalore with curated hospitality, events, and corporate leader networking.",
    price_range: UPON_REQUEST,
    tags: ["golf", "bangalore", "india", "lifestyle", "corporate"],
  },

  // ── Travel ─────────────────────────────────────────────────────────────────
  {
    category: "travel",
    name: "Bora Bora Private Villas",
    description:
      "Overwater villas with lagoon access, panoramic ocean views, personal butler service, bespoke in-villa dining, and absolute privacy in Bora Bora.",
    price_range: UPON_REQUEST,
    tags: ["bora-bora", "french-polynesia", "overwater-villa", "beach", "honeymoon"],
  },
  {
    category: "travel",
    name: "Swiss Alps Private Retreat",
    description:
      "Exclusive private chalets in the Swiss Alps with dedicated chefs, concierge, tailored outdoor adventures, skiing, and year-round wellness.",
    price_range: UPON_REQUEST,
    tags: ["swiss-alps", "switzerland", "chalet", "ski", "wellness", "winter"],
  },
  {
    category: "travel",
    name: "South Africa Private Safari",
    description:
      "Private Big Five safari with expert guides, luxury lodges blending wilderness authenticity with five-star comfort, and curated itineraries.",
    price_range: UPON_REQUEST,
    tags: ["south-africa", "safari", "big-five", "wildlife", "luxury-lodge"],
  },
  {
    category: "travel",
    name: "Everest Breakfast Experience",
    description:
      "Scenic helicopter flight over the Himalayas with an exclusive breakfast at a premium Everest-view location — a once-in-a-lifetime adventure.",
    price_range: UPON_REQUEST,
    tags: ["everest", "nepal", "helicopter", "himalayas", "adventure", "breakfast"],
  },
  {
    category: "travel",
    name: "Kerala Backwaters Houseboat",
    description:
      "Luxury houseboat through Kerala's tranquil backwaters with curated cultural routes, authentic cuisine, and personalized peaceful service.",
    price_range: UPON_REQUEST,
    tags: ["kerala", "india", "backwaters", "houseboat", "wellness", "culture"],
  },

  // ── Watches ────────────────────────────────────────────────────────────────
  {
    category: "watches",
    name: "Rolex Lady-Datejust",
    description:
      "Iconic Rolex Lady-Datejust with refined feminine silhouette, Oystersteel and gold construction, signature fluted bezel, and timeless everyday luxury.",
    price_range: UPON_REQUEST,
    tags: ["rolex", "lady-datejust", "oystersteel", "gold", "everyday-luxury"],
  },
  {
    category: "watches",
    name: "Rolex Daytona Tiffany Blue",
    description:
      "Legendary Cosmograph Daytona with rare Tiffany Blue dial, 18k gold case, Oysterflex bracelet — a highly collectible investment-grade chronograph.",
    price_range: UPON_REQUEST,
    tags: ["rolex", "daytona", "tiffany-blue", "chronograph", "collectible", "18k-gold"],
  },
  {
    category: "watches",
    name: "AP Royal Oak Chronograph",
    description:
      "Audemars Piguet Royal Oak Chronograph with bold ceramic case, Méga Tapisserie dial, and integrated bracelet — iconic haute horology performance.",
    price_range: UPON_REQUEST,
    tags: ["audemars-piguet", "royal-oak", "chronograph", "ceramic", "haute-horology"],
  },
  {
    category: "watches",
    name: "AP Royal Oak Flying Tourbillon",
    description:
      "Audemars Piguet Royal Oak Flying Tourbillon with openworked dial, intricate movement, and avant-garde design for elite collectors.",
    price_range: UPON_REQUEST,
    tags: ["audemars-piguet", "royal-oak", "tourbillon", "openworked", "collector"],
  },

  // ── Fashion: sneakers, fragrance, accessories, tech ────────────────────────
  {
    category: "fashion",
    name: "LV x Nike AF1 (Virgil Abloh)",
    description:
      "Louis Vuitton x Nike Air Force 1 by Virgil Abloh — premium calfskin, LV monogram detailing, limited edition from Abloh's final collection.",
    price_range: UPON_REQUEST,
    tags: ["louis-vuitton", "nike", "sneakers", "virgil-abloh", "limited-edition", "collectible"],
  },
  {
    category: "fashion",
    name: "Nike MAG Back to the Future",
    description:
      "Nike MAG self-lacing sneaker with illuminated sole — ultra-rare Back to the Future heritage collector's piece with global demand.",
    price_range: UPON_REQUEST,
    tags: ["nike", "mag", "sneakers", "self-lacing", "collectible", "rare"],
  },
  {
    category: "fashion",
    name: "Nike x Tiffany Air Force 1",
    description:
      "Nike x Tiffany Air Force 1 — premium black leather with signature Tiffany blue accents. Extremely limited Friends & Family exclusivity.",
    price_range: UPON_REQUEST,
    tags: ["nike", "tiffany", "sneakers", "limited", "collectible"],
  },
  {
    category: "fashion",
    name: "Dior Sauvage Elixir",
    description:
      "Dior Sauvage Elixir — intensely concentrated aromatic fragrance with spices, lavender, and woody notes. Bold, long-lasting signature scent.",
    price_range: UPON_REQUEST,
    tags: ["dior", "fragrance", "sauvage", "elixir", "woody", "men"],
  },
  {
    category: "fashion",
    name: "Zielinski & Rozen Perfumery",
    description:
      "Artisan niche perfumery with raw, apothecary-style compositions — unique blends with deep character from Zielinski & Rozen.",
    price_range: UPON_REQUEST,
    tags: ["zielinski-rozen", "fragrance", "niche", "artisan", "unisex"],
  },
  {
    category: "fashion",
    name: "Roja Parfums Elysium",
    description:
      "Roja Elysium — fresh citrus-woody luxury fragrance with refined aromatic depth and elegant everyday sophistication.",
    price_range: UPON_REQUEST,
    tags: ["roja", "fragrance", "elysium", "citrus", "woody"],
  },
  {
    category: "fashion",
    name: "Creed Aventus",
    description:
      "Creed Aventus — iconic niche fragrance with bold pineapple and smoky notes. One of the world's most sought-after luxury scents.",
    price_range: UPON_REQUEST,
    tags: ["creed", "fragrance", "aventus", "niche", "iconic"],
  },
  {
    category: "fashion",
    name: "Tom Ford Oud Wood Intense",
    description:
      "Tom Ford Private Blend Oud Wood Intense — deep smoky oud with rich woody undertones. Luxurious, sensual signature fragrance.",
    price_range: UPON_REQUEST,
    tags: ["tom-ford", "fragrance", "oud", "private-blend", "intense"],
  },
  {
    category: "fashion",
    name: "Hermès Picotin Lock",
    description:
      "Hermès Picotin Lock 18/25 — minimalist bucket bag in soft Clemence leather with signature lock detail and effortless everyday elegance.",
    price_range: UPON_REQUEST,
    tags: ["hermes", "handbag", "picotin", "leather", "luxury-accessories"],
  },
  {
    category: "fashion",
    name: "Hermès Mini Kelly 2",
    description:
      "Hermès Mini Kelly 2 — iconic structured silhouette in premium leather. Highly coveted, investment-worthy heritage craftsmanship.",
    price_range: UPON_REQUEST,
    tags: ["hermes", "handbag", "mini-kelly", "collectible", "investment"],
  },
  {
    category: "fashion",
    name: "Chanel Classic 11.12",
    description:
      "Chanel Classic 11.12 with quilted tweed, gold-tone hardware — the timeless Parisian luxury handbag statement.",
    price_range: UPON_REQUEST,
    tags: ["chanel", "handbag", "11.12", "quilted", "paris"],
  },
  {
    category: "fashion",
    name: "Goyard Saint Louis Tote",
    description:
      "Goyard Saint Louis Tote in signature Goyardine canvas — lightweight, spacious, travel-friendly heritage luxury.",
    price_range: UPON_REQUEST,
    tags: ["goyard", "tote", "travel", "canvas", "heritage"],
  },
  {
    category: "fashion",
    name: "Goyard Personalized Wallet",
    description:
      "Customizable Goyard monogram wallet in durable coated canvas — discreet, exclusive everyday luxury accessory.",
    price_range: UPON_REQUEST,
    tags: ["goyard", "wallet", "personalized", "monogram", "leather-goods"],
  },
  {
    category: "fashion",
    name: "Tiffany Heart Tag Bracelet",
    description:
      "Tiffany Heart Tag bracelet in sterling silver or gold with signature engraving — elegant everyday luxury jewelry.",
    price_range: UPON_REQUEST,
    tags: ["tiffany", "jewelry", "bracelet", "silver", "gold"],
  },
  {
    category: "fashion",
    name: "Bvlgari Serpenti Necklace",
    description:
      "Bvlgari Serpenti necklace — bold serpentine design in 18k gold with optional diamonds. Iconic high-fashion statement piece.",
    price_range: UPON_REQUEST,
    tags: ["bvlgari", "jewelry", "serpenti", "necklace", "18k-gold", "diamonds"],
  },
  {
    category: "fashion",
    name: "Plaud Note Pro AI",
    description:
      "Plaud Note Pro — ultra-slim AI note-taker with real-time transcription and summarization for meetings, calls, and productivity.",
    price_range: UPON_REQUEST,
    tags: ["plaud", "tech", "ai", "productivity", "recording"],
  },
  {
    category: "fashion",
    name: "Canon PowerShot G7 X III",
    description:
      "Canon PowerShot G7 X Mark III — compact vlogging camera with flip screen, exceptional video and image quality for creators and travel.",
    price_range: UPON_REQUEST,
    tags: ["canon", "camera", "vlogging", "travel", "creators"],
  },
  {
    category: "fashion",
    name: "Fujifilm X100V",
    description:
      "Fujifilm X100V — retro premium compact with hybrid viewfinder and exceptional image quality, beloved among photographers and creatives.",
    price_range: UPON_REQUEST,
    tags: ["fujifilm", "camera", "compact", "photography", "retro"],
  },
  {
    category: "fashion",
    name: "Ray-Ban Meta Smart Glasses",
    description:
      "Ray-Ban Meta Smart Glasses — classic eyewear with built-in camera, audio, and voice assistant. Seamless fusion of fashion and innovation.",
    price_range: UPON_REQUEST,
    tags: ["ray-ban", "meta", "smart-glasses", "wearables", "tech"],
  },
  {
    category: "fashion",
    name: "WHOOP Fitness Tracker",
    description:
      "WHOOP 4.0 — screen-free advanced biometric tracking for recovery, strain, and sleep with subscription-based performance optimization.",
    price_range: UPON_REQUEST,
    tags: ["whoop", "fitness", "wearables", "recovery", "sleep"],
  },
  {
    category: "fashion",
    name: "Dyson HushJet Mini Fan",
    description:
      "Dyson HushJet Mini — compact handheld cooling with powerful, quiet airflow. Ideal for travel and personal luxury comfort.",
    price_range: UPON_REQUEST,
    tags: ["dyson", "fan", "travel", "tech", "lifestyle"],
  },
  {
    category: "fashion",
    name: "Eight Sleep Cooling System",
    description:
      "Eight Sleep Pod — AI-powered mattress cooling and sleep tracking with real-time temperature adjustment for optimized recovery.",
    price_range: UPON_REQUEST,
    tags: ["eight-sleep", "sleep", "wellness", "smart-home", "recovery"],
  },
];
