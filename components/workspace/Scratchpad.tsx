"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, FolderClosed, FolderOpen, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  saveScratchpadNote,
  getScratchpadNotes,
  type ScratchpadNote,
} from "@/lib/actions/scratchpad";
import { cn } from "@/lib/utils";

// ─── Palette (soft sage / moss pastel) ────────────────────────────────────────
const P = {
  bg:          "#EEF6EA",  // widget surface
  bgDeep:      "#E4F0DF",  // note card fill
  bgDrawer:    "#F2F8EF",  // archive drawer surface
  border:      "#C0D4B8",  // main border
  borderLight: "#D4E8CC",  // inner dividers
  textDeep:    "#2A4028",  // primary text
  textMid:     "#4A6A44",  // body text in cards
  textMuted:   "#7A9A72",  // labels, icons default
  textFaint:   "#9AB896",  // timestamps, char count
  textGhost:   "#B0CCA8",  // placeholder
  iconHover:   "#4A6A44",
  iconHoverBg: "#D4E8CC66",
  caret:       "#6B8F5A",
  success:     "#4A7C59",
  errorText:   "#C0392B",
  folderGlow:  "#6B8F5A",
} as const;

// ─── Noise texture (data URI — zero deps) ─────────────────────────────────────
const NOISE_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.022'/%3E%3C/svg%3E")`;

// ─── Bento Note Card ──────────────────────────────────────────────────────────
// Fixed-size tile for the horizontal archive rail.
// Long notes are clipped at 4 lines — a soft truncation that invites curiosity.

