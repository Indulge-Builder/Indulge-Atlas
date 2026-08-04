"use client";

/**
 * AcademyComposer — the intern's input dock.
 *
 * Sticks to the bottom of the chat column. Enter sends, Shift+Enter breaks the
 * line, and the textarea grows to four rows before it starts scrolling. The
 * remaining-turn budget is always visible because it is the one constraint that
 * changes how an intern should play the conversation.
 *
 * Purely presentational: every mutation is owned by `AcademyChat`.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { cn } from "@/lib/utils";

/** A file the intern has picked but not yet sent. `previewUrl` is an object URL. */
export interface PendingAttachment {
  file: File;
  /** `document` is a PDF — it has no visual preview, only a name. */
  kind: "image" | "video" | "document";
  previewUrl: string;
}

/** Four rows of 14px/1.55 copy plus the vertical padding. */
const MAX_TEXTAREA_HEIGHT = 116;

/** Matches the route's zod ceiling — fail in the UI, not on the wire. */
const MAX_MESSAGE_LENGTH = 4000;

/** Matches the route's `z.array(attachmentSchema).max(4)` — fail here, not on the wire. */
const MAX_ATTACHMENTS = 4;

/** Warn once the intern is inside the last few turns. */
const LOW_TURN_THRESHOLD = 3;

/**
 * What the editor observed while this reply was written.
 *
 * These are facts about the editing session — characters pasted, characters
 * typed, how long it took — and nothing else. A paste is a paste: it says
 * nothing about where the text came from, and no consumer may present it as
 * evidence of AI use. `finalChars` is added server-side from the submitted body.
 */
export type ComposerComposition = {
  pasteCount: number;
  pastedChars: number;
  largestPasteChars: number;
  typedChars: number;
  timeToFirstInputMs: number | null;
  compositionMs: number | null;
};

function emptyComposition(): ComposerComposition {
  return {
    pasteCount: 0,
    pastedChars: 0,
    largestPasteChars: 0,
    typedChars: 0,
    timeToFirstInputMs: null,
    compositionMs: null,
  };
}

