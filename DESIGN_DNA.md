# ATLAS DESIGN DNA okie

## Generated: 2026-05-19

> Read-only audit of **Indulge Atlas** (`app/`, `components/`, `lib/`). Frequency counts exclude the duplicate `onbording-code/` tree unless noted. No recommendations or refactors — documentation of intended tokens vs. actual usage.

---

## 1. Colour System

### 1.1 Intended tokens (from globals.css)

#### `@theme inline` (Tailwind v4 — generates `bg-*`, `text-*`, `border-*`, `ring-*`, `shadow-*` utilities)

| Variable                   | Raw value                                                          | Role                                                         | Dark counterpart |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------- |
| `--color-brand-black`      | `#0a0a0a`                                                          | Deepest brand black                                          | None             |
| `--color-brand-gold`       | `#5f5348`                                                          | Primary accent (warm umber; legacy name “gold”)              | None             |
| `--color-brand-gold-light` | `#7a6b5d`                                                          | Lighter umber accent                                         | None             |
| `--color-brand-gold-dark`  | `#463d35`                                                          | Darker umber accent                                          | None             |
| `--color-surface`          | `#f9f9f6`                                                          | Main working / paper background                              | None             |
| `--color-surface-subtle`   | `#f2f2ee`                                                          | Subtle fill, muted controls                                  | None             |
| `--color-surface-border`   | `#e5e4df`                                                          | Default border on light surfaces                             | None             |
| `--color-taupe`            | `#b5a99a`                                                          | Earth tone — placeholders, labels                            | None             |
| `--color-taupe-light`      | `#d0c8be`                                                          | Scrollbar thumb, lighter taupe                               | None             |
| `--color-muted-olive`      | `#8a8a6e`                                                          | Olive accent (InfoRow default icon)                          | None             |
| `--color-success`          | `#4a7c59`                                                          | Semantic success                                             | None             |
| `--color-success-light`    | `#ebf4ef`                                                          | Success surface                                              | None             |
| `--color-warning`          | `#c5830a`                                                          | Semantic warning                                             | None             |
| `--color-warning-light`    | `#fef3d0`                                                          | Warning surface                                              | None             |
| `--color-danger`           | `#c0392b`                                                          | Semantic danger                                              | None             |
| `--color-danger-light`     | `#faeae8`                                                          | Danger surface                                               | None             |
| `--color-info`             | `#2c6fac`                                                          | Semantic info                                                | None             |
| `--color-info-light`       | `#e8f0fa`                                                          | Info surface                                                 | None             |
| `--color-sidebar-bg`       | `#0a0a0a`                                                          | Sidebar token (sidebar is transparent on canvas in practice) | None             |
| `--color-sidebar-hover`    | `#1a1a1a`                                                          | Sidebar hover token                                          | None             |
| `--color-sidebar-active`   | `#1e1a0a`                                                          | Sidebar active token                                         | None             |
| `--color-sidebar-border`   | `#2a2a2a`                                                          | Sidebar border token                                         | None             |
| `--font-serif`             | `var(--font-playfair), "Playfair Display", Georgia, serif`         | Display / headings                                           | None             |
| `--font-sans`              | `var(--font-geist-sans), "Geist Sans", system-ui, sans-serif`      | Body                                                         | None             |
| `--font-mono`              | `var(--font-geist-mono), "Geist Mono", monospace`                  | Mono (Elia stats, timestamps)                                | None             |
| `--radius-sm`              | `0.25rem`                                                          | Radius scale                                                 | None             |
| `--radius-md`              | `0.5rem`                                                           | Radius scale                                                 | None             |
| `--radius-lg`              | `0.75rem`                                                          | Radius scale                                                 | None             |
| `--radius-xl`              | `1rem`                                                             | Radius scale                                                 | None             |
| `--shadow-card`            | `0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)`  | Card shadow token                                            | None             |
| `--shadow-elevated`        | `0 4px 16px 0 rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)` | Elevated shadow token                                        | None             |
| `--shadow-gold`            | `0 0 0 1px rgb(95 83 72 / 0.22), 0 4px 16px rgb(95 83 72 / 0.08)`  | Umber ring + glow                                            | None             |

**Tailwind utilities derived from `@theme` colour tokens (representative):**

- `bg-brand-gold`, `bg-brand-gold-light`, `bg-brand-gold-dark`, `bg-brand-black`
- `text-brand-gold`, `text-brand-gold-light`, `text-brand-gold-dark`
- `border-brand-gold`, `border-brand-gold-light`, `border-brand-gold/35`, `border-brand-gold/40` (opacity modifiers used in Elia)
- `bg-surface`, `text-surface`, `bg-surface-subtle`, `border-surface-border`
- `bg-success`, `text-success`, `bg-warning`, `text-warning`, `bg-danger`, `text-danger`, `bg-info`, `text-info`
- `ring-brand-gold` (via `--ring` alias in `:root`)

Shadow tokens map to `shadow-card`, `shadow-elevated`, `shadow-gold` if referenced; most components use arbitrary `shadow-[...]` instead.

#### `:root` semantic aliases

