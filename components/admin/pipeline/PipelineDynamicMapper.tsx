"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Database, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getDatabaseSchema,
  getLatestWebhookPayload,
  type LeadColumnMeta,
} from "@/lib/actions/pipeline";
import type { PipelineChannel } from "./pipeline-data";

const UNMAPPED = "__unmapped__";

function formatSampleValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s.length > 140 ? `${s.slice(0, 137)}…` : s;
    } catch {
      return String(value);
    }
  }
  const s = String(value);
  return s.length > 140 ? `${s.slice(0, 137)}…` : s;
}

function topLevelEntries(
  payload: Record<string, unknown> | null,
): Array<{ key: string; sample: string }> {
  if (!payload) return [];
  return Object.keys(payload)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({
      key,
      sample: formatSampleValue(payload[key]),
    }));
}

export interface PipelineDynamicMapperProps {
  channel: PipelineChannel;
}

export function PipelineDynamicMapper({ channel }: PipelineDynamicMapperProps) {
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [payloadLoading, setPayloadLoading] = useState(true);

  const [columns, setColumns] = useState<LeadColumnMeta[]>([]);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(true);

  /** JSON key → selected leads column or UNMAPPED */
  const [mappings, setMappings] = useState<Record<string, string>>({});

  const loadSchema = useCallback(async () => {
    setSchemaLoading(true);
    setSchemaError(null);
    const res = await getDatabaseSchema();
    if (res.ok) {
      setColumns(res.columns);
    } else {
      setSchemaError(res.error);
      setColumns([]);
    }
    setSchemaLoading(false);
  }, []);

  const loadPayload = useCallback(async () => {
    setPayloadLoading(true);
    setPayloadError(null);
    const res = await getLatestWebhookPayload(channel);
    if (res.ok) {
      setPayload(res.payload);
      setMappings({});
    } else {
      setPayloadError(res.error);
      setPayload(null);
    }
    setPayloadLoading(false);
  }, [channel]);

  useEffect(() => {
    void loadSchema();
  }, [loadSchema]);

  useEffect(() => {
    void loadPayload();
  }, [loadPayload]);

  const entries = useMemo(() => topLevelEntries(payload), [payload]);

  useEffect(() => {
    if (entries.length === 0) return;
    setMappings((prev) => {
      const next = { ...prev };
      for (const { key } of entries) {
        const match = columns.find(
          (c) => c.column_name.toLowerCase() === key.toLowerCase(),
        );
        if (next[key] === undefined) {
          next[key] = match ? match.column_name : UNMAPPED;
        } else if (next[key] === UNMAPPED && match) {
          next[key] = match.column_name;
        }
      }
      return next;
    });
  }, [entries, columns]);

  const setMapping = (key: string, column: string) => {
    setMappings((m) => ({ ...m, [key]: column }));
  };

  return (
    <div className="mb-8 grid gap-6 lg:grid-cols-3 lg:gap-8">
      {/* Left — payload */}
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
            "min-h-[280px] p-4",
          )}
        >
          {payloadLoading && (
            <p className="text-sm text-[#6B6B6B]">Loading sample…</p>
          )}
          {!payloadLoading && payloadError && (
            <p className="text-sm text-red-600/90">{payloadError}</p>
          )}
          {!payloadLoading && !payloadError && entries.length === 0 && (
            <p className="text-sm leading-relaxed text-[#6B6B6B]">
              No webhooks logged for this source yet. Trigger your Pabbly flow
              once — the next POST body will appear here.
            </p>
          )}
          {!payloadLoading && !payloadError && entries.length > 0 && (
            <ul className="flex max-h-[min(420px,50vh)] flex-col gap-2 overflow-y-auto pr-1">
              {entries.map(({ key, sample }) => (
                <li
                  key={key}
                  className="rounded-lg border border-[#EAEAEA] bg-[#FAFAF8] px-3 py-2.5"
                >
                  <p className="font-mono text-xs font-semibold text-[#1A1A1A]">
                    {key}
                  </p>
                  <p
                    className="mt-1 truncate text-xs text-stone-500"
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

      {/* Right — mapping */}
      <div className="lg:col-span-2">
        <div className="mb-3 flex items-center gap-2">
          <Database className="h-4 w-4 text-[#A88B25]" aria-hidden />
          <h3 className="text-sm font-semibold tracking-tight text-[#1A1A1A]">
            Schema Mapping
          </h3>
          {schemaLoading && (
            <span className="text-xs text-[#9E9E9E]">Loading columns…</span>
          )}
        </div>
        <div
          className={cn(
            surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
            "min-h-[280px] p-4 md:p-5",
          )}
        >
          {schemaError && (
            <p className="mb-4 text-sm text-red-600/90">{schemaError}</p>
          )}
          {schemaLoading && entries.length > 0 && (
            <p className="text-sm text-[#6B6B6B]">Resolving database columns…</p>
          )}
          {!schemaLoading && !schemaError && entries.length === 0 && (
            <p className="text-sm text-[#6B6B6B]">
              Map each incoming key to a column once payloads are available.
            </p>
          )}
          {!schemaLoading && !schemaError && entries.length > 0 && (
            <ul className="space-y-3">
              {entries.map(({ key }) => {
                const selected = mappings[key] ?? UNMAPPED;
                const isMapped = selected !== UNMAPPED;

                return (
                  <li
                    key={key}
                    className="flex flex-col gap-3 rounded-xl border border-[#EAEAEA] bg-white/80 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4"
                  >
                    <div className="min-w-0 flex-1 sm:max-w-[38%]">
                      <p className="font-mono text-xs font-semibold text-[#1A1A1A]">
                        {key}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center justify-center sm:w-10">
                      <ArrowRight
                        className="h-4 w-4 text-stone-300"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                      <Select
                        value={selected}
                        onValueChange={(v) => setMapping(key, v)}
                      >
                        <SelectTrigger className="h-10 w-full border-[#E5E4DF] bg-[#FAFAF8] font-mono text-xs sm:max-w-[280px]">
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNMAPPED} className="font-mono text-xs">
                            Unmapped
                          </SelectItem>
                          {columns.map((c) => (
                            <SelectItem
                              key={c.column_name}
                              value={c.column_name}
                              className="font-mono text-xs"
                            >
                              {`${c.column_name} (${c.data_type})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          isMapped
                            ? "border-emerald-200/80 bg-emerald-50 text-emerald-800"
                            : "border-amber-200/80 bg-amber-50 text-amber-900",
                        )}
                      >
                        {isMapped ? "Mapped" : "Unmapped"}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
