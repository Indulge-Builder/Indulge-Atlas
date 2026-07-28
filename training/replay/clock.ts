/**
 * Replay clock — positions every event as an offset from t0 (the ticket's
 * created_at) and compresses playback so a multi-day ticket can be worked in
 * minutes. The intern's own actions are stamped in the SAME scenario-time units
 * (ms from t0), so the scorer compares like with like.
 *
 * Pure math + a thin value object. No timers, no framework, no node deps — the
 * caller owns ticking and passes wall-clock instants in. Fully testable.
 */
import type { ScenarioEvent } from "@/training/types";

/** Default compression: 1 real second → 1 scenario minute (60×). */
export const DEFAULT_REPLAY_SPEED = 60;

/** Real elapsed ms → scenario offset ms (>= 0). */
export function scenarioOffsetFromReal(realElapsedMs: number, speed: number): number {
  return Math.max(0, Math.round(realElapsedMs * speed));
}

/** Scenario offset ms → real ms of playback needed to reach it. */
export function realMsForOffset(offsetMs: number, speed: number): number {
  if (speed <= 0) return 0;
  return Math.max(0, offsetMs / speed);
}

/** Events whose offset has been reached by `offsetMs`, ascending. */
export function eventsDueBy(events: readonly ScenarioEvent[], offsetMs: number): ScenarioEvent[] {
  return events.filter((e) => e.offsetMs <= offsetMs).sort((a, b) => a.offsetMs - b.offsetMs);
}

/** The latest scenario offset worth playing to — the last event, plus a tail. */
export function scenarioDurationMs(events: readonly ScenarioEvent[], tailMs = 0): number {
  const last = events.reduce((m, e) => Math.max(m, e.offsetMs), 0);
  return last + tailMs;
}

/**
 * A running replay. Constructed with the wall-clock instant it started and the
 * playback speed; every read takes "wall now" and returns scenario-time. Pausing
 * is modelled by accumulating paused real-ms and subtracting it.
 */
export class ReplayClock {
  readonly speed: number;
  private readonly startWallMs: number;
  private pausedAccumMs = 0;
  private pauseStartedWallMs: number | null = null;

  constructor(startWallMs: number, speed: number = DEFAULT_REPLAY_SPEED) {
    this.startWallMs = startWallMs;
    this.speed = speed > 0 ? speed : DEFAULT_REPLAY_SPEED;
  }

  /** Scenario-time offset (ms from t0) at wall instant `wallNowMs`. */
  offsetAt(wallNowMs: number): number {
    const pausedSoFar =
      this.pausedAccumMs +
      (this.pauseStartedWallMs != null ? wallNowMs - this.pauseStartedWallMs : 0);
    const realElapsed = wallNowMs - this.startWallMs - pausedSoFar;
    return scenarioOffsetFromReal(realElapsed, this.speed);
  }

  pause(wallNowMs: number): void {
    if (this.pauseStartedWallMs == null) this.pauseStartedWallMs = wallNowMs;
  }

  resume(wallNowMs: number): void {
    if (this.pauseStartedWallMs != null) {
      this.pausedAccumMs += wallNowMs - this.pauseStartedWallMs;
      this.pauseStartedWallMs = null;
    }
  }

  get isPaused(): boolean {
    return this.pauseStartedWallMs != null;
  }
}

/** Format a scenario offset as compact elapsed time (e.g. "2h 14m", "3d 4h"). */
export function formatOffset(offsetMs: number): string {
  const totalMin = Math.round(offsetMs / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const totalHr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (totalHr < 24) return min ? `${totalHr}h ${min}m` : `${totalHr}h`;
  const days = Math.floor(totalHr / 24);
  const hr = totalHr % 24;
  return hr ? `${days}d ${hr}h` : `${days}d`;
}
