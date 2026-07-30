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
