"use client";

// =============================================================================
// INDULGE ATLAS — Dynamic Form Responses Card
// =============================================================================
// Renders the raw JSONB `form_responses` blob from the `leads` table as a
// sleek "Intake Questionnaire" card in the "Quiet Luxury" dark aesthetic.
// The section auto-hides when there are no responses.
// =============================================================================

interface DynamicFormResponsesProps {
  responses: Record<string, unknown> | null | undefined;
}

export function DynamicFormResponses({ responses }: DynamicFormResponsesProps) {
  if (!responses || typeof responses !== "object") return null;

  const entries = Object.entries(responses).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );

  if (entries.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-[#E5E4DF] overflow-hidden shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
      {/* Card header */}
      <div className="px-6 pt-5 pb-4 border-b border-[#F0EFEb]">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9E9E9E]">
          Intake Questionnaire
        </p>
        <p className="text-[10px] text-[#C8C0B8] mt-0.5">
          Responses captured at lead submission
        </p>
      </div>

      {/* Entries list */}
      <div className="px-6 py-4 space-y-0">
        {entries.map(([key, value], i) => {
          const isLast = i === entries.length - 1;
          const displayKey = key
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
          const displayValue = formatValue(value);

          return (
            <div
              key={key}
              className={`py-3.5 ${!isLast ? "border-b border-[#F4F3EF]" : ""}`}
            >
              <p className="text-[10px] uppercase tracking-wider text-[#B5A99A] mb-1">
                {displayKey}
              </p>
              <p className="text-sm text-[#1A1A1A] font-medium leading-relaxed">
                {displayValue}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 0);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
