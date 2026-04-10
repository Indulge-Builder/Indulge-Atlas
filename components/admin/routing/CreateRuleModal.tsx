"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createRoutingRule,
  type CreateRoutingRuleInput,
} from "@/lib/actions/routing-rules";
import type { IndulgeDomain, LeadRoutingActionType, Profile } from "@/lib/types/database";
import { DOMAIN_DISPLAY_CONFIG } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const CONDITION_FIELDS: { value: string; label: string }[] = [
  { value: "utm_campaign", label: "UTM campaign" },
  { value: "utm_source", label: "UTM source" },
  { value: "utm_medium", label: "UTM medium" },
  { value: "domain", label: "Domain" },
  { value: "source", label: "Source" },
];

const OPERATORS: { value: CreateRoutingRuleInput["condition_operator"]; label: string }[] =
  [
    { value: "equals", label: "equals" },
    { value: "contains", label: "contains" },
    { value: "starts_with", label: "starts with" },
  ];

const DOMAIN_OPTIONS: IndulgeDomain[] = [
  "indulge_concierge",
  "indulge_house",
  "indulge_shop",
  "indulge_legacy",
];

interface CreateRuleModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  agents: Pick<Profile, "id" | "full_name" | "email" | "domain">[];
}

export function CreateRuleModal({
  open,
  onClose,
  onCreated,
  agents,
}: CreateRuleModalProps) {
  const [ruleName, setRuleName] = useState("");
  const [conditionField, setConditionField] = useState("utm_campaign");
  const [conditionOperator, setConditionOperator] =
    useState<CreateRoutingRuleInput["condition_operator"]>("equals");
  const [conditionValue, setConditionValue] = useState("");
  const [actionType, setActionType] =
    useState<LeadRoutingActionType>("route_to_domain_pool");
  const [agentId, setAgentId] = useState<string>("");
  const [domain, setDomain] = useState<IndulgeDomain>("indulge_shop");
  const [loading, setLoading] = useState(false);

  function reset() {
    setRuleName("");
    setConditionField("utm_campaign");
    setConditionOperator("equals");
    setConditionValue("");
    setActionType("route_to_domain_pool");
    setAgentId("");
    setDomain("indulge_shop");
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
      onClose();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: CreateRoutingRuleInput = {
        rule_name: ruleName,
        condition_field: conditionField,
        condition_operator: conditionOperator,
        condition_value: conditionValue,
        action_type: actionType,
        action_target_uuid:
          actionType === "assign_to_agent" && agentId ? agentId : null,
        action_target_domain:
          actionType === "route_to_domain_pool" ? domain : null,
      };

      const res = await createRoutingRule(payload);
      if (!res.success) {
        toast.error(res.error ?? "Could not create rule");
        return;
      }
      toast.success("Rule created");
      reset();
      onCreated();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg border-[#E5E4DF] bg-white">
        <DialogHeader className="space-y-1">
          <DialogTitle
            className="text-lg font-semibold text-[#1A1A1A]"
            style={{ fontFamily: "var(--font-playfair), serif" }}
          >
            New routing rule
          </DialogTitle>
          <DialogDescription className="text-sm text-[#6B6B6B]">
            Define a single condition and the action to take when it matches. Rules are
            evaluated in priority order.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-1">
          <div className="space-y-2">
            <Label htmlFor="rule-name" className="text-[#1A1A1A]">
              Rule name
            </Label>
            <Input
              id="rule-name"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="e.g. Legacy Jan Campaign to Manaswini"
              className="border-[#E5E4DF] bg-[#FAFAF8]"
              required
            />
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#9A9A94]">
              If
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6B6B6B]">Field</Label>
                <Select value={conditionField} onValueChange={setConditionField}>
                  <SelectTrigger className="border-[#E5E4DF] bg-[#FAFAF8]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6B6B6B]">Operator</Label>
                <Select
                  value={conditionOperator}
                  onValueChange={(v) =>
                    setConditionOperator(v as CreateRoutingRuleInput["condition_operator"])
                  }
                >
                  <SelectTrigger className="border-[#E5E4DF] bg-[#FAFAF8]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label className="text-xs text-[#6B6B6B]">Value</Label>
                <Input
                  value={conditionValue}
                  onChange={(e) => setConditionValue(e.target.value)}
                  placeholder="Match string"
                  className="border-[#E5E4DF] bg-[#FAFAF8]"
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#9A9A94]">
              Then
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#6B6B6B]">Action</Label>
                <Select
                  value={actionType}
                  onValueChange={(v) => setActionType(v as LeadRoutingActionType)}
                >
                  <SelectTrigger className="border-[#E5E4DF] bg-[#FAFAF8]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assign_to_agent">Assign to agent</SelectItem>
                    <SelectItem value="route_to_domain_pool">
                      Route to domain pool
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {actionType === "assign_to_agent" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#6B6B6B]">Agent</Label>
                  <Select value={agentId} onValueChange={setAgentId} required>
                    <SelectTrigger className="border-[#E5E4DF] bg-[#FAFAF8]">
                      <SelectValue placeholder="Select an agent" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.full_name} —{" "}
                          {DOMAIN_DISPLAY_CONFIG[a.domain]?.shortLabel ?? a.domain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {actionType === "route_to_domain_pool" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#6B6B6B]">Domain pool</Label>
                  <Select
                    value={domain}
                    onValueChange={(v) => setDomain(v as IndulgeDomain)}
                  >
                    <SelectTrigger className="border-[#E5E4DF] bg-[#FAFAF8]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOMAIN_OPTIONS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {DOMAIN_DISPLAY_CONFIG[d]?.label ?? d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              className="border-[#E5E4DF]"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className={cn(
                "min-w-[120px] bg-[#0A0A0A] text-white hover:bg-[#1A1A1A]",
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                "Create rule"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
