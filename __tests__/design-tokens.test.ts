import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Guard against the failure mode that shipped a washed-out Academy to production:
 * the components that consume a design token were merged to `main` while the
 * `@theme` block declaring that token was left behind on a feature branch.
 *
 * Tailwind v4 resolves `bg-chat-canvas` only if `--color-chat-canvas` exists in
 * `@theme`. When it does not, the class is not "broken" — it is simply unknown,
 * so NO rule is emitted, the element keeps no background and its text falls back
 * to the inherited `body` colour (near-white, tuned for the dark shell). On the
 * off-white content surfaces that reads as a translucent white wash, which is
 * exactly how the bug was reported.
 *
 * Nothing about that failure is loud: the build succeeds, no console error is
 * raised, and TypeScript never sees a class name. Only a check like this one
 * catches it before it reaches a deployment.
 */

const ROOT = process.cwd();
const GLOBALS_CSS = join(ROOT, "app", "globals.css");
const SCAN_DIRS = ["app", "components", "lib"];
const SCAN_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

/**
 * The colour families this project owns. Anchoring on a declared list rather
 * than on whatever `@theme` happens to contain is the whole point: derive the
 * families from the stylesheet and a family that goes missing wholesale is never
 * inspected, so the check passes on precisely the tree that is broken.
 *
 * Adding a new family is a one-line change here — deliberately, so that removing
 * one is never silent.
 */
const REQUIRED_FAMILIES = [
  "brand",
  "surface",
  "taupe",
  "muted",
  "success",
  "warning",
  "danger",
  "info",
  "sidebar",
  "chat",
] as const;

/**
 * Utility prefixes that resolve a value out of the `--color-*` namespace.
 * The optional side segment covers `border-b-*`, `divide-x-*`, `ring-offset-*`
 * and friends, which sit between the prefix and the token name.
 */
const COLOR_UTILITY =
  /\b(?:bg|text|border|ring|outline|divide|from|via|to|fill|stroke|placeholder|caret|accent|decoration)(?:-(?:[trblxyse]|offset))?-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)/g;

/** Body of the `@theme` block, found by scanning to its matching brace. */
function readThemeBlock(css: string): string {
  const at = css.indexOf("@theme");
  if (at === -1) throw new Error("app/globals.css has no @theme block");

  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error("app/globals.css has an unterminated @theme block");
}

function declaredColorTokens(css: string): Set<string> {
  const tokens = new Set<string>();
  for (const [, name] of readThemeBlock(css).matchAll(/--color-([a-z0-9-]+)\s*:/g)) {
    tokens.add(name);
  }
  return tokens;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

interface Usage {
  token: string;
  file: string;
}

/**
 * Every colour-utility reference whose first segment matches a family this
 * project actually defines. Anchoring on project families is what keeps
 * Tailwind's own palette (`bg-white`, `text-red-500`, `border-black`) out of the
 * result without having to hard-code Tailwind's defaults.
 */
function projectTokenUsages(families: Set<string>): Usage[] {
  const usages: Usage[] = [];

  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const source = readFileSync(file, "utf8");
      for (const [, token] of source.matchAll(COLOR_UTILITY)) {
        if (!families.has(token.split("-")[0])) continue;
        usages.push({ token, file: relative(ROOT, file).split(sep).join("/") });
      }
    }
  }

  return usages;
}

describe("design tokens", () => {
  const css = readFileSync(GLOBALS_CSS, "utf8");
  const declared = declaredColorTokens(css);
  const declaredFamilies = new Set([...declared].map((token) => token.split("-")[0]));

  // Inspect every family the project owns, plus anything else the stylesheet
  // declares — so a family dropped from @theme is still checked against usage.
  const inspected = new Set<string>([...REQUIRED_FAMILIES, ...declaredFamilies]);

  it("declares every colour family the design system owns", () => {
    const absent = REQUIRED_FAMILIES.filter((family) => !declaredFamilies.has(family));

    expect(
      absent.length === 0,
      `app/globals.css declares no --color-* token for: ${absent.join(", ")}.\n` +
        `An entire palette is missing from the @theme block. Every utility in that ` +
        `family compiles to nothing, leaving those surfaces unstyled.`,
    ).toBe(true);
  });

  it("declares every colour token the source actually uses", () => {
    const missing = new Map<string, Set<string>>();

    for (const { token, file } of projectTokenUsages(inspected)) {
      if (declared.has(token)) continue;
      const files = missing.get(token) ?? new Set<string>();
      files.add(file);
      missing.set(token, files);
    }

    const report = [...missing.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([token, files]) => {
        const shown = [...files].sort().slice(0, 3);
        const more = files.size > shown.length ? ` (+${files.size - shown.length} more)` : "";
        return `  --color-${token} is used but never declared — ${shown.join(", ")}${more}`;
      });

    expect(
      report.length === 0,
      `app/globals.css is missing @theme declarations for tokens the source references.\n` +
        `Tailwind emits no rule for these classes, so the elements render unstyled:\n` +
        `${report.join("\n")}\n\n` +
        `Add the token to the @theme block in app/globals.css — do not paper over it in the component.`,
    ).toBe(true);
  });
});
