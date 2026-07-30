/**
 * SLA policy matching (pure). NOT a "use server" module.
 *
 * Given all active policies, pick the most specific match for a ticket, in order
 * (build spec §3.10 / §5):
 *   subcategory + priority → subcategory (all) → category + priority →
 *   category (all) → default + priority → default (all)
 */
import type { SlaPolicy, ConciergeTicketPriority } from "@/lib/types/database";

export function matchSlaPolicy(
  policies: SlaPolicy[],
  categoryId: string,
  subcategoryId: string | null,
  priority: ConciergeTicketPriority,
): SlaPolicy | null {
  const active = policies.filter((p) => p.is_active);
  const candidateCats = [subcategoryId, categoryId].filter((c): c is string => !!c);

  for (const catId of candidateCats) {
    const exact = active.find((p) => p.category_id === catId && p.priority === priority);
    if (exact) return exact;
    const anyPriority = active.find((p) => p.category_id === catId && p.priority == null);
    if (anyPriority) return anyPriority;
  }

  const defExact = active.find((p) => p.is_default && p.priority === priority);
  if (defExact) return defExact;
  const defAny = active.find((p) => p.is_default && p.priority == null);
  if (defAny) return defAny;

  return null;
}