| Variable             | Value                         | Role                         | Dark counterpart |
| -------------------- | ----------------------------- | ---------------------------- | ---------------- |
| `--surface-1`        | `#161411`                     | Task System v2 / dark modals | None             |
| `--surface-2`        | `#1e1c18`                     | Dark modal layer 2           | None             |
| `--canvas`           | `#0d0c0a`                     | Canvas base (matches layout) | None             |
| `--background`       | `var(--color-surface)`        | Shadcn background            | None             |
| `--foreground`       | `#1a1a1a`                     | Shadcn foreground            | None             |
| `--card`             | `#ffffff`                     | Card fill                    | None             |
| `--card-foreground`  | `#1a1a1a`                     | Card text                    | None             |
| `--muted`            | `var(--color-surface-subtle)` | Muted surface                | None             |
| `--muted-foreground` | `#6b6b6b`                     | Muted text                   | None             |
| `--border`           | `var(--color-surface-border)` | Default border               | None             |
| `--input`            | `var(--color-surface-subtle)` | Input background alias       | None             |
| `--ring`             | `var(--color-brand-gold)`     | Focus ring colour            | None             |

**Note:** No `.dark` class or dark-mode variable overrides exist in `globals.css`. `html` sets `color-scheme: dark` while the dashboard paper area is light cream — a deliberate split between shell and content.

#### Base layer (`@layer base`)

| Selector | Property           | Value                    |
| -------- | ------------------ | ------------------------ |
| `html`   | `background-color` | `#0d0c0a`                |
| `html`   | `color-scheme`     | `dark`                   |
| `body`   | `background-color` | `#0d0c0a`                |
| `body`   | `color`            | `rgb(255 255 255 / 0.9)` |
| `body`   | `font-family`      | `var(--font-sans)`       |

#### Custom classes (non-token literals embedded)

| Class                               | Key colours / effects                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `.layout-canvas`                    | Base `#0d0c0a`; SVG noise opacity `0.055`; radial washes `rgba(130,95,52,0.16)`, `rgba(72,78,56,0.13)`, `rgba(95,83,72,0.06)` |
| `.paper-shadow`                     | Inset highlight `rgba(255,255,255,0.055)`; outline `rgba(0,0,0,0.18)`; shadows `rgba(0,0,0,0.55)` / `0.3`                     |
| `.atlas-masthead-texture`           | Base `#f9f9f6`; noise `0.042`; radials `rgba(95,83,72,0.055)`, `rgba(138,138,110,0.065)`; top wash `rgba(255,255,255,0.55)`   |
| `.luxury-slider` thumb              | `#d4af37` (bright gold — **not** `--color-brand-gold`)                                                                        |
| `.scratchpad-textarea::placeholder` | `#b0cca8`                                                                                                                     |
| `::selection`                       | `rgb(212 175 55 / 0.2)` on `#1a1a1a` text                                                                                     |
| Scrollbar thumb                     | `var(--color-taupe-light)` → hover `var(--color-taupe)`                                                                       |

#### Root layout extras (`app/layout.tsx`)

| Element               | Values                                                               |
| --------------------- | -------------------------------------------------------------------- |
| `viewport.themeColor` | `#0D0C0A`                                                            |
| Sonner toast          | `background: #1A1A1A`, `border: 1px solid #2A2A2A`, `color: #E8E8E8` |
| Sonner success border | `!border-[#D4AF37]/40`                                               |
| Sonner error border   | `!border-[#B45345]/50`                                               |

---

### 1.2 Actual colour usage (hardcoded audit)

**Method:** Grep `#…` in `app/`, `components/`, `lib/` `*.{tsx,ts,css}`; `rgb(` / `hsl(` outside `globals.css` appear in ~90 files (arbitrary shadows, gradients, inline styles).

**Known legacy values — role in product:**

| Hex       | Token equivalent?                                        | Typical context                                                                                     |
| --------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `#D4AF37` | **No** — conflicts with `--color-brand-gold` (`#5f5348`) | Sidebar active nav, badges, inputs focus, avatars, empty-state SVGs, selection, hundreds of accents |
| `#1A1814` | Close to `--surface-1` / dark cards                      | `surfaceCardVariants` tone `dark`, Elia glyph, dossier panels                                       |
| `#F9F9F6` | `--color-surface`                                        | Dashboard `main`, TopBar paper, Elia chat center column                                             |
| `#E5E4DF` | `--color-surface-border`                                 | Borders everywhere (often hardcoded, not `border-surface-border`)                                   |
| `#5f5348` | `--color-brand-gold`                                     | Rare in components; Elia uses `brand-gold` utilities more than hex                                  |
| `#6b6b6b` | `--muted-foreground`                                     | Secondary copy, Elia labels, CardDescription                                                        |

**Representative file contexts (not exhaustive):**

- `components/layout/Sidebar.tsx` — active: `bg-[#D4AF37]/10`, `border-[#D4AF37]/18`, `text-[#D4AF37]`; logo `drop-shadow` `rgba(212,175,55,…)`; divider gradient `rgba(212,175,55,0.22)`
- `components/ui/button.tsx` — `gold` variant uses `bg-brand-gold`; other variants use `#0A0A0A`, `#E5E4DF`, `#F2F2EE`, `#6B6B6B`, `#C0392B`, `#4A7C59`
- `components/ui/input.tsx` — focus `ring-[#D4AF37]/30`, `border-[#D4AF37]` (not brand-gold token)
- `components/ui/badge.tsx` — `gold`: `bg-[#D4AF37]/20 text-[#A88B25]`
- `app/(dashboard)/layout.tsx` — `bg-[#F9F9F6]` on `main` + `paper-shadow`
- `lib/types/database.ts` — `LEAD_STATUS_CONFIG` inline `color` / `bgColor` with `#D4AF37`, Tailwind `amber-500`, `blue-500`, etc.

