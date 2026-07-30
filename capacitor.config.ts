import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android shell for Indulge Academy.
 *
 * ── WHY THIS IS A HOSTED SHELL, NOT A BUNDLED APP ───────────────────────────
 * Academy is server-dependent by construction: five pages are `force-dynamic`
 * RSC, every mutation is a Next.js server action, `getAuthUser()` reads cookies
 * server-side, and the persona stream, Opus evaluator and ticket reviewer are
 * server-side Anthropic calls whose key must never reach a device. `next build`
 * with `output: 'export'` fails on server actions and dynamic RSC, so there is
 * no static bundle to ship inside the APK.
 *
 * The WebView therefore loads the deployed app. `webDir` holds only an offline
 * fallback page, shown when the device cannot reach the server.
 *
 * ── OVERRIDING THE TARGET ───────────────────────────────────────────────────
 * Set CAP_SERVER_URL to point a build at a preview deployment or a LAN dev
 * server, e.g.
 *   CAP_SERVER_URL=http://192.168.1.20:3000/academy npm run apk:debug
 * Plain http needs `cleartext` (enabled below only for a non-https target), and
 * Android blocks localhost from the device — use the machine's LAN IP.
 */

/**
 * Appended to the WebView's User-Agent so the server can tell it is the shell.
 * Must stay in sync with NATIVE_SHELL_UA_TOKEN in lib/academy/shell.ts.
 */
const NATIVE_SHELL_UA_TOKEN = "academy-shell";

const PRODUCTION_URL = "https://indulge-atlas.vercel.app/academy";
const serverUrl = process.env.CAP_SERVER_URL?.trim() || PRODUCTION_URL;
const isHttps = serverUrl.startsWith("https://");

/** Hosts the WebView may navigate to. Anything else opens in the real browser. */
const ALLOWED_HOSTS = [
  "indulge-atlas.vercel.app",
  "*.vercel.app", // preview deployments
  "*.supabase.co", // Supabase auth redirects + signed storage URLs
];

const config: CapacitorConfig = {
  appId: "global.indulge.academy",
  appName: "Indulge Academy",
  webDir: "mobile/www",
  // Keep the generated Android project out of the repo root.
  android: {
    path: "mobile/android",
    // Release builds must be signed; debug is fine unsigned for sideloading.
    allowMixedContent: !isHttps,
    /*
     * Lets the deployed app recognise the shell from the User-Agent header, so
     * the (academy) layout can hide cross-app links server-side — no client JS,
     * no hydration flash, and no need to ship @capacitor/core in the web bundle.
     * The native URL guard in MainActivity cannot help here: Next.js client-side
     * navigation never reaches a WebViewClient.
     */
    appendUserAgent: NATIVE_SHELL_UA_TOKEN,
  },
  server: {
    url: serverUrl,
    cleartext: !isHttps,
    /*
     * Scoped deliberately. Without this the shell is a general-purpose browser:
     * any link in a conversation would open inside the app, still wearing the
     * Academy chrome and still holding the session cookie.
     */
    allowNavigation: ALLOWED_HOSTS,
  },
  plugins: {
    // Matches the Academy nav bar (#1A1814) so the status bar does not flash
    // white on launch.
    SplashScreen: {
      backgroundColor: "#1A1814",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      launchAutoHide: true,
      launchShowDuration: 600,
    },
  },
};

export default config;
