# Theme 01 — Earth (Default)

> Warm. Grounded. Heritage.
> When Earth is active, Eia looks and feels eye pleasing, asthetic, magentic, easy on eyes, beutiful, new gen soft, warm, thats gives psycologiacl relief and never strainf our user.

---

## Token Map: Earth

| Earth Token                   | Atlas Source                                 | Value                    |
| ----------------------------- | -------------------------------------------- | ------------------------ |
| `--theme-canvas`              | `--color-sidebar-bg`                         | `#0a0a0a`                |
| `--theme-accent`              | `--color-brand-gold`                         | `#D4AF37`                |
| `--theme-accent-hover`        | `--color-brand-gold-dark` (deep)             | `#a88b25`                |
| `--theme-accent-muted`        | `--color-brand-gold-light`                   | `#7a6b5d`                |
| `--theme-sidebar-active-pill` | Active left bar — `#D4AF37`                  | `#D4AF37`                |
| `--theme-text-primary`        | Primary body text                            | `#1a1a1a`                |
| `--theme-text-secondary`      | Secondary/muted text                         | `#6b6b6b`                |
| `--theme-text-tertiary`       | `--color-taupe`                              | `#b5a99a`                |
| `--theme-sidebar-text`        | Inactive nav (implied dark sidebar)          | `rgba(255,255,255,0.55)` |
| `--theme-sidebar-active`      | Active nav text — `#D4AF37` rendered on dark | `#D4AF37`                |
| `--theme-sidebar-hover-bg`    | `--color-sidebar-hover` `#1a1a1a`            | `rgba(255,255,255,0.06)` |
| `--theme-sidebar-active-bg`   | `--color-sidebar-active` `#1e1a0a`           | `rgba(212,175,55,0.10)`  |

---

## CSS — Earth Theme

```css
/* ============================================================
   THEME 01 — EARTH
   ============================================================ */

[data-theme="earth"] {
  /* --- Canvas ------------------------------------------------ */
  --theme-canvas: #0a0a0a;
  --theme-canvas-glow: rgba(212, 175, 55, 0.08);
  --theme-canvas-text: rgba(255, 255, 255, 0.85);

  /* --- Paper ------------------------------------------------- */
  --theme-paper: #ffffff;
  --theme-paper-subtle: #f9f9f6;
  --theme-paper-border: #e5e4df;

  /* --- Accent ------------------------------------------------ */
  --theme-accent: #d4af37;
  --theme-accent-hover: #a88b25;
  --theme-accent-muted: #7a6b5d;
  --theme-accent-surface: rgba(212, 175, 55, 0.1);
  --theme-accent-fg: #0a0a0a;

  /* --- Text -------------------------------------------------- */
  --theme-text-primary: #1a1a1a;
  --theme-text-secondary: #6b6b6b;
  --theme-text-tertiary: #b5a99a;
  --theme-text-inverse: #ffffff;

  /* --- Sidebar ---------------------------------------------- */
  --theme-sidebar-bg: #0a0a0a;
  --theme-sidebar-border: #2a2a2a;
  --theme-sidebar-text: rgba(255, 255, 255, 0.55);
  --theme-sidebar-active: #d4af37;
  --theme-sidebar-hover-bg: #1a1a1a;
  --theme-sidebar-active-bg: #1e1a0a;
  --theme-sidebar-active-pill: #d4af37;
}
```

## Usage Note for Cursor / Claude Code

When implementing Earth theme:

1. The `[data-theme="earth"]` attribute goes on the `<html>` element
2. The default (no attribute) should also resolve to Earth — set it as the `:root` fallback
3. `--theme-accent-fg` is `#0a0a0a` (dark) — all buttons and filled badges using `--theme-accent` as background must use this for text, not white
4. The sidebar has its own explicit bg token `--theme-sidebar-bg` — do not use `--theme-canvas` for sidebar background, they happen to be the same value in Earth but will differ in other themes
