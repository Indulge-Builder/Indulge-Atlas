"use client";

import {
  ArrowRight,
  Database,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceCardVariants } from "@/components/ui/card";
import type { PipelineMappingRow, PipelineTransformKind } from "./pipeline-data";

function badgeLabel(kind: PipelineTransformKind): string {
  switch (kind) {
    case "direct":
      return "Direct";
    case "alias":
      return "Aliased";
    case "parse":
      return "Parsed";
    case "merge":
      return "JSONB";
    case "derive":
      return "Derived";
    default:
      return "";
  }
}

export interface DataMapperNodeProps {
  mapping: PipelineMappingRow;
  className?: string;
}

export function DataMapperNode({ mapping, className }: DataMapperNodeProps) {
  const { sourceKey, transform, targetColumn, type, kind } = mapping;
  const isDirect = kind === "direct";
  const badge = badgeLabel(kind);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-3",
        className,
      )}
    >
      {/* Incoming */}
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-[#9E9E9E]">
          Incoming
        </p>
        <div
          className={cn(
            surfaceCardVariants({ tone: "subtle", elevation: "xs" }),
            "inline-flex max-w-full px-3 py-2",
          )}
        >
          <code
            className="font-mono text-xs leading-snug text-[#1A1A1A] break-all"
            title={sourceKey}
          >
            {sourceKey.startsWith("—") ? sourceKey : `payload.${sourceKey}`}
          </code>
        </div>
      </div>

      {/* Transform bridge */}
      <div className="flex shrink-0 flex-col items-center justify-center gap-1.5 px-2 sm:w-40">
        <div className="flex w-full items-center gap-2">
          <div
            className="h-px flex-1 bg-linear-to-r from-transparent via-stone-200 to-stone-300"
            aria-hidden
          />
          {isDirect ? (
            <ArrowRight
              className="h-5 w-5 shrink-0 text-stone-300"
              strokeWidth={1.75}
              aria-hidden
            />
          ) : (
            <Workflow
              className="h-5 w-5 shrink-0 text-[#D4AF37]/80"
              strokeWidth={1.75}
              aria-hidden
            />
          )}
          <div
            className="h-px flex-1 bg-linear-to-l from-transparent via-stone-200 to-stone-300"
            aria-hidden
          />
        </div>
        {!isDirect && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200/60">
            {badge}
          </span>
        )}
        <p
          className="max-w-40 text-center text-[11px] leading-tight text-[#6B6B6B]"
          title={transform}
        >
          {transform}
        </p>
      </div>

      {/* Database */}
      <div className="min-w-0 flex-1 sm:text-right">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-[#9E9E9E]">
          Supabase
        </p>
        <div
          className={cn(
            "inline-flex max-w-full items-center gap-2 rounded-xl border border-[#E5E4DF] bg-[#FAFAF8] px-3 py-2 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] sm:ml-auto sm:flex-row-reverse",
          )}
        >
          <Database
            className="h-4 w-4 shrink-0 text-[#A88B25]"
            strokeWidth={1.75}
            aria-hidden
          />
          <div className="min-w-0 text-left sm:text-right">
            <code
              className="font-mono text-xs font-semibold leading-snug text-[#1A1A1A] break-all"
              title={`leads.${targetColumn}`}
            >
              leads.{targetColumn}
            </code>
            <p className="mt-0.5 text-[10px] text-[#8A8A8A]">{type}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