**rgb/hsl outside globals.css:** Used for shadows (`rgb(0_0_0/0.06)`), glass overlays (`bg-white/60`), sidebar hovers (`white/[0.06]`), manager dark sheets, marketing charts — not centralized.

---

### 1.3 Colour frequency table

**Top hex literals** (`app/` + `components/` + `lib/`, case-normalized, occurrence count):

| Count | Hex       | Notes                                   |
| ----: | --------- | --------------------------------------- |
|   587 | `#d4af37` | Legacy bright gold — most common accent |
|   423 | `#1a1a1a` | Primary dark text                       |
|   351 | `#e5e4df` | Primary border                          |
|   184 | `#9e9e9e` | Tertiary / icon muted                   |
|   164 | `#b5a99a` | Taupe / placeholder                     |
|   157 | `#6b6b6b` | Muted foreground                        |
|   133 | `#f9f9f6` | Surface / paper                         |
|   125 | `#8a8a6e` | Olive icons                             |
|   100 | `#c0392b` | Danger                                  |
|    82 | `#fafaf8` | Near-surface white                      |
|    69 | `#f2f2ee` | Subtle fill                             |
|    62 | `#4a7c59` | Success                                 |
|    61 | `#a88b25` | Dark gold text on badges                |
|    43 | `#1a1814` | Dark card tone                          |
|    24 | `#0a0a0a` | Brand black                             |
|    21 | `#0d0c0a` | Canvas                                  |
|    18 | `#2c6fac` | Info blue                               |

**`brand-gold` utility usage** (main tree): ~30+ files import `bg-brand-gold` / `text-brand-gold` / `border-brand-gold` — concentrated in Elia, newer buttons (`variant="gold"`), and scattered actions; still minority vs `#D4AF37` hex.

---

### 1.4 Effective palette (the colours that actually define this product)

Despite token rename to umber (`#5f5348`), the **visible** Atlas palette is:

1. **Canvas / shell:** `#0D0C0A` with warm brown/olive radial glows and 5% noise grain
2. **Paper / content:** `#F9F9F6` (cream), floating with heavy `paper-shadow`
3. **Borders:** `#E5E4DF` hairlines; dark UI uses `white/6`–`white/10`
4. **Primary text:** `#1A1A1A` on paper; `white/50`–`white/90` on canvas
5. **Secondary text:** `#6B6B6B`, `#9E9E9E`, `#B5A99A`
6. **Accent (dominant):** `#D4AF37` metallic gold in navigation, focus rings, badges, illustrations
7. **Accent (token/intended):** `#5F5348` umber via `brand-gold` on primary CTAs and Elia
8. **Semantic:** `#4A7C59` success, `#C0392B` danger, `#C5830A` warning, `#2C6FAC` info
9. **Dark panels:** `#1A1814`, `#161411`, `#1E1C18` for dossier/manager surfaces

---

## 2. Typography

### 2.1 Font families

**Loaded in `app/layout.tsx` (next/font/google):**

| CSS variable        | Family           | Weights / styles                    |
| ------------------- | ---------------- | ----------------------------------- |
| `--font-geist-sans` | Geist Sans       | Default latin, `display: swap`      |
| `--font-geist-mono` | Geist Mono       | Default latin                       |
| `--font-playfair`   | Playfair Display | 400, 500, 600, 700; normal + italic |

**Applied on `<body>`:** `` `${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} antialiased` ``

**Token mapping (`globals.css`):** `--font-serif`, `--font-sans`, `--font-mono` as listed in §1.1.

**Usage patterns:**

- **Body default:** `font-sans` / Geist on `body` and most UI
- **Display / headings:** `font-serif` or inline `style={{ fontFamily: "var(--font-playfair)" }}` on `TopBar` h1 (light variant only)
- **Mono:** Elia session stats, message timestamps, ordered-list numbers in `EliaChatMessage`
- **No `tailwind.config` font scale** — Tailwind v4 `@theme` does not define `text-*` size tokens; sizes are utility classes only

---

### 2.2 Intended type scale

No centralized type scale in CSS. **De facto scale from primitives:**

| Element               | Classes / sizes                                                               |
| --------------------- | ----------------------------------------------------------------------------- |
| `CardTitle`           | `text-base font-semibold leading-none tracking-tight text-[#1A1A1A]`          |
| `CardDescription`     | `text-sm text-[#6B6B6B]`                                                      |
| `DialogTitle`         | `text-lg font-semibold text-[#1A1A1A]`                                        |
| `IndulgeField` label  | `text-[11px] font-semibold uppercase tracking-widest text-[#6B6B6B]`          |
| `InfoRow` label       | `text-[10px] font-medium uppercase tracking-wider text-[#B5A99A]`             |
| `InfoRow` value       | `text-sm font-medium text-[#1A1A1A]`                                          |
| `TopBar` h1           | `text-2xl md:text-3xl lg:text-4xl font-semibold leading-tight tracking-tight` |
| `TopBar` subtitle     | `text-[13px] font-normal tracking-wide`                                       |
| Sidebar nav           | `text-[13px] font-medium tracking-[0.01em]`                                   |
| Sidebar section label | `text-[10px] font-semibold uppercase tracking-[0.12em]`                       |

---

### 2.3 Actual class usage

**Standard Tailwind `text-*` counts** (`app/` + `components/`):

