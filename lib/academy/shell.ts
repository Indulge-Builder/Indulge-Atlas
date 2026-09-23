/**
 * Native-shell detection.
 *
 * The Android APK (see capacitor.config.ts) is a WebView pointed at
 * `/academy`, and it appends a token to its User-Agent so the server can tell
 * it apart from an ordinary browser.
 *
 * This exists because the APK must be Academy ONLY. The native URL guard in
 * MainActivity blocks full page loads outside `/academy`, but Next.js
 * client-side navigation never reaches a WebViewClient — so the app itself has
 * to stop offering links out. Detecting the shell on the server means the link
 * is never rendered at all: no client JS, no hydration flash, and no way to
 * reach the Atlas dashboard from inside the app.
 *
 * Pure module — no I/O, safe on client and server.
 */

import { isPrivilegedRole } from "@/lib/types/database";
import type { UserRole } from "@/lib/types/database";

/** Must stay in sync with NATIVE_SHELL_UA_TOKEN in capacitor.config.ts. */
export const NATIVE_SHELL_UA_TOKEN = "academy-shell";

/**
 * True when the request came from the Academy APK.
 *
 * Presentation only — never an authorization signal. A user-agent is trivially
 * spoofable, so this decides what to *show*, never what someone may *do*. Every
 * Academy route still gates on `isAcademyTrainer` server-side.
 */
export function isNativeShell(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return userAgent.includes(NATIVE_SHELL_UA_TOKEN);
}

/**
 * Whether to render the "← Atlas" link in the Indulge Training nav.
 *
 * Administrators only. `isPrivilegedRole` (admin / founder / super_admin) is
 * the codebase's canonical elevated-access test and is exactly what the Atlas
 * dashboard gates on, so the link can never point somewhere its owner would be
 * bounced from. A literal `role === "admin"` check would instead hide Atlas
 * from founders and super_admins, who outrank admins.
 *
 * Never shown inside the Android shell whatever the role: that APK is Training
 * only, and its native URL guard would refuse the destination.
 *
 * PRESENTATION ONLY — never authorization. Hiding the link stops nobody from
 * typing the URL; `app/(dashboard)/layout.tsx` is what actually refuses
 * trainees, and it is enforced server-side on every dashboard render.
 */
export function canReturnToAtlas(opts: {
  role: UserRole | string;
  inNativeShell: boolean;
}): boolean {
  if (opts.inNativeShell) return false;
  return isPrivilegedRole(opts.role);
}
