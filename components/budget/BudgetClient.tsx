"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import {
  Plus,
  X,
  CheckCircle2,
  Circle,
  Trash2,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { surfaceCardVariants } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { BudgetTransaction, BudgetDeliverable } from "@/lib/types/database";
import {
  addBudgetTransaction,
  removeBudgetTransaction,
  addBudgetDeliverable,
  toggleBudgetDeliverable,
  removeBudgetDeliverable,
} from "@/lib/actions/budget";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const META_LIMIT = 700000;

// Bar / area charts — a warm sage that sits beautifully on cream without browning out
const CHART_BAR = "#6b8f71";

// Pie segments — five genuinely distinct hues, all muted/earthy, well-separated in hue space
const ACCENT_COLORS = [
  "#5f5348", // warm umber (brand-gold)
  "#6b8f71", // sage green
  "#7a8a9e", // dusty slate-blue
  "#9e7b5e", // terracotta
  "#8a6e9e", // soft mauve
];

// ── HELPERS ───────────────────────────────────────────────────────────────────

function fmtINR(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function fmtUSD(n: number) {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ── PROPS ─────────────────────────────────────────────────────────────────────

export interface BudgetInitialData {
  meta: { transactions: BudgetTransaction[]; deliverables: BudgetDeliverable[] };
  elia: { transactions: BudgetTransaction[]; deliverables: BudgetDeliverable[] };
  zoho: { transactions: BudgetTransaction[]; deliverables: BudgetDeliverable[] };
}

// ── STAT CARD ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, tone, onClick, clickable,
}: {
  label: string; value: string; sub?: string;
  tone?: "success" | "warning" | "danger" | "neutral";
  onClick?: () => void; clickable?: boolean;
}) {
  const toneClass = {
    success: "text-success",
    warning: "text-warning",
    danger:  "text-danger",
    neutral: "text-[#1a1a1a]",
  }[tone ?? "neutral"];

  // Whisper-level tonal fill — pre-attentive signal before reading the number
  const toneBg = {
    success: "bg-success-light border-[#c8dfd1]",
    warning: "bg-warning-light border-[#e8c96a]",
    danger:  "bg-danger-light border-[#e8b5b0]",
    neutral: "bg-white border-[#E5E4DF]",
  }[tone ?? "neutral"];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]",
        toneBg,
        "w-full p-5 text-left transition-all duration-150",
        clickable && "hover:shadow-[0_2px_12px_0_rgb(95_83_72/0.10)] cursor-pointer",
        !clickable && "cursor-default",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9e9e8e]">{label}</p>
      <p className={cn("mt-1.5 text-3xl font-semibold tracking-tight", toneClass)}>{value}</p>
      {sub && <p className="mt-1 text-xs text-[#9e9e8e]">{sub}</p>}
      {clickable && <p className="mt-2 text-[11px] text-brand-gold font-medium">View all transactions →</p>}
    </button>
  );
}

// ── BUDGET BAR ────────────────────────────────────────────────────────────────

