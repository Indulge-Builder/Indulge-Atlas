/**
 * Dynamic Lead Routing — pure rule evaluation (no I/O).
 * Used by webhook ingestion; legacy waterfall runs when this returns null.
 */

import type { LeadRoutingRule } from "@/lib/types/database";

export type RoutingRuleEvaluationResult =
  | {
      action_type: "assign_to_agent";
      action_target_uuid: string;
    }
  | {
      action_type: "route_to_domain_pool";
      action_target_domain: string;
    };

function normalizeComparable(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

/**
 * Resolve a condition field from the incoming webhook-shaped payload.
 * Null-safe: missing fields become empty string for comparison.
 */
function getPayloadFieldValue(
  conditionField: string,
  leadPayload: Record<string, unknown>,
): string {
  switch (conditionField) {
    case "utm_campaign":
      return leadPayload.utm_campaign != null ? String(leadPayload.utm_campaign) : "";
    case "utm_source":
      return leadPayload.utm_source != null ? String(leadPayload.utm_source) : "";
    case "utm_medium":
      return leadPayload.utm_medium != null ? String(leadPayload.utm_medium) : "";
    case "domain":
      return leadPayload.domain != null ? String(leadPayload.domain) : "";
    case "source": {
      const raw = leadPayload.source;
      if (typeof raw === "string" && raw.trim() !== "") return raw;
      return leadPayload.utm_source != null ? String(leadPayload.utm_source) : "";
    }
    default:
      return "";
  }
}

function conditionMatches(
  fieldValueRaw: string,
  operator: string,
  conditionValueRaw: string,
): boolean {
  const left = normalizeComparable(fieldValueRaw);
  const pattern = normalizeComparable(conditionValueRaw);

  switch (operator) {
    case "equals":
      return left === pattern;
    case "contains": {
      if (pattern === "") return false;
      return left.includes(pattern);
    }
    case "starts_with": {
      if (pattern === "") return false;
      return left.startsWith(pattern);
    }
    default:
      return false;
  }
}

/**
 * Evaluates active routing rules in **priority order** (caller should pass rows
 * ordered by `priority` ASC). First matching rule wins.
 *
 * @returns The action to take, or `null` when no rule matches or targets are invalid.
 */
export function evaluateRulesAgainstLead(
  rules: LeadRoutingRule[],
  leadPayload: unknown,
): RoutingRuleEvaluationResult | null {
  const payload =
    leadPayload !== null && typeof leadPayload === "object"
      ? (leadPayload as Record<string, unknown>)
      : {};

  const ordered = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of ordered) {
    if (!rule.is_active) continue;

    const fieldValue = getPayloadFieldValue(rule.condition_field, payload);
    if (!conditionMatches(fieldValue, rule.condition_operator, rule.condition_value)) {
      continue;
    }

    if (rule.action_type === "assign_to_agent") {
      if (rule.action_target_uuid) {
        return {
          action_type: "assign_to_agent",
          action_target_uuid: rule.action_target_uuid,
        };
      }
      continue;
    }

    if (rule.action_type === "route_to_domain_pool") {
      if (rule.action_target_domain?.trim()) {
        return {
          action_type: "route_to_domain_pool",
          action_target_domain: rule.action_target_domain.trim(),
        };
      }
      continue;
    }
  }

  return null;
}
