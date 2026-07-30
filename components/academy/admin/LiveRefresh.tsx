"use client";

/**
 * Keeps the analytics dashboard current without a manual reload.
 *
 * The page is a `force-dynamic` RSC, so `router.refresh()` re-runs the server
 * component and every figure is recomputed from the database. There is no
 * client-side cache to invalidate and no duplicate aggregation logic — the
 * numbers stay derived in exactly one place.
 *
 * Polling rather than Realtime on purpose: a single dashboard refresh re-reads
 * sessions, reviews, tickets and turns and folds them together, so it is far
 * cheaper to do that on a fixed cadence than to re-run the whole aggregation on
 * every individual turn insert across an active cohort.
 *
 * Pauses while the tab is hidden — nobody needs a background tab re-querying
 * the academy every half minute.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const INTERVAL_MS = 30_000;

export function LiveRefresh(): JSX.Element {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [lastAt, setLastAt] = useState<number | null>(null);
  /*
   * Held in state rather than computed from `Date.now()` at render time. This
   * component is server-rendered first, so reading the clock during render
   * makes the server and client disagree and produces a hydration mismatch.
   */
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);

  const refreshingRef = useRef(refreshing);
  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  const refresh = useCallback(() => {
    if (refreshingRef.current) return;
    setRefreshing(true);
    router.refresh();
    // `router.refresh()` resolves no promise, so release the spinner on a short
    // timer. It is a progress hint, not a completion signal.
    window.setTimeout(() => {
      setRefreshing(false);
      setLastAt(Date.now());
    }, 700);
  }, [router]);

  // Stamp the initial load so "updated Ns ago" is honest from the first render.
  useEffect(() => {
    setLastAt(Date.now());
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      refresh();
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Advance the relative label once a second without re-querying anything.
  useEffect(() => {
    if (lastAt === null) return;
    setSecondsAgo(0);
    const id = window.setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastAt) / 1000));
    }, 1_000);
    return () => window.clearInterval(id);
  }, [lastAt]);

  // Catch up immediately when the trainer returns to the tab.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex items-center gap-1.5 text-[11.5px] text-black/45"
        aria-live="polite"
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            refreshing ? "bg-warning" : "bg-success",
          )}
          aria-hidden
        />
        {refreshing
          ? "Updating…"
          : secondsAgo === null
            ? "Live"
            : secondsAgo < 5
              ? "Updated just now"
              : `Updated ${secondsAgo}s ago`}
      </span>

      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-black/70 transition-colors hover:border-brand-gold/40 hover:text-brand-gold disabled:opacity-60"
      >
        <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} aria-hidden />
        Refresh
      </button>
    </div>
  );
}
