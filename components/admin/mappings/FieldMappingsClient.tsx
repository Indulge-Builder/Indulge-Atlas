"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Zap, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  getLatestWebhookPayload,
  getDatabaseSchema,
  type LeadColumnMeta,
} from "@/lib/actions/pipeline";
import {
  getWebhookEndpoints,
  getFieldMappingsForEndpoint,
  upsertFieldMapping,
  deleteFieldMapping,
  toggleFieldMapping,
  type WebhookEndpoint,
  type FieldMapping,
} from "@/lib/actions/field-mappings";
import { MappingBuilderRow, AddMappingForm } from "./MappingBuilderRow";

type Channel = "meta" | "google" | "website";

const CHANNEL_LABELS: Record<Channel, string> = {
  meta: "Meta Lead Ads",
  google: "Google Ads",
  website: "Website / Typeform",
};

function formatSampleValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s.length > 120 ? `${s.slice(0, 117)}…` : s;
    } catch {
      return String(value);
    }
  }
  const s = String(value);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

export function FieldMappingsClient() {
  const [channel, setChannel] = useState<Channel>("meta");

  // Endpoints (used to resolve endpoint_id from channel)
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);

  // Left panel — latest raw payload
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [payloadError, setPayloadError] = useState<string | null>(null);

  // Right panel — saved mappings for this endpoint
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [mappingsLoading, setMappingsLoading] = useState(false);

  // DB schema columns
  const [columns, setColumns] = useState<LeadColumnMeta[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(true);

  // Add-row saving state
  const [saving, setSaving] = useState(false);

  // Resolve current endpoint
  const currentEndpoint = useMemo(
    () => endpoints.find((e) => e.channel === channel) ?? null,
    [endpoints, channel],
  );

  // Load endpoints + schema once
  useEffect(() => {
    void getWebhookEndpoints().then((res) => {
      if (res.ok) setEndpoints(res.endpoints);
    });
    void getDatabaseSchema().then((res) => {
      if (res.ok) setColumns(res.columns);
      setColumnsLoading(false);
    });
  }, []);

  const loadPayload = useCallback(async () => {
    setPayloadLoading(true);
    setPayloadError(null);
    const res = await getLatestWebhookPayload(channel);
    if (res.ok) {
      setPayload(res.payload);
    } else {
      setPayloadError(res.error);
      setPayload(null);
    }
    setPayloadLoading(false);
  }, [channel]);

  const loadMappings = useCallback(async () => {
    if (!currentEndpoint) return;
    setMappingsLoading(true);
    const res = await getFieldMappingsForEndpoint(currentEndpoint.id);
    if (res.ok) setMappings(res.mappings);
    setMappingsLoading(false);
  }, [currentEndpoint]);

  useEffect(() => {
    void loadPayload();
  }, [loadPayload]);

  useEffect(() => {
    void loadMappings();
  }, [loadMappings]);

  // Payload entries for left column + datalist suggestions
  const payloadEntries = useMemo(() => {
    if (!payload) return [];
    return Object.keys(payload)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({ key, sample: formatSampleValue(payload[key]) }));
  }, [payload]);

  const payloadKeys = useMemo(
    () => payloadEntries.map((e) => e.key),
    [payloadEntries],
  );

  // ── CRUD handlers ──────────────────────────────────────────────────────────

  async function handleSaveMapping(data: {
    incoming_json_key: string;
    target_db_column: string;
    transformation_rule: string | null;
    fallback_value: string | null;
  }) {
    if (!currentEndpoint) return;
    setSaving(true);
    const res = await upsertFieldMapping({
      endpoint_id: currentEndpoint.id,
      ...data,
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Mapping saved");
      void loadMappings();
    } else {
      toast.error(res.error ?? "Could not save mapping");
    }
  }

  async function handleDelete(id: string) {
    const res = await deleteFieldMapping(id);
    if (res.ok) {
      toast.success("Mapping deleted");
      setMappings((prev) => prev.filter((m) => m.id !== id));
    } else {
      toast.error(res.error ?? "Could not delete");
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    const res = await toggleFieldMapping(id, isActive);
    if (res.ok) {
      toast.success(isActive ? "Mapping activated" : "Mapping paused");
      setMappings((prev) =>
        prev.map((m) => (m.id === id ? { ...m, is_active: isActive } : m)),
      );
    } else {
      toast.error(res.error ?? "Could not update");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Channel tabs */}
      <Tabs
        value={channel}
        onValueChange={(v) => setChannel(v as Channel)}
        className="mb-6"
      >
        <TabsList className="h-auto flex-wrap gap-1 bg-[#F2F2EE] p-1.5">
          {(["meta", "google", "website"] as const).map((ch) => (
            <TabsTrigger
              key={ch}
              value={ch}
              className="rounded-md px-4 py-2 data-[state=active]:shadow-sm"
            >
              {CHANNEL_LABELS[ch]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Engine status callout */}
      {!mappingsLoading && (
        <div
          className={cn(
            "mb-6 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm",
            mappings.filter((m) => m.is_active).length > 0
              ? "border-emerald-200/70 bg-emerald-50 text-emerald-800"
              : "border-amber-200/70 bg-amber-50 text-amber-900",
          )}
        >
          <Zap
            className={cn(
              "h-4 w-4 shrink-0",
              mappings.filter((m) => m.is_active).length > 0
                ? "text-emerald-600"
                : "text-amber-600",
            )}
          />
          {mappings.filter((m) => m.is_active).length > 0 ? (
            <span>
              <strong>Dynamic engine active</strong> — incoming{" "}
              <span className="font-mono">{channel}</span> webhooks are being
              parsed by{" "}
              <strong>{mappings.filter((m) => m.is_active).length} mapping rule{mappings.filter((m) => m.is_active).length !== 1 ? "s" : ""}</strong>.
              Unmapped keys flow into <span className="font-mono">form_data</span>.
            </span>
          ) : (
            <span>
              <strong>Hardcoded fallback active</strong> — no mapping rules saved
              for <span className="font-mono">{channel}</span> yet. Add rules
              below to enable the dynamic engine.
            </span>
          )}
        </div>
      )}

      {/* 2-col layout */}
      <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
        {/* ── Left: Incoming Data Catcher ───────────────────────────────────── */}
        <div className="lg:col-span-1">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold tracking-tight text-[#1A1A1A]">
              Latest Captured Payload
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-8 w-8 shrink-0 text-[#6B6B6B] hover:text-[#1A1A1A]"
              onClick={() => void loadPayload()}
              disabled={payloadLoading}
              aria-label="Refresh payload"
            >
              <RefreshCw
                className={cn("h-4 w-4", payloadLoading && "animate-spin")}
              />
            </Button>
          </div>

          <div
            className={cn(
              surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
              "min-h-[300px] p-4",
            )}
          >
            {payloadLoading && (
              <p className="text-sm text-[#6B6B6B]">Loading sample…</p>
            )}
            {!payloadLoading && payloadError && (
              <p className="text-sm text-red-600/90">{payloadError}</p>
            )}
            {!payloadLoading && !payloadError && payloadEntries.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Info className="h-8 w-8 text-stone-300" />
                <p className="text-sm leading-relaxed text-[#6B6B6B]">
                  No webhooks captured yet for this source. Trigger a Pabbly
                  flow — the next POST body will appear here.
                </p>
              </div>
            )}
            {!payloadLoading && !payloadError && payloadEntries.length > 0 && (
              <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-1">
                {payloadEntries.map(({ key, sample }) => (
                  <li
                    key={key}
                    className="rounded-lg border border-[#EAEAEA] bg-[#FAFAF8] px-3 py-2.5"
                  >
                    <p className="font-mono text-xs font-semibold text-[#1A1A1A]">
                      {key}
                    </p>
                    <p
                      className="mt-0.5 truncate text-xs text-stone-400"
                      title={sample}
                    >
                      {sample}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── Right: Mapping Builder ────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold tracking-tight text-[#1A1A1A]">
              Mapping Rules
            </h3>
            {mappings.length > 0 && (
              <Badge
                variant="outline"
                className="border-[#E5E4DF] bg-white text-[10px] font-medium text-[#6B6B6B]"
              >
                {mappings.filter((m) => m.is_active).length} active /{" "}
                {mappings.length} total
              </Badge>
            )}
          </div>

          <div
            className={cn(
              surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
              "min-h-[300px] p-4 md:p-5",
            )}
          >
            {/* Saved mapping rows */}
            {mappingsLoading && (
              <p className="text-sm text-[#6B6B6B]">Loading rules…</p>
            )}

            {!mappingsLoading && mappings.length > 0 && (
              <ul className="mb-5 space-y-2">
                {mappings.map((m) => (
                  <MappingBuilderRow
                    key={m.id}
                    mapping={m}
                    columns={columns}
                    onDelete={handleDelete}
                    onToggle={handleToggle}
                  />
                ))}
              </ul>
            )}

            {!mappingsLoading && mappings.length === 0 && (
              <p className="mb-5 text-sm text-[#6B6B6B]">
                No mapping rules configured for this channel. Add your first rule
                below — the engine activates the moment you save one.
              </p>
            )}

            {/* Add row */}
            <AddMappingForm
              payloadKeys={payloadKeys}
              columns={columnsLoading ? [] : columns}
              onSave={handleSaveMapping}
              saving={saving}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