| Count | Class       |
| ----: | ----------- |
|   549 | `text-sm`   |
|   516 | `text-xs`   |
|    71 | `text-lg`   |
|    47 | `text-base` |
|    46 | `text-xl`   |
|    34 | `text-2xl`  |
|    13 | `text-3xl`  |
|     7 | `text-4xl`  |
|     4 | `text-5xl`  |
|     2 | `text-7xl`  |

**Arbitrary sizes** (common): `text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[28px]` (Elia glyph).

**Font weight:** `font-medium` and `font-semibold` dominate component grep; `font-bold` on metrics and ledger rows; `font-normal` on Elia body.

**Tracking:** `tracking-tight` (headings), `tracking-wide` / `tracking-widest` / `tracking-[0.12em]` / `tracking-[0.2em]` (labels, Elia caps).

**Leading:** `leading-tight`, `leading-relaxed`, `leading-[1.7]` (Elia assistant copy), `leading-none`.

**Inline `fontFamily`:** `TopBar` Playfair on light titles; otherwise rare.

---

### 2.4 Typographic patterns

- **Dual personality:** Playfair (elegant, editorial) for page titles and some empty states; Geist (neutral SaaS legibility) for tables, forms, chat body
- **Uppercase micro-labels:** `10px`–`11px`, wide tracking, `#6B6B6B` or `#B5A99A` — forms (`IndulgeField`), dossier (`InfoRow`), Elia side rails (`CAPABILITIES`, `INTELLIGENCE`)
- **Gold period:** `TopBar` `GoldDotTitle` renders trailing `.` as `text-[#D4AF37]`
- **Italic welcome:** Elia empty state `font-serif text-2xl font-normal italic`
- **Inconsistency:** `EmptyTasksState` uses `font-serif` + `text-zinc-800` / `text-zinc-500` (Tailwind zinc, not Atlas hex tokens)

---

## 3. Spacing & Layout

### 3.1 Layout structure (canvas, sidebar, content)

```
┌─────────────────────────────────────────────────────────────┐
│ .layout-canvas (fixed full viewport, #0D0C0A + texture)      │
│  ┌──────────┐  ┌─ p-3 gutter (12px) ─────────────────────┐  │
│  │ Sidebar  │  │ ┌ main: bg #F9F9F6, rounded-2xl ────────┐ │  │
│  │ w-60     │  │ │ .paper-shadow                         │ │  │
│  │ fixed    │  │ │  └ page content (TopBar + children)   │ │  │
│  │ z-40     │  │ └───────────────────────────────────────┘ │  │
│  │ transparent│  └──────────────────────────────────────────┘  │
│  └──────────┘                                                   │
└─────────────────────────────────────────────────────────────┘
```

**Source:** `app/(dashboard)/layout.tsx`

| Property       | Value                                                                           |
| -------------- | ------------------------------------------------------------------------------- |
| Sidebar        | `fixed left-0 top-0 h-full w-60` (`240px`) — **no background**; inherits canvas |
| Content offset | `ml-60`                                                                         |
| Canvas gutter  | `p-3` on wrapper (`12px` top/right/bottom; left flush to sidebar)               |
| Main paper     | `bg-[#F9F9F6] rounded-2xl overflow-hidden paper-shadow flex-1`                  |
| Main overflow  | `overflow-x-hidden`                                                             |

**TopBar** (`components/layout/TopBar.tsx`):

| Property      | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Position      | `sticky top-0 z-30`                                               |
| Height        | Implicit from `py-4` + title (`~56–80px` depending on breakpoint) |
| Padding       | `px-4 py-4 md:px-6 lg:px-8`                                       |
| Light variant | `border-black/[0.05] bg-[#F9F9F6]/80 backdrop-blur-xl`            |
| Dark variant  | `border-white/6 bg-[#0D0C0A]/90 backdrop-blur-xl`                 |
| Title scale   | `text-2xl md:text-3xl lg:text-4xl`                                |

**Common page max-widths:**

| Width       | Example routes                                          |
| ----------- | ------------------------------------------------------- |
| `max-w-5xl` | Task Insights index, employee dossier                   |
| `max-w-6xl` | Manager campaigns, admin conversions                    |
| `max-w-7xl` | Tasks, admin mappings, integrations, master task detail |
| `max-w-4xl` | Manager roster, indulge-world views                     |
| `max-w-2xl` | Modals, import wizard, command palette                  |

---

### 3.2 Spacing scale in use

**Most frequent utilities** (`app/` + `components/`):

| Count | Utility       |
| ----: | ------------- |
|   378 | `gap-2`       |
|   254 | `gap-3`       |
|   147 | `gap-1.5`     |
|   104 | `gap-4`       |
|    70 | `space-y-2`   |
|    68 | `space-y-1.5` |
|    53 | `space-y-4`   |
|    43 | `gap-6`       |

**Padding (top):**

| Count | Utility |
| ----: | ------- |
|   214 | `px-4`  |
|   194 | `px-3`  |
|   188 | `py-3`  |
|   142 | `px-6`  |
|   111 | `px-5`  |
|    78 | `p-6`   |
|    74 | `p-4`   |
|    31 | `p-5`   |

**Dashboard page padding:** Often `px-4 py-4 md:px-6 md:py-8 lg:px-8` (admin) or `px-6 pt-6` (tasks); Task Insights `px-5 pt-6 sm:px-6`.

---

### 3.3 Card & section patterns

