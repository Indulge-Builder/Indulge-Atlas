/**
 * AcademyBubble — a single message in the Academy training thread.
 *
 * Server-safe: no client hooks, no browser APIs. The session page can stream
 * the historical transcript straight from an RSC, and `AcademyChat` reuses the
 * exact same component for live/optimistic turns so nothing shifts on hydration.
 *
 * Visual language is built entirely from Atlas `@theme inline` tokens
 * (`chat-*`, `surface`, `taupe`) — zero hardcoded hex. The palette those tokens
 * carry is WhatsApp-flavoured on purpose: interns work in WhatsApp all day, so
 * the drill should transfer as muscle memory. Re-skin from globals.css alone.
 */

import type { JSX } from "react";
import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIST } from "@/lib/utils/time";
import type { TrainingAttachment } from "@/lib/types/database";

/**
 * IST wall clock, "HH:mm". Returns null for missing or unparseable stamps —
 * an optimistic bubble should never blow up the thread over a bad timestamp.
 */
function formatStamp(timestamp: string | null | undefined): string | null {
  if (!timestamp?.trim()) return null;
  try {
    return formatIST(timestamp, "HH:mm");
  } catch {
    return null;
  }
}

/**
 * Delivery receipt for the intern's own messages.
 *  - pending → single tick, dimmed (the reply is still in flight)
 *  - read    → double tick in the read token (the client model has answered)
 *  - else    → double tick, muted (persisted, not yet answered)
 */
function DeliveryTicks({
  pending,
  read,
}: {
  pending: boolean;
  read: boolean;
}): JSX.Element {
  if (pending) {
    return (
      <Check
        className="size-3.5 shrink-0 text-chat-tick opacity-70"
        strokeWidth={2.5}
        aria-label="Sending"
      />
    );
  }
  return (
    <CheckCheck
      className={cn(
        "size-3.5 shrink-0 transition-colors duration-300",
        read ? "text-chat-tick-read" : "text-chat-tick",
      )}
      strokeWidth={2.5}
      aria-label={read ? "Read" : "Delivered"}
    />
  );
}

/**
 * Shared media. Renders from `signedUrl` (minted server-side, short-lived) or a
 * local object URL while an optimistic bubble is still uploading. Without a URL
 * we show a labelled placeholder rather than a broken image.
 */
function AttachmentTile({ attachment }: { attachment: TrainingAttachment }): JSX.Element {
  const url = attachment.signedUrl;

  const label =
    attachment.kind === "video"
      ? "Video"
      : attachment.kind === "document"
        ? "PDF"
        : "Photo";

  if (!url) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-surface-subtle px-3 py-2 text-[12px] text-chat-ink-muted">
        {label} · {attachment.name}
      </div>
    );
  }

  /*
   * A PDF has no thumbnail to render, so it gets a link rather than a preview.
   * `signedUrl` is short-lived and minted server-side; opening in a new tab
   * keeps the trainee inside the conversation.
   */
  if (attachment.kind === "document") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-lg bg-surface-subtle px-3 py-2 text-[12px] text-chat-ink underline-offset-2 transition-colors hover:bg-chat-panel-active hover:underline"
      >
        PDF · {attachment.name}
      </a>
    );
  }

  if (attachment.kind === "video") {
    return (
      <div className="relative overflow-hidden rounded-lg">
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="max-h-64 w-full rounded-lg bg-chat-ink object-cover"
        />
        <span className="sr-only">Video attachment: {attachment.name}</span>
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={attachment.name}
        loading="lazy"
        className="max-h-64 w-full rounded-lg object-cover"
      />
    </a>
  );
}

export function AcademyBubble({
  side,
  body,
  timestamp,
  read = false,
  pending = false,
  attachments = [],
}: {
  side: "client" | "intern";
  body: string;
  timestamp?: string | null;
  /** Double read-ticks — intern bubbles only. */
  read?: boolean;
  /** Single tick + dimmed while the turn is still in flight. */
  pending?: boolean;
  /** Images/videos shared in this turn (migration 127). */
  attachments?: TrainingAttachment[];
}): JSX.Element {
  const isIntern = side === "intern";
  const stamp = formatStamp(timestamp);
  // A media-only turn stores a synthetic body ("[shared a photo]") so the
  // transcript reads correctly — but showing it above the image is noise.
  const isPlaceholderBody = /^\[shared a (photo|video)\]$/.test(body.trim());
  const showBody = body.trim().length > 0 && !(attachments.length > 0 && isPlaceholderBody);

  return (
    <div
      className={cn(
        "flex w-full",
        isIntern ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl border px-3.5 py-2.5 shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] sm:max-w-[72%]",
          "transition-opacity duration-200",
          isIntern
            ? "rounded-br-md border-chat-bubble-out-border bg-chat-bubble-out"
            : "rounded-bl-md border-chat-bubble-in-border bg-chat-bubble-in",
          pending && "opacity-65",
        )}
      >
        <span className="sr-only">
          {isIntern ? "You wrote: " : "The client wrote: "}
        </span>

        {attachments.length > 0 && (
          <div className={cn("space-y-1.5", showBody && "mb-2")}>
            {attachments.map((a) => (
              <AttachmentTile key={a.path} attachment={a} />
            ))}
          </div>
        )}

        {showBody && (
          <p className="text-[14px] leading-[1.55] whitespace-pre-wrap break-words text-chat-ink">
            {body}
          </p>
        )}

        {(stamp || isIntern) && (
          <div
            className={cn(
              "mt-1 flex items-center gap-1",
              isIntern ? "justify-end" : "justify-start",
            )}
          >
            {stamp && (
              <time
                dateTime={timestamp ?? undefined}
                className="text-[10.5px] tabular-nums text-chat-ink-muted"
              >
                {stamp}
              </time>
            )}
            {isIntern && <DeliveryTicks pending={pending} read={read} />}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * TypingIndicator — the simulated client is composing.
 *
 * Rendered as an inbound bubble so the thread's rhythm never jumps when the
 * first streamed delta replaces it with a real message.
 */
export function TypingIndicator(): JSX.Element {
  return (
    <div className="flex w-full justify-start">
      <div
        className="rounded-2xl rounded-bl-md border border-chat-bubble-in-border bg-chat-bubble-in px-4 py-3 shadow-[0_1px_2px_0_rgb(0_0_0/0.05)]"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">The client is typing…</span>
        <span className="flex items-end gap-1" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="size-1.5 animate-bounce rounded-full bg-chat-tick"
              style={{
                animationDelay: `${index * 0.16}s`,
                animationDuration: "1.1s",
              }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
