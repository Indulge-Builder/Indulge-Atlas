"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip, Send, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { IndulgeButton } from "@/components/ui/indulge-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  addTicketNote,
  applyCannedResponse,
  uploadTicketAttachment,
} from "@/lib/actions/concierge-tickets";
import type { TicketComposerProps } from "./panelTypes";

/** The "/c" canned-response shortcut, as a standalone token (start or after whitespace). */
const SLASH_TRIGGER = /(^|\s)\/c$/;

export function TicketComposer({
  ticketId,
  canned,
  canEdit,
}: TicketComposerProps) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [isProof, setIsProof] = React.useState(false);
  const [cannedValue, setCannedValue] = React.useState("");
  const [isInserting, setIsInserting] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  if (!canEdit) return null;

  const hasContent = body.trim().length > 0 || files.length > 0;
  const busy = isSending || isInserting;

  async function insertCanned(templateId: string, stripSlash = false) {
    setCannedValue(templateId);
    setIsInserting(true);
    const res = await applyCannedResponse({ ticketId, templateId });
    setIsInserting(false);
    setCannedValue("");
    setMenuOpen(false);
    if (!res.success || !res.data) {
      toast.error(res.error ?? "Something went wrong");
      return;
    }
    const insertText = res.data.body;
    setBody((prev) => {
      // When triggered by typing "/c", drop the trigger token before inserting.
      const base = (stripSlash ? prev.replace(SLASH_TRIGGER, (_m, p1) => p1) : prev).replace(/\s+$/, "");
      return base.length > 0 ? `${base}\n\n${insertText}` : insertText;
    });
    textareaRef.current?.focus();
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBody(val);
    // Open the canned-response menu the moment the user types the "/c" shortcut.
    if (canned.length > 0 && SLASH_TRIGGER.test(val)) {
      setMenuOpen(true);
      setHighlight(0);
    } else if (menuOpen) {
      setMenuOpen(false);
    }
  }

  function handleBodyKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!menuOpen || canned.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, canned.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = canned[highlight];
      if (item) void insertCanned(item.id, true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMenuOpen(false);
    }
  }

  function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files;
    if (!picked) return;
    setFiles((prev) => [...prev, ...Array.from(picked)]);
    // Reset so the same file can be re-picked after removal.
    e.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSend() {
    if (!hasContent || busy) return;
    setIsSending(true);

    const attachmentIds: string[] = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append("ticketId", ticketId);
      fd.append("file", file);
      fd.append("isProof", isProof ? "true" : "false");
      const res = await uploadTicketAttachment(fd);
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Something went wrong");
        setIsSending(false);
        return;
      }
      attachmentIds.push(res.data.attachmentId);
    }

    const trimmed = body.trim();
    if (trimmed.length > 0) {
      const res = await addTicketNote({ ticketId, body: trimmed, attachmentIds });
      if (!res.success) {
        toast.error(res.error ?? "Something went wrong");
        setIsSending(false);
        return;
      }
    }

    setBody("");
    setFiles([]);
    setIsProof(false);
    setIsSending(false);
    toast.success(trimmed.length > 0 ? "Note added" : "Attachment uploaded");
    router.refresh();
  }

  return (
    <div
      className={cn(
        surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
        "space-y-3 p-4",
      )}
    >
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={handleBodyChange}
          onKeyDown={handleBodyKeyDown}
          placeholder="Add a note or update… (type /c for canned responses)"
          disabled={isSending}
          className="min-h-24"
        />
        {menuOpen && canned.length > 0 && (
          <div
            role="listbox"
            aria-label="Canned responses"
            className="absolute left-2 top-full z-20 mt-1 max-h-56 w-64 overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
          >
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              Canned responses
            </p>
            {canned.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={i === highlight}
                // Keep the textarea focused so selection doesn't blur it away.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => void insertCanned(item.id, true)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm",
                  i === highlight ? "bg-brand-gold/10 text-neutral-900" : "text-neutral-700",
                )}
              >
                <span className="truncate">{item.name}</span>
                {item.shortcut && (
                  <span className="shrink-0 text-[10px] text-neutral-400">{item.shortcut}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <span
              key={`${file.name}-${index}`}
              className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-700"
            >
              <Paperclip className="h-3 w-3 shrink-0 text-neutral-400" />
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                disabled={isSending}
                aria-label={`Remove ${file.name}`}
                className="shrink-0 rounded-full p-0.5 text-neutral-400 transition-colors hover:text-neutral-700 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {canned.length > 0 && (
          <div className="w-48">
            <Select
              value={cannedValue}
              onValueChange={(id) => insertCanned(id)}
              disabled={busy}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Insert canned…" />
              </SelectTrigger>
              <SelectContent>
                {canned.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,video/*"
          onChange={handleFilesChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
        >
          <Paperclip className="h-3.5 w-3.5" />
          Attach files
        </button>

        <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-neutral-600">
          <input
            type="checkbox"
            checked={isProof}
            onChange={(e) => setIsProof(e.target.checked)}
            disabled={isSending}
            className="h-3.5 w-3.5 rounded border-neutral-300 accent-[#D4AF37]"
          />
          Attach as proof of confirmation
        </label>

        <IndulgeButton
          variant="gold"
          className="ml-auto"
          loading={isSending}
          disabled={!hasContent}
          leftIcon={<Send className="h-4 w-4" />}
          onClick={handleSend}
        >
          Send
        </IndulgeButton>
      </div>
    </div>
  );
}