**Canonical surface — `surfaceCardVariants` (`components/ui/card.tsx`):**

| Tone     | Classes                                               |
| -------- | ----------------------------------------------------- |
| `luxury` | `border border-[#E5E4DF] bg-white`                    |
| `subtle` | `border border-[#EAEAEA] bg-white`                    |
| `glass`  | `border border-white/80 bg-white/60 backdrop-blur-xl` |
| `stone`  | `border border-[#E5E4DF] bg-[#F9F9F6]`                |
| `dark`   | `border border-white/10 bg-[#1A1814]`                 |

| Elevation | Shadow                                     |
| --------- | ------------------------------------------ |
| `none`    | —                                          |
| `xs`      | `shadow-[0_1px_4px_0_rgb(0_0_0/0.03)]`     |
| `sm`      | `shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]`     |
| `md`      | `shadow-[0_4px_20px_-4px_rgb(0_0_0/0.10)]` |

Base: `rounded-2xl`; default `overflow-hidden`.

**shadcn `Card`:** `rounded-xl border border-[#E5E4DF] bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.06)]`; header `p-5 pb-0`; content `p-5`.

**Record / list patterns:**

- **Leads table:** Wrapped in `surfaceCardVariants`; rows use hover states and `LeadStatusBadge` (see §4.4)
- **Client rows:** `ClientListRow` / `ClientCard` — bordered cream cards, completeness pills
- **Task cards:** `TaskCard` — priority badges, `rounded-xl`/`2xl` mix
- **Empty state:** Centered `py-16`, SVG illustration (gold `#D4AF37` strokes), `font-serif text-lg` title
- **Loading:** `Skeleton` — `animate-pulse rounded-md bg-[#E5E4DF]`

---

## 4. Component Specifications

### 4.1 Button variants

**`components/ui/button.tsx`** — base: `inline-flex … rounded-md text-sm font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50`

| Variant       | Background      | Text              | Border    | Hover                | Focus ring                      |
| ------------- | --------------- | ----------------- | --------- | -------------------- | ------------------------------- |
| `default`     | `#0A0A0A`       | `white`           | —         | `#1A1A1A`            | `ring-brand-gold`               |
| `gold`        | `bg-brand-gold` | `text-surface`    | —         | `bg-brand-gold-dark` | `ring-brand-gold` + `shadow-sm` |
| `outline`     | transparent     | `#1A1A1A`         | `#E5E4DF` | `bg-[#F2F2EE]`       | `ring-brand-gold`               |
| `ghost`       | transparent     | `#1A1A1A`         | —         | `bg-[#F2F2EE]`       | `ring-brand-gold`               |
| `destructive` | `#C0392B`       | white             | —         | `#A93226`            | `ring-[#C0392B]`                |
| `success`     | `#4A7C59`       | white             | —         | `#3D6649`            | `ring-[#4A7C59]`                |
| `muted`       | `#F2F2EE`       | `#6B6B6B`         | —         | `bg-[#E5E4DF]`       | `ring-brand-gold`               |
| `link`        | —               | `text-brand-gold` | —         | underline            | —                               |

**Sizes:** `default` `h-9 px-4`; `sm` `h-8 px-3 text-xs`; `lg` `h-11 px-8 text-base`; `xl` `h-12 rounded-lg px-10 text-base font-semibold`; `icon` `h-9 w-9`; `icon-sm` `h-7 w-7 rounded-sm`.

**`IndulgeButton`:** Wraps `Button`; `loading` → centered `Loader2` `h-4 w-4 animate-spin`; hides left/right icons while loading.

---

### 4.2 Card / surface variants

Documented in §3.3. **Default tone:** `luxury` + `elevation: sm`. Used across Elia chips, task insights bento, Chetto panels, dossier sections.

---

### 4.3 Form elements

**Input (`components/ui/input.tsx`):**

| State   | Border    | Focus                                       |
| ------- | --------- | ------------------------------------------- |
| default | `#E5E4DF` | `ring-2 ring-[#D4AF37]/30 border-[#D4AF37]` |
| error   | `#C0392B` | `ring-2 ring-[#C0392B]/25`                  |

- Background: `bg-white`; text `#1A1A1A`; placeholder `#B5A99A`
- Sizes: `sm` h-8 → `xl` h-11; `rounded-md`

**Select:** Trigger matches input border/focus; content `rounded-lg border-[#E5E4DF] bg-white shadow-[0_4px_16px_0_rgb(0_0_0/0.08)]`; item focus `bg-[#F2F2EE]`; check icon `text-[#D4AF37]`.

**IndulgeField:** Label `text-[11px] uppercase tracking-widest #6B6B6B`; error `#C0392B`; hint `#B5A99A`.

**Textarea:** Same border/focus pattern as input (see `components/ui/textarea.tsx`).

---

### 4.4 Badges & status indicators

**`Badge` variants (`components/ui/badge.tsx`):** `rounded-full px-2.5 py-0.5 text-xs font-medium`

