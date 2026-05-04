import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type WebhookRateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

let webhookRatelimit: Ratelimit | undefined;

function getWebhookRatelimit(): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    return null;
  }
  if (!webhookRatelimit) {
    webhookRatelimit = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      prefix: "webhooks",
    });
  }
  return webhookRatelimit;
}

/** First hop client IP from common proxy headers (Next.js / Vercel). */
function getClientIpFromRequest(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown-ip";
}

/**
 * Sliding-window rate limit: 100 requests / minute per identifier (default: client IP).
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 */
export async function checkWebhookRateLimit(
  req: Request,
  identifier?: string,
): Promise<WebhookRateLimitResult> {
  const id = identifier?.trim() || getClientIpFromRequest(req);
  const rl = getWebhookRatelimit();
  if (!rl) {
    console.error(
      "[rateLimit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing; blocking request",
    );
    return {
      success: false,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 60_000,
    };
  }

  try {
    const result = await rl.limit(id);
    await result.pending;
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (err) {
    // Upstash/network/auth failures must not take down webhooks (would surface as 500 + FUNCTION_INVOCATION_FAILED).
    console.error("[rateLimit] Upstash limit failed; allowing request:", err);
    return {
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60_000,
    };
  }
}