function NoteCard({ note, index }: { note: ScratchpadNote; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="shrink-0 flex flex-col rounded-2xl border p-3.5"
      style={{
        width:           "176px",
        height:          "148px",
        backgroundColor: P.bgDeep,
        borderColor:     P.border,
        boxShadow:       "0 1px 4px rgba(60,100,50,0.06)",
      }}
    >
      {/* Note body — clipped gracefully at 4 lines */}
      <p
        className="flex-1 text-[11.5px] leading-[1.7] overflow-hidden"
        style={{
          color:              P.textMid,
          display:            "-webkit-box",
          WebkitLineClamp:    4,
          WebkitBoxOrient:    "vertical",
          overflow:           "hidden",
          fontFamily:         "var(--font-playfair), 'Playfair Display', Georgia, serif",
        }}
      >
        {note.body}
      </p>

      {/* Timestamp */}
      <p
        className="mt-2 shrink-0 text-[9.5px] tabular-nums"
        style={{ color: P.textFaint }}
      >
        {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
      </p>
    </motion.div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function Scratchpad() {
  const [text,        setText]        = useState("");
  const [tearing,     setTearing]     = useState(false);
  const [folderCaught,setFolderCaught]= useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [notes,       setNotes]       = useState<ScratchpadNote[]>([]);
  const [loadingNotes,setLoadingNotes]= useState(false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [justSaved,   setJustSaved]   = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea to fit content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const fetchNotes = useCallback(async () => {
    setLoadingNotes(true);
    const data = await getScratchpadNotes();
    setNotes(data);
    setLoadingNotes(false);
  }, []);

  async function handleSave() {
    if (!text.trim() || tearing || saving) return;

    setSaving(true);
    setError(null);

    // Optimistic: start the tear animation immediately
    setTearing(true);

    // Folder sparkle
    setFolderCaught(true);
    const folderReset = setTimeout(() => setFolderCaught(false), 850);

    const result = await saveScratchpadNote(text);

    if (!result.success) {
      clearTimeout(folderReset);
      setTearing(false);
      setFolderCaught(false);
      setSaving(false);
      setError(result.error ?? "Could not file note.");
      return;
    }

    // Let the 0.6s animation play out, then reset cleanly
    setTimeout(() => {
      setText("");
      setTearing(false);
      setSaving(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2200);
      if (archiveOpen) fetchNotes();
    }, 640);
  }

  async function handleToggleArchive() {
    const next = !archiveOpen;
    if (next) await fetchNotes();
    setArchiveOpen(next);
  }

  const canSave = text.trim().length > 0 && !tearing && !saving;

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: `1px solid ${P.borderLight}` }}
      >
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.28em]"
          style={{ color: P.textMuted }}
        >
          Clear Mind
        </p>

        <div className="flex items-center gap-1">
          {/* ── Sparkles: Save / Tear ── */}
          <motion.button
            onClick={handleSave}
            disabled={!canSave}
            title="File this thought"
            className="p-1.5 rounded-lg transition-colors"
            style={{
              color:  canSave ? P.textMuted : `${P.textFaint}80`,
              cursor: canSave ? "pointer" : "not-allowed",
            }}
            onMouseEnter={(e) => {
              if (canSave) (e.currentTarget as HTMLElement).style.backgroundColor = P.iconHoverBg;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            }}
            whileHover={canSave ? { scale: 1.05 } : undefined}
            whileTap={canSave  ? { scale: 0.95 } : undefined}
          >
            <Sparkles className="w-3.5 h-3.5" />
          </motion.button>

          {/* ── Folder: Archive toggle — pulses when note is caught ── */}
          <motion.button
            onClick={handleToggleArchive}
            title={archiveOpen ? "Close archive" : "View filed thoughts"}
            className="relative p-1.5 rounded-lg transition-colors overflow-visible"
            style={{ color: P.textMuted, willChange: "transform" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = P.iconHoverBg;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            }}
            animate={folderCaught ? { scale: [1, 1.35, 1.1, 1] } : { scale: 1 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
          >
            {/* GPU-compositable glow ring — animates opacity only */}
            <motion.span
              className="absolute inset-0 rounded-lg pointer-events-none"
              style={{ backgroundColor: `${P.folderGlow}30` }}
              animate={{ opacity: folderCaught ? [0, 1, 0.6, 0] : 0 }}
              transition={{ duration: 0.75, ease: "easeOut" }}
            />
            {archiveOpen
              ? <FolderOpen  className="w-3.5 h-3.5" />
              : <FolderClosed className="w-3.5 h-3.5" />
            }
          </motion.button>
        </div>
      </div>

      {/* ── Archive Drawer — horizontal bento note rail ──────────── */}
      <AnimatePresence initial={false}>
        {archiveOpen && (
          <motion.div
            key="archive"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 184, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.34, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
            style={{ borderBottom: `1px solid ${P.borderLight}`, backgroundColor: P.bgDrawer }}
          >
            {/* Loading state */}
            {loadingNotes && (
              <div className="flex items-center justify-center h-full">
                <p className="text-[11px] italic" style={{ color: P.textFaint }}>
                  Loading…
                </p>
              </div>
            )}

            {/* Empty state */}
            {!loadingNotes && notes.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <p className="text-[11px] italic" style={{ color: P.textFaint }}>
                  Nothing filed yet — write something beautiful.
                </p>
              </div>
            )}

            {/* Horizontal bento grid — scroll right to explore the past */}
            {!loadingNotes && notes.length > 0 && (
              <div
                className="flex gap-2.5 px-4 py-4 h-full overflow-x-auto"
                style={{
                  scrollbarWidth:  "thin",
                  scrollbarColor:  `${P.border} transparent`,
                  alignItems:      "flex-start",
                }}
              >
                {notes.map((note, i) => (
                  <NoteCard key={note.id} note={note} index={i} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Writing Area ─────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden flex-1"
        style={{ backgroundImage: NOISE_BG, backgroundSize: "200px 200px" }}
      >
        {/* Tear + fall wraps the entire writing pad */}
        <motion.div
          layout
          animate={
            tearing
              ? {
                  rotateZ: [0, -1.5, 3, 6],
                  y:       [0, -6, 8, 48],
                  opacity: [1, 0.95, 0.7, 0],
                  scale:   [1, 0.98, 0.94, 0.82],
                }
              : { rotateZ: 0, y: 0, opacity: 1, scale: 1 }
          }
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="origin-top"
          style={{ willChange: "transform, opacity" }}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            placeholder="Empty your mind…"
            className={cn(
              "scratchpad-textarea",
              "w-full bg-transparent border-none outline-none resize-none",
              "text-[13.5px] leading-[1.85]",
              "px-5 pt-4 pb-2",
              "[&::-webkit-scrollbar]:hidden",
            )}
            style={{
              color:      P.textDeep,
              caretColor: P.caret,
              fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
              minHeight:  "120px",
              overflow:   "hidden",
            }}
            spellCheck={false}
          />

          {/* ── Status / char count bar ────────────────── */}
          <div className="flex items-center justify-between px-5 pb-4 pt-1 min-h-[28px]">
            <AnimatePresence mode="wait">
              {error && (
                <motion.p
                  key="err"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-[10px]"
                  style={{ color: P.errorText }}
                >
                  {error}
                </motion.p>
              )}
              {!error && justSaved && (
                <motion.p
                  key="ok"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="text-[10px] flex items-center gap-1"
                  style={{ color: P.success }}
                >
                  <Check className="w-3 h-3" />
                  Filed
                </motion.p>
              )}
              {!error && !justSaved && <span key="empty" />}
            </AnimatePresence>

            {text.length > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] tabular-nums"
                style={{ color: P.textFaint }}
              >
                {text.length}
              </motion.p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