| Variant         | Colours                                                     |
| --------------- | ----------------------------------------------------------- |
| `default`       | `bg-[#0A0A0A] text-white`                                   |
| `gold`          | `bg-[#D4AF37]/20 text-[#A88B25] border border-[#D4AF37]/30` |
| `outline`       | `border-[#E5E4DF] text-[#6B6B6B]`                           |
| `new`           | `bg-[#E8F0FA] text-[#2C6FAC]`                               |
| `attempted`     | `bg-[#FEF3D0] text-[#C5830A]`                               |
| `in_discussion` | `bg-[#F0EBFF] text-[#6B4FBB]`                               |
| `won`           | `bg-[#EBF4EF] text-[#4A7C59]`                               |
| `lost`          | `bg-[#FAEAE8] text-[#C0392B]`                               |
| `nurturing`     | `bg-cyan-50 text-cyan-800 border border-cyan-200/60`        |
| `junk`          | `bg-[#F5F5F5] text-[#9E9E9E]`                               |

**`LeadStatusBadge`:** `rounded-full` + dot `w-1.5 h-1.5`; uses `LEAD_STATUS_CONFIG.className` (Tailwind palette) **or** inline `style={{ backgroundColor, color }}` from hex/rgba in `lib/types/database.ts`.

---

### 4.5 Modal / overlay

**Dialog (`components/ui/dialog.tsx`):**

| Part       | Specification                                                                            |
| ---------- | ---------------------------------------------------------------------------------------- |
| Overlay    | `bg-black/50 backdrop-blur-sm`; fade in/out                                              |
| Content    | `max-w-lg` default; `bg-white rounded-2xl p-6 shadow-[0_20px_60px_-10px_rgb(0_0_0/0.2)]` |
| Animations | zoom 95% + slide; `animate-in` / `animate-out`                                           |
| Close      | `rounded-full p-1 text-[#9E9E9E] hover:text-[#1A1A1A] hover:bg-[#F2F2EE]`                |

**Sheet, popover, dropdown:** Same cream/white fills and `#E5E4DF` borders; dropdown uses `animate-in` slide/zoom patterns.

---

### 4.6 Sidebar & TopBar

**Sidebar** — see §3.1. Additional detail:

| Element        | Specification                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Logo           | `43×46` `/logo.svg`; gold drop-shadow filter                                                                                     |
| Nav item       | `px-3 py-2.5 rounded-xl gap-3`; inactive `text-white/50 hover:text-white/90 hover:bg-white/[0.06]`                               |
| Active         | `bg-[#D4AF37]/10 border border-[#D4AF37]/18 text-[#D4AF37]` + left pill `w-[3px] h-4 bg-[#D4AF37]/70` (`layoutId="active-pill"`) |
| Icons          | `w-[15px] h-[15px]`; active `text-[#D4AF37]`                                                                                     |
| Hover motion   | Framer `whileHover={{ x: 3 }}` `duration: 0.3` ease `[0.22, 1, 0.36, 1]`                                                         |
| Profile avatar | `w-8 h-8 ring-1 ring-white/[0.1]`; fallback `bg-[#D4AF37]/15 text-[#D4AF37]/90`                                                  |
| Sign out       | `LogOut` `w-3.5 h-3.5`; hover `hover:bg-white/[0.08]`                                                                            |

**TopBar** — see §3.1. Right cluster: search kbd chip, `DomainSwitcher`, actions slot, chat `h-9 w-9 rounded-xl`, `NotificationBell`, optional SLA alerts.

---

## 5. Border Radius & Elevation

### 5.1 Radius scale in use

**Token scale (`globals.css`):** `sm` 4px, `md` 8px, `lg` 12px, `xl` 16px — **rarely referenced directly**; components use Tailwind `rounded-*`.

**Frequency** (`app/` + `components/`):

| Approx. count | Class          | Typical use                                        |
| ------------: | -------------- | -------------------------------------------------- |
|           462 | `rounded-full` | Avatars, badges, pills, dots                       |
|           378 | `rounded-xl`   | Buttons (lg), TopBar controls, cards               |
|           272 | `rounded-lg`   | Select menus, icon wells, inputs group             |
|           167 | `rounded-2xl`  | **Dashboard paper**, `surfaceCardVariants`, modals |
|            75 | `rounded-md`   | Default buttons, inputs                            |
|             7 | `rounded-3xl`  | Occasional hero panels                             |

**Dominant radius:** `rounded-2xl` for structural surfaces; `rounded-xl` for controls; `rounded-full` for status chroma.

**Arbitrary:** Elia user bubble `rounded-[16px] rounded-br-[4px]`; input bar `rounded-[14px]`.

---

### 5.2 Shadow & elevation patterns

**Dominant pattern:** **Border + subtle shadow**, not deep Material elevation.

| Layer               | Mechanism                                                    |
| ------------------- | ------------------------------------------------------------ |
| Canvas → paper      | `paper-shadow` (large diffuse `rgba(0,0,0,0.55)`)            |
| Cards               | `0_1px_3px_0_rgb(0_0_0/0.06)` or `surfaceCardVariants` xs–md |
| Sticky chrome       | `backdrop-blur-xl` + semi-transparent bg                     |
| Dark manager sheets | Border `white/[0.08]` + dark fill, occasional `shadow-2xl`   |

**`shadow-*` Tailwind presets:** Seldom used; arbitrary `shadow-[...]` preferred.

**`backdrop-blur`:** TopBar, Elia header/footer, glass cards, dialog overlay, command palette — `backdrop-blur-sm` to `backdrop-blur-xl`.

---

## 6. Motion & Animation

### 6.1 Libraries in use

