/**
 * Native-shell detection.
 *
 * The APK must be Academy only, and this token is what tells the server to stop
 * rendering links out to the Atlas dashboard. If it drifts from
 * capacitor.config.ts the app silently starts offering a route the native guard
 * then refuses to load — a dead link with no error, which is why the constant is
 * pinned here.
 */

import { describe, it, expect } from "vitest";
import { NATIVE_SHELL_UA_TOKEN, isNativeShell } from "@/lib/academy/shell";

// Realistic Android WebView UA with Capacitor's appended token.
const SHELL_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) " +
  `Chrome/120.0.0.0 Mobile Safari/537.36 ${NATIVE_SHELL_UA_TOKEN}`;

const CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Mobile Safari/537.36";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";

describe("native shell detection", () => {
  it("recognises the Academy APK", () => {
    expect(isNativeShell(SHELL_UA)).toBe(true);
  });

  it("does not fire for mobile Chrome on the same device", () => {
    expect(isNativeShell(CHROME_UA)).toBe(false);
  });

  it("does not fire for a desktop browser", () => {
    expect(isNativeShell(DESKTOP_UA)).toBe(false);
  });

  it("handles a missing or empty user-agent", () => {
    expect(isNativeShell(null)).toBe(false);
    expect(isNativeShell(undefined)).toBe(false);
    expect(isNativeShell("")).toBe(false);
  });

  it("keeps the token distinctive enough not to collide with real UAs", () => {
    // A generic word like "app" or "android" would match half the web.
    expect(NATIVE_SHELL_UA_TOKEN.length).toBeGreaterThan(8);
    expect(isNativeShell(CHROME_UA + " SomeOtherApp/1.0")).toBe(false);
  });
});
