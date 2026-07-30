import Link from "next/link";
import {
  Check,
  X,
  Minus,
  ArrowDown,
  ArrowUp,
  Phone,
  Mail,
  MapPin,
  User,
  Building2,
} from "lucide-react";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { VendorProfile } from "@/lib/types/database";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Tick (good) / cross (poor) / dash (no data). */
function Mark({ state }: { state: boolean | null }) {
  if (state === null) return <Minus className="h-5 w-5 text-neutral-300" />;
  return state ? (
    <Check className="h-5 w-5 text-emerald-600" strokeWidth={2.5} />
  ) : (
    <X className="h-5 w-5 text-rose-500" strokeWidth={2.5} />
  );
}

/** Down arrow (favourable) / up arrow (increased) / dash (no data) — for Cost. */
function CostMark({ state }: { state: boolean | null }) {
  if (state === null) return <Minus className="h-5 w-5 text-neutral-300" />;
  return state ? (
    <ArrowDown className="h-5 w-5 text-emerald-600" strokeWidth={2.5} />
  ) : (
    <ArrowUp className="h-5 w-5 text-rose-500" strokeWidth={2.5} />
  );
}

function ContactRow({ icon: Icon, value }: { icon: typeof Phone; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-600">
      <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
      <span className="truncate">{value}</span>
    </div>
  );
}

export function VendorProfileView({ profile }: { profile: VendorProfile }) {
  const { vendor, scorecard, orderCount, invoices } = profile;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 py-2">
      <Link
        href="/concierge/vendors"
        className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800"
      >
        ← Vendors
      </Link>

      {/* Header */}
      <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-5")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{vendor.name}</h1>
              {vendor.company && (
                <p className="flex items-center gap-1.5 text-sm text-neutral-500">
                  <Building2 className="h-3.5 w-3.5" />
                  {vendor.company}
                </p>
              )}
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <ContactRow icon={User} value={vendor.poc} />
              <ContactRow icon={Phone} value={vendor.phone} />
              <ContactRow icon={Mail} value={vendor.email} />
              <ContactRow icon={MapPin} value={vendor.location} />
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Trust</p>
            <p className="text-3xl font-semibold tabular-nums text-neutral-900">
              {vendor.trust_score == null ? "—" : `${vendor.trust_score}%`}
            </p>
          </div>
        </div>
      </div>

      {/* Scorecard */}
      <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "p-5")}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-800">Scorecard</h2>
          <span className="text-xs text-neutral-400">
            {scorecard.feedbackCount} {scorecard.feedbackCount === 1 ? "rating" : "ratings"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-neutral-200 p-3 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Speed</p>
            <div className="mt-2 flex justify-center">
              <Mark state={scorecard.speedGood} />
            </div>
          </div>
          <div className="rounded-lg border border-neutral-200 p-3 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Quality</p>
            <div className="mt-2 flex items-center justify-center gap-1.5">
              <Mark state={scorecard.qualityGood} />
              {scorecard.avgQuality != null && (
                <span className="text-xs text-neutral-500 tabular-nums">{scorecard.avgQuality}/5</span>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-neutral-200 p-3 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Cost</p>
            <div className="mt-2 flex justify-center">
              <CostMark state={scorecard.costDown} />
            </div>
          </div>
        </div>
        {scorecard.feedbackCount === 0 && (
          <p className="mt-3 text-center text-xs text-neutral-400">
            No ratings yet — Genies score vendors when a ticket moves to Invoice Due.
          </p>
        )}
      </div>

      {/* Order history */}
      <div className={cn(surfaceCardVariants({ tone: "luxury", elevation: "sm" }), "overflow-hidden")}>
        <div className="flex items-center justify-between border-b border-[#EFEEEA] px-5 py-3">
          <h2 className="text-sm font-semibold text-neutral-800">Order history</h2>
          <span className="text-xs text-neutral-400">
            {orderCount} {orderCount === 1 ? "order" : "orders"} · last {invoices.length} shown
          </span>
        </div>
        {invoices.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutral-500">No invoices recorded for this vendor yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E5E4DF] text-left text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                  <th className="px-5 py-2.5">Ticket</th>
                  <th className="px-5 py-2.5">Client</th>
                  <th className="px-5 py-2.5">Description</th>
                  <th className="px-5 py-2.5 text-right">Selling price</th>
                  <th className="px-5 py-2.5 text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-[#EFEEEA] last:border-b-0 text-neutral-800">
                    <td className="px-5 py-2.5 font-mono text-xs text-neutral-500">
                      {inv.ref_number != null ? (
                        <Link href={`/concierge/tickets/${inv.ticket_id}`} className="hover:text-brand-gold">
                          #{inv.ref_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-2.5">{inv.client_name}</td>
                    <td className="max-w-65 truncate px-5 py-2.5 text-neutral-600">{inv.description}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{inr.format(inv.selling_price)}</td>
                    <td className="px-5 py-2.5 text-right text-neutral-500">{formatDate(inv.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