| Library                                   | Scope                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **framer-motion**                         | ~150+ files in main tree — Sidebar nav, Elia chat, manager dashboards, modals, task panels, workspace whisper, dossier async |
| **Tailwind `animate-in` / `animate-out`** | Radix dialogs, selects, TopBar mount                                                                                         |
| **Tailwind `animate-pulse`**              | Skeletons, loading rows                                                                                                      |
| **Tailwind `animate-spin`**               | `Loader2` on buttons                                                                                                         |
| **CSS `@keyframes`**                      | Inline in `EliaChat.tsx` only (`eliaBreathe`, `eliaDotPulse`); slider thumb transitions in `globals.css`                     |

**No `@keyframes` in `globals.css`** except via SVG/noise (static). No page-level route transitions.

---

### 6.2 Animation inventory

| Location              | What                          | Duration / easing                   | Trigger        |
| --------------------- | ----------------------------- | ----------------------------------- | -------------- |
| `Sidebar` `NavItem`   | `x: 3`                        | 0.3s `[0.22, 1, 0.36, 1]`           | hover          |
| `Sidebar` active pill | `layoutId="active-pill"`      | layout animation                    | route change   |
| `Sidebar` sign out    | `scale` + `rotate`            | hover/tap                           | pointer        |
| `TopBar`              | `fade-in slide-in-from-top-2` | 300ms                               | mount          |
| `Dialog` / `Select`   | fade + zoom 95%               | Radix open/close                    | state          |
| `EliaChat` header     | `y: -56 → 0`, opacity         | 0.4s delay 0.1s `[0.16, 1, 0.3, 1]` | mount          |
| `EliaChat` sidebars   | `x: ±40 → 0`                  | 0.5s delay 0.2s                     | mount          |
| `EliaChat` empty hero | `y: 16 → 0`, opacity          | 0.6s delay 0.4s                     | mount          |
| `EliaChat` messages   | `y: 8 → 0`, opacity           | 0.3s                                | each message   |
| `eliaBreathe`         | opacity 0.35 ↔ 0.85           | 3s ease-in-out infinite             | glyph glow     |
| `eliaDotPulse`        | dot opacity                   | 1.2s staggered                      | thinking state |
| `ChatTriggerButton`   | `scale 1.08` / `0.94`         | 150ms                               | hover/active   |
| `luxury-slider` thumb | `scale(1.18)`                 | 0.15s ease                          | hover          |

**Transition utilities:** `transition-all duration-200` on buttons; `transition-colors duration-150`–`300` widespread on hovers.

---

## 7. Iconography

### 7.1 Libraries

| Library                          | Usage                                                       |
| -------------------------------- | ----------------------------------------------------------- |
| **lucide-react**                 | **Exclusive** in `app/` + `components/` (~194 import sites) |
| @heroicons, react-icons, @tabler | **Nothing found**                                           |

---

### 7.2 Size standards

| Size                  | Usage                                                             |
| --------------------- | ----------------------------------------------------------------- |
| `w-4 h-4` / `h-4 w-4` | **Default** — ~314 combined occurrences; buttons, TopBar, selects |
| `w-[15px] h-[15px]`   | Sidebar nav                                                       |
| `w-3.5 h-3.5`         | InfoRow wells, compact actions                                    |
| `w-5 h-5`             | Slightly emphasis icons                                           |
| `h-[18px] w-[18px]`   | Elia send button                                                  |
| `strokeWidth={1.75}`  | TopBar `MessageSquare`                                            |

**Colour on icons:** `text-[#B5A99A]`, `text-[#9E9E9E]`, `text-brand-gold`, `text-white/30` (sidebar inactive), semantic colours on status rows.

---

### 7.3 Top 20 icons used

By import count (`lucide-react`, main tree):

| Count | Icon          |
| ----: | ------------- |
|    46 | Loader2       |
|    41 | X             |
|    19 | Plus          |
|    17 | Check         |
|    17 | Users         |
|    17 | Sparkles      |
|    17 | ChevronRight  |
|    16 | Trash2        |
|    15 | ChevronDown   |
|    15 | Search        |
|    14 | User          |
|    13 | Phone         |
|    13 | Clock         |
|    13 | AlertTriangle |
|    13 | Send          |
|    13 | CheckCircle2  |
|    12 | ArrowRight    |
|    12 | TrendingUp    |
|    12 | ChevronLeft   |
|    11 | Calendar      |

(Also common: `MessageSquare`, `Pencil`, `BarChart3`, `Globe`, `Brain` for Elia nav.)

---

## 8. Elia Interface

### 8.1 Layout

**Route:** `app/(dashboard)/elia-preview/page.tsx` — wrapper `bg-[#F9F9F6] flex-1`; child `EliaChat`.

**Structure (`EliaChat.tsx`):**

