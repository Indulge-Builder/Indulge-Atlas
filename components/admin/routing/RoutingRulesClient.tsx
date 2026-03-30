"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { surfaceCardVariants } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { LeadRoutingRuleWithAgent, Profile } from "@/lib/types/database";
import { DOMAIN_DISPLAY_CONFIG } from "@/lib/types/database";
import { CreateRuleModal } from "@/components/admin/routing/CreateRuleModal";
import {
  deleteRoutingRule,
  toggleRuleStatus,
} from "@/lib/actions/routing-rules";
import { toast } from "sonner";

function operatorLabel(op: string): string {
  if (op === "starts_with") return "starts with";
  return op.replace(/_/g, " ");
}

function formatRuleSummary(rule: LeadRoutingRuleWithAgent): string {
  const op = operatorLabel(rule.condition_operator);
  const left = `If ${rule.condition_field} ${op} '${rule.condition_value}'`;
  if (rule.action_type === "assign_to_agent") {
    const name = rule.target_profile?.full_name ?? "Unknown agent";
    return `${left} → Assign to ${name}`;
  }
  const pool = rule.action_target_domain ?? "";
  return `${left} → Assign to Domain Pool: ${pool}`;
}

interface RoutingRulesClientProps {
  initialRules: LeadRoutingRuleWithAgent[];
  agents: Pick<Profile, "id" | "full_name" | "email" | "domain">[];
}

export function RoutingRulesClient({
  initialRules,
  agents,
}: RoutingRulesClientProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function onToggle(id: string, next: boolean) {
    setPendingId(id);
    const res = await toggleRuleStatus(id, next);
    setPendingId(null);
    if (!res.success) {
      toast.error(res.error ?? "Could not update rule");
      return;
    }
    toast.success(next ? "Rule activated" : "Rule paused");
    router.refresh();
  }

  async function onDelete(id: string) {
    setPendingId(id);
    const res = await deleteRoutingRule(id);
    setPendingId(null);
    if (!res.success) {
      toast.error(res.error ?? "Could not delete rule");
      return;
    }
    toast.success("Rule removed");
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4 mb-8">
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-11 px-6 rounded-xl border-[#E5E4DF] bg-white text-[#1A1A1A]",
            "shadow-[0_1px_4px_0_rgb(0_0_0/0.04)] hover:bg-[#FAFAF8]",
          )}
          onClick={() => setModalOpen(true)}
        >
          Add rule
        </Button>
      </div>

      <div
        className={cn(
          surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
          "overflow-hidden",
        )}
      >
        {initialRules.length === 0 ? (
          <div className="p-12 text-center">
            <p
              className="text-sm text-[#6B6B6B]"
              style={{ fontFamily: "var(--font-playfair), serif" }}
            >
              No routing rules yet
            </p>
            <p className="text-xs text-[#9A9A94] mt-2 max-w-md mx-auto">
              Add a rule to translate incoming lead attributes into automatic assignments.
              Webhook evaluation will be enabled in a later release.
            </p>
          </div>
        ) : (
          <ul>
            {initialRules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-4 p-4 border-b border-stone-100 last:border-b-0"
              >
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <span className="mt-0.5 inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-[#F4F3EE] text-xs font-semibold text-[#5C5A54] tabular-nums shrink-0">
                    {rule.priority}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium text-[#1A1A1A] truncate">
                      {rule.rule_name}
                    </p>
                    <p className="text-xs text-stone-500 italic leading-relaxed wrap-break-word">
                      {formatRuleSummary(rule)}
                    </p>
                    {rule.action_type === "assign_to_agent" &&
                      rule.target_profile?.email && (
                        <p className="text-[11px] text-[#B5A99A]">
                          {rule.target_profile.email}
                        </p>
                      )}
                    {rule.action_type === "route_to_domain_pool" &&
                      rule.action_target_domain && (
                        <p className="text-[11px] text-[#B5A99A]">
                          {DOMAIN_DISPLAY_CONFIG[rule.action_target_domain]?.label ??
                            rule.action_target_domain}
                        </p>
                      )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-widest text-[#B5A99A] hidden sm:inline">
                      {rule.is_active ? "Active" : "Off"}
                    </span>
                    <Switch
                      checked={rule.is_active}
                      disabled={pendingId === rule.id}
                      onCheckedChange={(v) => onToggle(rule.id, v)}
                      aria-label={rule.is_active ? "Deactivate rule" : "Activate rule"}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-[#9A9A94] hover:text-[#C0392B] hover:bg-red-50/80"
                    disabled={pendingId === rule.id}
                    onClick={() => onDelete(rule.id)}
                    aria-label="Delete rule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateRuleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => router.refresh()}
        agents={agents}
      />
    </>
  );
}