export function AcademyComposer({
  disabled,
  pending,
  remainingTurns,
  onSend,
  onClose,
  closing = false,
  uploading = false,
}: {
  disabled: boolean;
  pending: boolean;
  remainingTurns: number;
  /** Text may be empty when an attachment is present. */
  onSend: (
    text: string,
    attachments: PendingAttachment[],
    composition: ComposerComposition,
  ) => void;
  onClose: () => void;
  closing?: boolean;
  uploading?: boolean;
}): JSX.Element {
  const [value, setValue] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editing telemetry. Refs, not state: these change on every keystroke and
  // nothing renders from them, so re-rendering the composer per character would
  // be pure waste. Reset after each send so counters describe one reply.
  const telemetryRef = useRef<ComposerComposition>(emptyComposition());
  const openedAtRef = useRef<number | null>(null);
  const firstInputAtRef = useRef<number | null>(null);
  /** Length of a paste that has fired but whose onChange has not landed yet. */
  const pendingPasteRef = useRef(0);

  // Clock reads live in effects and event handlers, never in render.
  useEffect(() => {
    openedAtRef.current = Date.now();
  }, []);

  const markFirstInput = useCallback(() => {
    if (firstInputAtRef.current === null) firstInputAtRef.current = Date.now();
  }, []);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pasted = event.clipboardData.getData("text");
      if (pasted.length > 0) {
        const t = telemetryRef.current;
        t.pasteCount += 1;
        t.pastedChars += pasted.length;
        t.largestPasteChars = Math.max(t.largestPasteChars, pasted.length);
        pendingPasteRef.current = pasted.length;
      }
      markFirstInput();
    },
    [markFirstInput],
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = event.target.value;
      // onPaste fires first, so a growth already accounted for as a paste must
      // not be double-counted as typing.
      const fromPaste = pendingPasteRef.current;
      pendingPasteRef.current = 0;
      const delta = next.length - value.length;
      if (delta > 0 && fromPaste === 0) telemetryRef.current.typedChars += delta;
      markFirstInput();
      setValue(next);
    },
    [value, markFirstInput],
  );

  const noTurnsLeft = remainingTurns <= 0;
  const inputLocked = disabled || closing || noTurnsLeft;
  const canSend =
    !inputLocked && !pending && !uploading && (value.trim().length > 0 || attachments.length > 0);

  /*
   * Object URLs leak until revoked — but revoking on state change tore down the
   * URL of a file that had just been handed to the caller for its optimistic
   * bubble, so the preview broke at the moment of sending. Tracked in a ref and
   * released only on unmount.
   */
  const objectUrlsRef = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current = [];
    },
    [],
  );

  const pickFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []);
      event.target.value = ""; // allow re-picking the same file
      if (picked.length === 0) return;

      const accepted: PendingAttachment[] = [];
      const rejected: string[] = [];

      for (const file of picked) {
        const kind = file.type.startsWith("video/")
          ? ("video" as const)
          : file.type.startsWith("image/")
            ? ("image" as const)
            : file.type === "application/pdf"
              ? ("document" as const)
              : null;
        // Was a silent `return` — an unsupported file simply vanished. Now each
        // rejection is named, and one bad file no longer discards the good ones
        // picked alongside it.
        if (!kind) {
          rejected.push(file.name);
          continue;
        }
        const previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.push(previewUrl);
        accepted.push({ file, kind, previewUrl });
      }

      if (rejected.length > 0) {
        toast.error(
          rejected.length === 1
            ? `${rejected[0]} cannot be shared`
            : `${rejected.length} files cannot be shared`,
          { description: "Attach images, videos, or PDFs." },
        );
      }

      setAttachments((prev) => {
        const room = MAX_ATTACHMENTS - prev.length;
        if (accepted.length === 0) return prev;
        if (room <= 0) {
          toast.error(`Up to ${MAX_ATTACHMENTS} files per message`);
          return prev;
        }
        if (accepted.length > room) {
          toast.error(`Only ${room} more can be attached`, {
            description: `The limit is ${MAX_ATTACHMENTS} per message.`,
          });
        }
        return [...prev, ...accepted.slice(0, room)];
      });
    },
    [],
  );

  /** Remove one staged file. The URL is released on unmount, not here. */
  const removeAttachment = useCallback((previewUrl: string) => {
    setAttachments((prev) => prev.filter((a) => a.previewUrl !== previewUrl));
  }, []);

  // Grow with the content, then scroll. Reset to `auto` first so the box can
  // also shrink back down when text is deleted.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  // Return focus to the composer as soon as the client's reply lands.
  useEffect(() => {
    if (!pending && !inputLocked) textareaRef.current?.focus();
  }, [pending, inputLocked]);

  const submit = useCallback(() => {
    const text = value.trim();
    if ((!text && attachments.length === 0) || inputLocked || pending || uploading)
      return;

    const now = Date.now();
    const firstInputAt = firstInputAtRef.current;
    const composition: ComposerComposition = {
      ...telemetryRef.current,
      timeToFirstInputMs:
        firstInputAt !== null && openedAtRef.current !== null
          ? Math.max(0, firstInputAt - openedAtRef.current)
          : null,
      compositionMs: firstInputAt !== null ? Math.max(0, now - firstInputAt) : null,
    };

    onSend(text, attachments, composition);
    setValue("");

    // Start a fresh measurement window for the next reply.
    telemetryRef.current = emptyComposition();
    firstInputAtRef.current = null;
    pendingPasteRef.current = 0;
    openedAtRef.current = now;
    // Ownership of the object URLs passes to the caller for the optimistic
    // bubbles, so clear the references without revoking them here.
    setAttachments([]);
  }, [value, attachments, inputLocked, pending, uploading, onSend]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      // Never swallow Enter mid-IME-composition (Japanese, Hindi, etc.).
      if (isComposing || event.nativeEvent.isComposing) return;
      event.preventDefault();
      submit();
    },
    [isComposing, submit],
  );

  const turnLabel = noTurnsLeft
    ? "Turn limit reached — close the conversation to be scored"
    : `${remainingTurns} ${remainingTurns === 1 ? "turn" : "turns"} left`;

  return (
    <div className="sticky bottom-0 z-10 border-t border-surface-border bg-surface/95 px-3 pb-3 pt-2.5 backdrop-blur-sm sm:px-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span
          className={cn(
            "text-[11px] font-medium tracking-[0.04em]",
            noTurnsLeft
              ? "text-danger"
              : remainingTurns <= LOW_TURN_THRESHOLD
                ? "text-warning"
                : "text-chat-ink-muted",
          )}
          aria-live="polite"
        >
          {turnLabel}
        </span>

        {/* Always reachable — an intern who has burned every turn still needs a
            way out, so this is gated on `closing` alone. */}
        <IndulgeButton
          type="button"
          variant="outline"
          size="sm"
          loading={closing}
          onClick={onClose}
          className="border-surface-border text-chat-ink hover:bg-surface-subtle"
        >
          {closing ? "Closing…" : "Close conversation"}
        </IndulgeButton>
      </div>

      {/* Staged media — shown above the input, WhatsApp-style, before sending.
          One row per file, each removable on its own. */}
      {attachments.length > 0 ? (
        <div className="mb-2 space-y-1.5">
          {attachments.map((att) => (
            <div
              key={att.previewUrl}
              className="flex items-center gap-3 rounded-xl border border-chat-bubble-in-border bg-chat-bubble-in p-2"
            >
              {att.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={att.previewUrl}
                  alt=""
                  className="size-14 shrink-0 rounded-lg object-cover"
                />
              ) : att.kind === "video" ? (
                <video
                  src={att.previewUrl}
                  className="size-14 shrink-0 rounded-lg object-cover"
                  muted
                  playsInline
                />
              ) : (
                // A PDF has no thumbnail — name it rather than show a blank tile.
                <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-surface-subtle text-[10px] font-semibold uppercase tracking-[0.08em] text-chat-ink-muted">
                  PDF
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-chat-ink">
                  {att.file.name}
                </p>
                <p className="text-[11px] text-chat-ink-muted">
                  {att.kind === "video"
                    ? "Video"
                    : att.kind === "document"
                      ? "PDF"
                      : "Photo"}{" "}
                  · {(att.file.size / 1024 / 1024).toFixed(1)} MB
                  {uploading ? " · uploading…" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeAttachment(att.previewUrl)}
                disabled={uploading}
                aria-label={`Remove ${att.file.name}`}
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-chat-ink-muted transition-colors hover:bg-surface-subtle hover:text-chat-ink disabled:opacity-40"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl border bg-chat-bubble-in px-3 py-2 transition-colors",
          inputLocked
            ? "border-surface-border bg-surface-subtle"
            : "border-surface-border focus-within:border-chat-accent-dark/45 focus-within:ring-2 focus-within:ring-chat-accent/20",
        )}
      >
        <label htmlFor="academy-composer" className="sr-only">
          Your reply to the client
        </label>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,application/pdf"
          multiple
          hidden
          onChange={pickFile}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={inputLocked || pending || uploading}
          aria-label="Attach a photo or video"
          title="Attach a photo or video"
          className={cn(
            "mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent",
            inputLocked || pending || uploading
              ? "cursor-not-allowed text-chat-ink-muted/50"
              : "cursor-pointer text-chat-ink-muted hover:bg-surface-subtle hover:text-chat-ink",
          )}
        >
          <Paperclip className="size-[18px]" strokeWidth={2} aria-hidden="true" />
        </button>
        <textarea
          id="academy-composer"
          ref={textareaRef}
          rows={1}
          value={value}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={inputLocked}
          onChange={handleChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          placeholder={
            noTurnsLeft
              ? "You have used every turn in this drill."
              : disabled
                ? "This conversation is closed."
                : attachments.length > 0
                  ? "Add a caption…  (optional)"
                  : "Reply as the concierge…  (Enter to send, Shift+Enter for a new line)"
          }
          className={cn(
            "min-h-6 flex-1 resize-none border-0 bg-transparent py-1 text-[14px] leading-[1.55] text-chat-ink outline-none",
            "placeholder:text-chat-ink-muted/80",
            inputLocked && "cursor-not-allowed placeholder:text-chat-ink-muted/60",
          )}
          style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
        />

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label={uploading ? "Uploading attachment" : "Send reply"}
          className={cn(
            "mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent focus-visible:ring-offset-2",
            canSend
              ? "cursor-pointer bg-chat-accent text-chat-header-ink shadow-sm hover:bg-chat-accent-dark active:scale-95"
              : "cursor-not-allowed bg-surface-subtle text-chat-ink-muted ring-1 ring-surface-border",
          )}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden="true" />
          ) : (
            <Send className="size-4" strokeWidth={2} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