```
┌──────────────────────────────────────────────────────────────┐
│ .atlas-masthead-texture (full bleed)                          │
│ ┌ header h-14: glyph | "Elia" | Online status ─────────────┐ │
│ ├──────────┬─────────────────────────────┬───────────────┤ │
│ │ LEFT     │ CENTER (flex-1)              │ RIGHT          │ │
│ │ 280px    │ bg #F9F9F6                   │ 260px          │ │
│ │ #F2F2EE  │ scroll: empty OR messages    │ #F2F2EE       │ │
│ │ md+ only │ footer: input bar            │ md+ only       │ │
│ └──────────┴─────────────────────────────┴───────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

- Below `md`: side columns `hidden`; single column chat
- Empty state: centered sparkle emoji `text-7xl opacity-[0.42]`, welcome chips `max-w-lg` grid
- Active chat: messages `px-8 py-6 gap-6`; input dock `px-8 pb-5 pt-4`

---

### 8.2 Colour palette

Elia aligns with paper tokens but uses **both** umber utilities and legacy hex:

| Role          | Colour                                                               |
| ------------- | -------------------------------------------------------------------- |
| Shell texture | `.atlas-masthead-texture` → `#f9f9f6` + grain                        |
| Side rails    | `#F2F2EE`                                                            |
| Center        | `#F9F9F6`                                                            |
| Primary text  | `#1A1814` (note: slightly different from `#1A1A1A`)                  |
| Muted         | `#6b6b6b`                                                            |
| Borders       | `#E5E4DF`                                                            |
| Accent        | `brand-gold`, `brand-gold-dark`, `text-success` for Online dot       |
| User bubble   | `bg-white border-[#E5E4DF]`                                          |
| Assistant     | Left border `border-brand-gold` (no filled bubble)                   |
| CTA send      | `bg-brand-gold text-surface` enabled; disabled `#F2F2EE` / `#6b6b6b` |
| Glow          | `rgb(95 83 72 / 0.14)` radial — matches umber token                  |

---

### 8.3 Message design

**User (`EliaChatMessage`):**

- Right-aligned `max-w-[65%]`
- Bubble: `rounded-[16px] rounded-br-[4px] border border-[#E5E4DF] bg-white px-4 py-3 shadow-[0_1px_4px_0_rgb(0_0_0/0.05)]`
- Body: `text-sm font-normal leading-relaxed text-[#1A1814]`
- Timestamp: `font-mono text-[10px] text-[#6b6b6b]` right-aligned

**Assistant:**

- Left `max-w-[75%]`
- Header (first in sequence): serif `E`, `text-brand-gold-dark` “Elia”, mono timestamp
- Body: **no bubble** — `border-l-2 border-brand-gold pl-4 pr-4 py-3`
- Typography: `text-sm leading-[1.7]`; bold `**markdown**`; lists with `text-brand-gold` bullets/numbers
- Member names highlighted `font-medium text-[#1A1814]`
- Thinking: three `bg-brand-gold` dots `elia-dot-pulse` + “Elia is thinking”

---

### 8.4 Special effects

| Effect                       | Implementation                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| Masthead grain               | `.atlas-masthead-texture` on root                                                                      |
| Breathing glyph glow         | `@keyframes eliaBreathe` + radial umber gradient behind “E”                                            |
| Dark glyph avatar (empty/lg) | `bg-[#1A1814] border-white/10`                                                                         |
| Light glyph (header sm)      | `bg-white border-brand-gold/35`                                                                        |
| Header/footer glass          | `bg-white/90 backdrop-blur-md` / `backdrop-blur-sm`                                                    |
| Welcome chip hover           | `hover:border-brand-gold/40 hover:shadow-[0_0_16px_-3px_rgb(95_83_72/0.12)]`                           |
| Input focus                  | `focus-within:border-brand-gold focus-within:shadow-[0_0_0_3px_rgb(95_83_72/0.08)] ring-brand-gold/20` |
| Capability pills             | `rounded-full border-[#E5E4DF] bg-white` → hover `brand-gold` tint                                     |

---

## 9. Aesthetic Signature

### 9.1 Qualitative description

Atlas reads as a **quiet luxury operations console**: a near-black, grain-textured cockpit wraps a floating sheet of warm cream paper. The emotional tone is **warm, restrained, and adult** — not cold fintech blue, not loud startup saturation. Spatially, the product breathes: a fixed 240px navigation rail, a 12px reveal of textured canvas, and generous `rounded-2xl` interior panels communicate craftsmanship more than density. Typography splits personality: **Playfair Display** lends editorial authority to titles and Elia’s welcome, while **Geist Sans** keeps tables, forms, and chat legible at `text-sm` / `text-xs` scale. The signature move that separates Atlas from generic SaaS is the **two-layer shell** — dark tactile canvas plus “paper” content with inset highlight and deep shadow — paired with **gold-adjacent accents** (whether metallic `#D4AF37` in the sidebar or umber `brand-gold` on CTAs). Elia extends the same vocabulary into a three-column intelligence preview: masthead texture, mono/session metadata, and assistant prose as a gold-bar margin note rather than a chat bubble. Overall, it feels like a private members’ club back-office: muted earth tones, soft borders, deliberate motion on navigation, and status chroma kept in pastel pills.

### 9.2 The three biggest inconsistencies to fix in the rebuild

1. **Dual gold systems** — Design tokens define `brand-gold` as umber `#5F5348`, but the most frequent hex in the codebase is metallic `#D4AF37` (sidebar active states, focus rings, badges, illustrations). The product simultaneously reads “muted umber” and “classic gold.”

2. **Split dark/light semantics** — `html`/`body` use dark canvas (`#0D0C0A`, white text) while almost all authenticated UI is light paper with dark text; many components hardcode light-surface hex values instead of semantic tokens (`border-surface-border`, `text-muted-foreground`), so theme coherence is accidental.

3. **Radius and card dialect fragmentation** — Three coexisting surfaces (`Card` at `rounded-xl`, `surfaceCardVariants` at `rounded-2xl`, ad-hoc `rounded-lg` / arbitrary `rounded-[14px]`) plus mixed shadow arbitrary values produce siblings that feel related but not from one elevation system.

---

_End of audit. For component-level behaviour beyond visual spec, see `CLAUDE.md` and `components/ui/` source._
