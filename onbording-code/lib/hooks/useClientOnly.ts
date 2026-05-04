"use client";

import { useState, useEffect } from "react";

/**
 * Returns true only after the component has mounted on the client.
 * Use to defer rendering of Radix UI components (Dialog, Select, etc.) that
 * generate dynamic IDs, avoiding server/client hydration mismatches.
 */
export function useClientOnly(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