function BudgetBar({ spent, total }: { spent: number; total: number }) {
  const pct = Math.min((spent / total) * 100, 100);
  const tone = pct > 90 ? "danger" : pct > 75 ? "warning" : "success";
  const barColor = { danger: "bg-[#c0392b]", warning: "bg-[#c5830a]", success: "bg-[#4a7c59]" }[tone];
  const accentBorder = { danger: "border-l-[#c0392b]", warning: "border-l-[#c5830a]", success: "border-l-[#4a7c59]" }[tone];

  return (
    <div className={cn("space-y-2 border-l-2 pl-4 transition-all", accentBorder)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-brand-gold uppercase tracking-widest">Budget utilisation</span>
        <span className={cn("text-xs font-semibold",
          tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-success")}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-[#E5E4DF] overflow-hidden">
        <motion.div className={cn("h-full rounded-full", barColor)}
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }} />
      </div>
      <div className="flex items-center justify-between text-[11px] text-[#9e9e8e]">
        <span>Spent: {fmtINR(spent)}</span>
        <span>Limit: {fmtINR(total)}</span>
      </div>
    </div>
  );
}

// ── TRANSACTION MODAL ─────────────────────────────────────────────────────────

type TxRow = { id: string; date: string; item: string; amount: number; by?: string | null };

function TransactionModal({
  open, onClose, title, rows, currency, onAdd, onRemove, showBy,
}: {
  open: boolean; onClose: () => void; title: string;
  rows: TxRow[]; currency: "INR" | "USD";
  onAdd: (row: Omit<TxRow, "id">) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  showBy?: boolean;
}) {
  const fmt = currency === "USD" ? fmtUSD : fmtINR;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const [form, setForm] = useState({ date: today, item: "", amount: "", by: "" });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const itemRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setAdding(false); setForm({ date: today, item: "", amount: "", by: "" }); }
  }, [open, today]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function submitAdd() {
    const amt = parseFloat(form.amount.replace(/[^0-9.]/g, ""));
    if (!form.item.trim() || isNaN(amt) || amt <= 0) return;
    setSaving(true);
    await onAdd({ date: form.date || today, item: form.item.trim(), amount: amt, by: showBy ? form.by : undefined });
    setForm({ date: today, item: "", amount: "", by: "" });
    setAdding(false);
    setSaving(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div ref={overlayRef}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={cn(surfaceCardVariants({ tone: "luxury", elevation: "md", overflow: "visible" }),
              "w-full max-w-xl max-h-[85vh] flex flex-col")}>

            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#E5E4DF] px-6 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9e9e8e]">Transaction history</p>
                <h3 className="mt-0.5 text-base font-semibold text-[#1a1a1a]">{title}</h3>
              </div>
              <button onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#9e9e8e] hover:bg-[#F2F2EE] hover:text-[#1a1a1a] transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E5E4DF]">
                    <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9e9e8e]">Date</th>
                    <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9e9e8e]">Item / Account</th>
                    {showBy && <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9e9e8e]">Paid by</th>}
                    <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[#9e9e8e]">Amount</th>
                    <th className="pb-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="group border-b border-[#F2F2EE] last:border-0">
                      <td className="py-2.5 text-[#6b6b6b]">{row.date}</td>
                      <td className="py-2.5 font-medium text-[#1a1a1a]">{row.item}</td>
                      {showBy && <td className="py-2.5 text-[#6b6b6b]">{row.by ?? "—"}</td>}
                      <td className="py-2.5 text-right font-semibold text-[#1a1a1a]">{fmt(row.amount)}</td>
                      <td className="py-2.5 pl-2">
                        <button onClick={() => onRemove(row.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[#9e9e8e] hover:text-danger"
                          aria-label="Remove">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={showBy ? 5 : 4} className="py-8 text-center text-sm text-[#9e9e8e]">No transactions yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Add form */}
            <AnimatePresence>
              {adding && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}
                  className="overflow-hidden border-t border-[#E5E4DF] bg-[#F9F9F6] px-6 py-4">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#9e9e8e]">New purchase</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="mb-1 block text-[11px] text-[#9e9e8e]">Item / Account</label>
                      <input ref={itemRef} autoFocus value={form.item}
                        onChange={(e) => setForm((f) => ({ ...f, item: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && submitAdd()}
                        placeholder="e.g. Supabase"
                        className="w-full rounded-lg border border-[#E5E4DF] bg-white px-3 py-2 text-sm text-[#1a1a1a] placeholder:text-taupe outline-none focus:border-brand-gold/60 transition-colors" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="mb-1 block text-[11px] text-[#9e9e8e]">Amount ({currency})</label>
                      <input value={form.amount}
                        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && submitAdd()}
                        placeholder={currency === "USD" ? "e.g. 25" : "e.g. 3540"}
                        className="w-full rounded-lg border border-[#E5E4DF] bg-white px-3 py-2 text-sm text-[#1a1a1a] placeholder:text-taupe outline-none focus:border-brand-gold/60 transition-colors" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-[#9e9e8e]">Date</label>
                      <input value={form.date}
                        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                        placeholder="e.g. May 21, 2026"
                        className="w-full rounded-lg border border-[#E5E4DF] bg-white px-3 py-2 text-sm text-[#1a1a1a] placeholder:text-taupe outline-none focus:border-brand-gold/60 transition-colors" />
                    </div>
                    {showBy && (
                      <div>
                        <label className="mb-1 block text-[11px] text-[#9e9e8e]">Paid by</label>
                        <input value={form.by}
                          onChange={(e) => setForm((f) => ({ ...f, by: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && submitAdd()}
                          placeholder="e.g. Mastercard"
                          className="w-full rounded-lg border border-[#E5E4DF] bg-white px-3 py-2 text-sm text-[#1a1a1a] placeholder:text-taupe outline-none focus:border-brand-gold/60 transition-colors" />
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={submitAdd} disabled={saving}
                      className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-semibold text-white hover:bg-brand-gold-dark transition-colors disabled:opacity-60">
                      {saving ? "Saving…" : "Add purchase"}
                    </button>
                    <button onClick={() => setAdding(false)}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-[#6b6b6b] hover:bg-[#F2F2EE] transition-colors">
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer */}
            <div className="border-t border-[#E5E4DF] px-6 py-4 flex items-center justify-between bg-[#F9F9F6] rounded-b-2xl">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-widest text-[#9e9e8e]">Total ({rows.length})</span>
                <span className="text-lg font-semibold text-brand-gold">{fmt(total)}</span>
              </div>
              {!adding && (
                <button
                  onClick={() => { setAdding(true); setTimeout(() => itemRef.current?.focus(), 80); }}
                  className="flex items-center gap-1.5 rounded-lg border border-[#E5E4DF] bg-white px-3 py-1.5 text-xs font-semibold text-brand-gold hover:border-brand-gold/40 hover:bg-[#F9F9F6] transition-colors">
                  <Plus className="h-3.5 w-3.5" />
                  Add purchase
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── DELIVERABLE LIST ──────────────────────────────────────────────────────────

function DeliverableList({
  deliverables,
  onToggle,
  onRemove,
  onAdd,
}: {
  deliverables: BudgetDeliverable[];
  onToggle: (id: string, done: boolean) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onAdd: (text: string) => Promise<void>;
}) {
  const [newText, setNewText] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function addItem() {
    const text = newText.trim();
    if (!text) return;
    setSaving(true);
    await onAdd(text);
    setNewText("");
    setSaving(false);
    inputRef.current?.focus();
  }

  const done = deliverables.filter((d) => d.done);
  const pending = deliverables.filter((d) => !d.done);

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9e9e8e] px-1">In progress</p>
          {pending.map((d) => (
            <DeliverableRow key={d.id} d={d} onToggle={onToggle} onRemove={onRemove} />
          ))}
        </div>
      )}
      {done.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9e9e8e] px-1">Completed</p>
          {done.map((d) => (
            <DeliverableRow key={d.id} d={d} onToggle={onToggle} onRemove={onRemove} />
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <div className="flex-1 flex items-center gap-2 rounded-xl border border-[#E5E4DF] bg-[#F9F9F6] px-3 py-2 focus-within:border-brand-gold/50 transition-colors">
          <Plus className="h-3.5 w-3.5 shrink-0 text-[#9e9e8e]" />
          <input ref={inputRef} value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            placeholder="Add a deliverable…"
            className="flex-1 bg-transparent text-sm text-[#1a1a1a] placeholder:text-taupe outline-none" />
        </div>
        <button onClick={addItem} disabled={saving}
          className="h-9 px-3 rounded-xl bg-brand-gold text-white text-xs font-semibold hover:bg-brand-gold-dark transition-colors disabled:opacity-60">
          {saving ? "…" : "Add"}
        </button>
      </div>
    </div>
  );
}

function DeliverableRow({
  d, onToggle, onRemove,
}: {
  d: BudgetDeliverable;
  onToggle: (id: string, done: boolean) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <motion.div layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
      className={cn("group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors",
        d.done ? "bg-success-light border border-[#c8dfd1]" : "bg-white border border-[#E5E4DF]",
        pending && "opacity-60")}>
      <button onClick={() => startTransition(() => { void onToggle(d.id, !d.done); })}
        className="mt-0.5 shrink-0 transition-colors"
        aria-label={d.done ? "Mark incomplete" : "Mark complete"}>
        {d.done
          ? <CheckCircle2 className="h-4 w-4 text-success" />
          : <Circle className="h-4 w-4 text-taupe group-hover:text-brand-gold transition-colors" />}
      </button>
      <span className={cn("flex-1 text-sm leading-snug",
        d.done ? "text-[#9e9e8e] line-through" : "text-[#1a1a1a]")}>
        {d.text}
      </span>
      <button onClick={() => startTransition(() => { void onRemove(d.id); })}
        className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-danger hover:text-[#9b2c2c]"
        aria-label="Remove">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

// ── TABS ──────────────────────────────────────────────────────────────────────

type TabId = "meta" | "elia" | "zoho";
const TABS: { id: TabId; label: string }[] = [
  { id: "meta", label: "Performance Marketing" },
  { id: "elia", label: "Elia (Tech)" },
  { id: "zoho", label: "Zoho (CRM)" },
];

// ── META TAB ──────────────────────────────────────────────────────────────────

function MetaTab({ initial }: { initial: { transactions: BudgetTransaction[]; deliverables: BudgetDeliverable[] } }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [txs, setTxs] = useState<BudgetTransaction[]>(initial.transactions);
  const [deliverables, setDeliverables] = useState<BudgetDeliverable[]>(initial.deliverables);

  const total = txs.reduce((s, t) => s + Number(t.amount), 0);
  const left  = META_LIMIT - total;

  const byAccount: Record<string, number> = {};
  for (const t of txs) {
    const key = t.item === "dubai" ? "Dubai" : t.item;
    byAccount[key] = (byAccount[key] ?? 0) + Number(t.amount);
  }
  const accountPieData = Object.entries(byAccount).map(([name, value]) => ({ name, value }));

  const dailyMap: Record<string, number> = {};
  for (const t of txs) { dailyMap[t.date] = (dailyMap[t.date] ?? 0) + Number(t.amount); }
  const dailyData = Object.entries(dailyMap).map(([date, amount]) => ({ date, amount }));

  let cum = 0;
  const cumulativeData = dailyData.map(({ date, amount }) => { cum += amount; return { date, cumulative: cum }; });

  const done = deliverables.filter((d) => d.done).length;

  const modalRows: TxRow[] = txs.map((t) => ({ id: t.id, date: t.date, item: t.item, amount: Number(t.amount), by: t.paid_by }));

  async function handleAddTx(row: Omit<TxRow, "id">) {
    const tempId = `tmp-${Date.now()}`;
    const optimistic: BudgetTransaction = {
      id: tempId, domain: "meta", date: row.date, item: row.item,
      amount: row.amount, currency: "INR", paid_by: row.by ?? null,
      created_by: "", created_at: new Date().toISOString(),
    };
    setTxs((p) => [...p, optimistic]);
    const res = await addBudgetTransaction({ domain: "meta", date: row.date, item: row.item, amount: row.amount, currency: "INR", paid_by: row.by ?? null });
    if (res.success && res.data) {
      setTxs((p) => p.map((t) => t.id === tempId ? res.data! : t));
    } else {
      setTxs((p) => p.filter((t) => t.id !== tempId));
      toast.error(res.error ?? "Could not save transaction.");
    }
  }

  async function handleRemoveTx(id: string) {
    const backup = txs.find((t) => t.id === id);
    setTxs((p) => p.filter((t) => t.id !== id));
    const res = await removeBudgetTransaction(id);
    if (!res.success) { if (backup) setTxs((p) => [...p, backup]); toast.error(res.error ?? "Could not remove."); }
  }

  async function handleToggle(id: string, done: boolean) {
    setDeliverables((p) => p.map((d) => d.id === id ? { ...d, done } : d));
    const res = await toggleBudgetDeliverable(id, done);
    if (!res.success) { setDeliverables((p) => p.map((d) => d.id === id ? { ...d, done: !done } : d)); toast.error(res.error ?? "Could not update."); }
  }

  async function handleRemoveDl(id: string) {
    const backup = deliverables.find((d) => d.id === id);
    setDeliverables((p) => p.filter((d) => d.id !== id));
    const res = await removeBudgetDeliverable(id);
    if (!res.success) { if (backup) setDeliverables((p) => [...p, backup]); toast.error(res.error ?? "Could not remove."); }
  }

  async function handleAddDl(text: string) {
    const tempId = `tmp-${Date.now()}`;
    const optimistic: BudgetDeliverable = { id: tempId, domain: "meta", text, done: false, sort_order: 999, created_by: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setDeliverables((p) => [...p, optimistic]);
    const res = await addBudgetDeliverable({ domain: "meta", text });
    if (res.success && res.data) {
      setDeliverables((p) => p.map((d) => d.id === tempId ? res.data! : d));
    } else {
      setDeliverables((p) => p.filter((d) => d.id !== tempId));
      toast.error(res.error ?? "Could not save.");
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Spent (May)" value={fmtINR(total)}
          sub={`${txs.length} transactions across ${Object.keys(byAccount).length} accounts`}
          tone="neutral"
          onClick={() => setModalOpen(true)} clickable />
        <StatCard label="Budget Remaining" value={fmtINR(left)}
          sub={`${((left / META_LIMIT) * 100).toFixed(1)}% of ₹7,00,000 left`}
          tone={left < 50000 ? "danger" : left < 150000 ? "warning" : "success"} />
        <StatCard label="Deliverables" value={`${done} / ${deliverables.length}`}
          sub={`${deliverables.length - done} items pending`}
          tone={done === deliverables.length ? "success" : "neutral"} />
      </div>

      <div className={cn(surfaceCardVariants({ tone: "stone" }), "p-5")}>
        <BudgetBar spent={total} total={META_LIMIT} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={cn(surfaceCardVariants({ tone: "luxury" }), "p-5 space-y-3")}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9e9e8e]">Cumulative spend</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={cumulativeData}>
              <defs>
                <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_BAR} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={CHART_BAR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E4DF" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9e9e8e" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9e9e8e" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E4DF", fontSize: 12 }} formatter={(v) => [fmtINR(Number(v ?? 0)), "Cumulative"]} />
              <Area type="monotone" dataKey="cumulative" stroke={CHART_BAR} strokeWidth={2} fill="url(#cumGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className={cn(surfaceCardVariants({ tone: "luxury" }), "p-5 space-y-3")}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9e9e8e]">Spend by ad account</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={accountPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                {accountPieData.map((_, i) => <Cell key={i} fill={ACCENT_COLORS[i % ACCENT_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E4DF", fontSize: 12 }} formatter={(v) => [fmtINR(Number(v ?? 0))]} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#6b6b6b" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={cn(surfaceCardVariants({ tone: "luxury" }), "p-5 space-y-3")}>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9e9e8e]">Daily ad spend</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E4DF" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9e9e8e" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9e9e8e" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E4DF", fontSize: 12 }} formatter={(v) => [fmtINR(Number(v ?? 0)), "Spend"]} />
            <Bar dataKey="amount" fill={CHART_BAR} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={cn(surfaceCardVariants({ tone: "luxury" }), "p-5 space-y-4")}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#1a1a1a]">Deliverables</p>
          <span className="rounded-full bg-[#F2F2EE] px-2.5 py-0.5 text-[11px] font-semibold text-brand-gold">{done}/{deliverables.length} done</span>
        </div>
        <DeliverableList deliverables={deliverables} onToggle={handleToggle} onRemove={handleRemoveDl} onAdd={handleAddDl} />
      </div>

      <TransactionModal open={modalOpen} onClose={() => setModalOpen(false)}
        title="Performance Marketing — Transactions" rows={modalRows} currency="INR" showBy
        onAdd={handleAddTx} onRemove={handleRemoveTx} />
    </motion.div>
  );
}

// ── ELIA TAB ──────────────────────────────────────────────────────────────────

function EliaTab({ initial }: { initial: { transactions: BudgetTransaction[]; deliverables: BudgetDeliverable[] } }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [txs, setTxs] = useState<BudgetTransaction[]>(initial.transactions);
  const [deliverables, setDeliverables] = useState<BudgetDeliverable[]>(initial.deliverables);

  const total = txs.reduce((s, t) => s + Number(t.amount), 0);
  const byItem: Record<string, number> = {};
  for (const t of txs) { byItem[t.item] = (byItem[t.item] ?? 0) + Number(t.amount); }
  const itemData = Object.entries(byItem).map(([name, value]) => ({ name, value }));
  const largestEntry = [...itemData].sort((a, b) => b.value - a.value)[0];
  const done = deliverables.filter((d) => d.done).length;
  const modalRows: TxRow[] = txs.map((t) => ({ id: t.id, date: t.date, item: t.item, amount: Number(t.amount) }));

  async function handleAddTx(row: Omit<TxRow, "id">) {
    const tempId = `tmp-${Date.now()}`;
    const optimistic: BudgetTransaction = { id: tempId, domain: "elia", date: row.date, item: row.item, amount: row.amount, currency: "USD", paid_by: null, created_by: "", created_at: new Date().toISOString() };
    setTxs((p) => [...p, optimistic]);
    const res = await addBudgetTransaction({ domain: "elia", date: row.date, item: row.item, amount: row.amount, currency: "USD" });
    if (res.success && res.data) { setTxs((p) => p.map((t) => t.id === tempId ? res.data! : t)); }
    else { setTxs((p) => p.filter((t) => t.id !== tempId)); toast.error(res.error ?? "Could not save."); }
  }
  async function handleRemoveTx(id: string) {
    const backup = txs.find((t) => t.id === id);
    setTxs((p) => p.filter((t) => t.id !== id));
    const res = await removeBudgetTransaction(id);
    if (!res.success) { if (backup) setTxs((p) => [...p, backup]); toast.error(res.error ?? "Could not remove."); }
  }
  async function handleToggle(id: string, done: boolean) {
    setDeliverables((p) => p.map((d) => d.id === id ? { ...d, done } : d));
    const res = await toggleBudgetDeliverable(id, done);
    if (!res.success) { setDeliverables((p) => p.map((d) => d.id === id ? { ...d, done: !done } : d)); toast.error(res.error ?? "Could not update."); }
  }
  async function handleRemoveDl(id: string) {
    const backup = deliverables.find((d) => d.id === id);
    setDeliverables((p) => p.filter((d) => d.id !== id));
    const res = await removeBudgetDeliverable(id);
    if (!res.success) { if (backup) setDeliverables((p) => [...p, backup]); toast.error(res.error ?? "Could not remove."); }
  }
  async function handleAddDl(text: string) {
    const tempId = `tmp-${Date.now()}`;
    const optimistic: BudgetDeliverable = { id: tempId, domain: "elia", text, done: false, sort_order: 999, created_by: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setDeliverables((p) => [...p, optimistic]);
    const res = await addBudgetDeliverable({ domain: "elia", text });
    if (res.success && res.data) { setDeliverables((p) => p.map((d) => d.id === tempId ? res.data! : d)); }
    else { setDeliverables((p) => p.filter((d) => d.id !== tempId)); toast.error(res.error ?? "Could not save."); }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Spent" value={fmtUSD(total)} sub={`${txs.length} transactions`}
          tone="neutral" onClick={() => setModalOpen(true)} clickable />
        <StatCard label="Largest Item" value={largestEntry?.name ?? "—"} sub={largestEntry ? fmtUSD(largestEntry.value) : ""} />
        <StatCard label="Deliverables" value={`${done} / ${deliverables.length}`}
          sub={`${deliverables.length - done} items pending`} tone={done === deliverables.length ? "success" : "neutral"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={cn(surfaceCardVariants({ tone: "luxury" }), "p-5 space-y-3")}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9e9e8e]">Spend by tool</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={itemData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E4DF" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#9e9e8e" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6b6b6b" }} axisLine={false} tickLine={false} width={80} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E4DF", fontSize: 12 }} formatter={(v) => [fmtUSD(Number(v ?? 0))]} />
              <Bar dataKey="value" fill={CHART_BAR} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className={cn(surfaceCardVariants({ tone: "luxury" }), "p-5 space-y-3")}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9e9e8e]">Distribution</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={itemData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                {itemData.map((_, i) => <Cell key={i} fill={ACCENT_COLORS[i % ACCENT_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E4DF", fontSize: 12 }} formatter={(v) => [fmtUSD(Number(v ?? 0))]} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#6b6b6b" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={cn(surfaceCardVariants({ tone: "luxury" }), "p-5 space-y-4")}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#1a1a1a]">Deliverables</p>
          <span className="rounded-full bg-[#F2F2EE] px-2.5 py-0.5 text-[11px] font-semibold text-brand-gold">{done}/{deliverables.length} done</span>
        </div>
        <DeliverableList deliverables={deliverables} onToggle={handleToggle} onRemove={handleRemoveDl} onAdd={handleAddDl} />
      </div>

      <TransactionModal open={modalOpen} onClose={() => setModalOpen(false)}
        title="Elia (Tech) — Transactions" rows={modalRows} currency="USD"
        onAdd={handleAddTx} onRemove={handleRemoveTx} />
    </motion.div>
  );
}

// ── ZOHO TAB ──────────────────────────────────────────────────────────────────

function ZohoTab({ initial }: { initial: { transactions: BudgetTransaction[]; deliverables: BudgetDeliverable[] } }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [txs, setTxs] = useState<BudgetTransaction[]>(initial.transactions);
  const [deliverables, setDeliverables] = useState<BudgetDeliverable[]>(initial.deliverables);

  const total = txs.reduce((s, t) => s + Number(t.amount), 0);
  const byItem: Record<string, number> = {};
  for (const t of txs) { byItem[t.item] = (byItem[t.item] ?? 0) + Number(t.amount); }
  const itemData = Object.entries(byItem).map(([name, value]) => ({ name, value }));
  const largestEntry = [...itemData].sort((a, b) => b.value - a.value)[0];
  const done = deliverables.filter((d) => d.done).length;
  const modalRows: TxRow[] = txs.map((t) => ({ id: t.id, date: t.date, item: t.item, amount: Number(t.amount) }));

  async function handleAddTx(row: Omit<TxRow, "id">) {
    const tempId = `tmp-${Date.now()}`;
    const optimistic: BudgetTransaction = { id: tempId, domain: "zoho", date: row.date, item: row.item, amount: row.amount, currency: "INR", paid_by: null, created_by: "", created_at: new Date().toISOString() };
    setTxs((p) => [...p, optimistic]);
    const res = await addBudgetTransaction({ domain: "zoho", date: row.date, item: row.item, amount: row.amount, currency: "INR" });
    if (res.success && res.data) { setTxs((p) => p.map((t) => t.id === tempId ? res.data! : t)); }
    else { setTxs((p) => p.filter((t) => t.id !== tempId)); toast.error(res.error ?? "Could not save."); }
  }
  async function handleRemoveTx(id: string) {
    const backup = txs.find((t) => t.id === id);
    setTxs((p) => p.filter((t) => t.id !== id));
    const res = await removeBudgetTransaction(id);
    if (!res.success) { if (backup) setTxs((p) => [...p, backup]); toast.error(res.error ?? "Could not remove."); }
  }
  async function handleToggle(id: string, done: boolean) {
    setDeliverables((p) => p.map((d) => d.id === id ? { ...d, done } : d));
    const res = await toggleBudgetDeliverable(id, done);
    if (!res.success) { setDeliverables((p) => p.map((d) => d.id === id ? { ...d, done: !done } : d)); toast.error(res.error ?? "Could not update."); }
  }
  async function handleRemoveDl(id: string) {
    const backup = deliverables.find((d) => d.id === id);
    setDeliverables((p) => p.filter((d) => d.id !== id));
    const res = await removeBudgetDeliverable(id);
    if (!res.success) { if (backup) setDeliverables((p) => [...p, backup]); toast.error(res.error ?? "Could not remove."); }
  }
  async function handleAddDl(text: string) {
    const tempId = `tmp-${Date.now()}`;
    const optimistic: BudgetDeliverable = { id: tempId, domain: "zoho", text, done: false, sort_order: 999, created_by: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setDeliverables((p) => [...p, optimistic]);
    const res = await addBudgetDeliverable({ domain: "zoho", text });
    if (res.success && res.data) { setDeliverables((p) => p.map((d) => d.id === tempId ? res.data! : d)); }
    else { setDeliverables((p) => p.filter((d) => d.id !== tempId)); toast.error(res.error ?? "Could not save."); }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Spent" value={fmtINR(total)} sub={`${txs.length} transactions`}
          tone="neutral" onClick={() => setModalOpen(true)} clickable />
        <StatCard label="Largest Item" value={largestEntry?.name ?? "—"} sub={largestEntry ? fmtINR(largestEntry.value) : ""} />
        <StatCard label="Deliverables" value={`${done} / ${deliverables.length}`}
          sub={`${deliverables.length - done} items pending`} tone={done === deliverables.length ? "success" : "neutral"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={cn(surfaceCardVariants({ tone: "luxury" }), "p-5 space-y-3")}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9e9e8e]">Spend by item</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={itemData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E4DF" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#9e9e8e" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6b6b6b" }} axisLine={false} tickLine={false} width={100} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E4DF", fontSize: 12 }} formatter={(v) => [fmtINR(Number(v ?? 0))]} />
              <Bar dataKey="value" fill={CHART_BAR} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className={cn(surfaceCardVariants({ tone: "luxury" }), "p-5 space-y-3")}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9e9e8e]">Distribution</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={itemData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                {itemData.map((_, i) => <Cell key={i} fill={ACCENT_COLORS[i % ACCENT_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E4DF", fontSize: 12 }} formatter={(v) => [fmtINR(Number(v ?? 0))]} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#6b6b6b" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={cn(surfaceCardVariants({ tone: "luxury" }), "p-5 space-y-4")}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#1a1a1a]">Deliverables</p>
          <span className="rounded-full bg-[#F2F2EE] px-2.5 py-0.5 text-[11px] font-semibold text-brand-gold">{done}/{deliverables.length} done</span>
        </div>
        <DeliverableList deliverables={deliverables} onToggle={handleToggle} onRemove={handleRemoveDl} onAdd={handleAddDl} />
      </div>

      <TransactionModal open={modalOpen} onClose={() => setModalOpen(false)}
        title="Zoho (CRM) — Transactions" rows={modalRows} currency="INR"
        onAdd={handleAddTx} onRemove={handleRemoveTx} />
    </motion.div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────

export function BudgetClient({ initialData }: { initialData: BudgetInitialData }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs
        defaultValue="meta"
        animatedContent={false}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-[#E5E4DF] bg-white px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-playfair text-2xl font-semibold tracking-tight text-[#1a1a1a]">
                Budget
              </h1>
              <p className="mt-1 text-sm text-[#6b6b6b]">
                Domain spend, budget utilisation, and deliverable tracking
              </p>
            </div>
            <span className="rounded-full bg-brand-gold px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white">
              May 2026
            </span>
          </div>
          <TabsList className="mt-4">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto bg-[#F9F9F6] px-6 py-6">
          <div className="mx-auto max-w-4xl">
            <TabsContent value="meta" className="mt-0">
              <MetaTab initial={initialData.meta} />
            </TabsContent>
            <TabsContent value="elia" className="mt-0">
              <EliaTab initial={initialData.elia} />
            </TabsContent>
            <TabsContent value="zoho" className="mt-0">
              <ZohoTab initial={initialData.zoho} />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
