import { cn } from "@/lib/utils";

/**
 * Academy's own page header.
 *
 * Deliberately NOT `components/layout/TopBar` — that one reaches for
 * `useChatDrawer`, `useProfile` and `useCommandPalette`, which only exist
 * inside the Atlas dashboard provider tree. Academy runs its own shell with
 * none of that chrome (no domain switcher, no chat drawer, no SLA alerts,
 * no notification bells), so it carries a plain presentational header and
 * stays a server component.
 *
 * Visual language matches TopBar: Playfair title, hairline separator,
 * sticky over the scroll region.
 */
export function AcademyTopBar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  // Matches TopBar's GoldDotTitle: a trailing full stop is painted gold.
  const goldDot = title.endsWith(".");
  const body = goldDot ? title.slice(0, -1) : title;

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center justify-between gap-4",
        "border-b border-black/[0.05] bg-[#F9F9F6]/80 px-4 py-4 backdrop-blur-xl md:px-6 lg:px-8",
        "animate-in fade-in slide-in-from-top-2 duration-300",
      )}
    >
      <div className="min-w-0">
        <h1
          className="truncate text-2xl font-semibold leading-tight tracking-tight text-[#1A1A1A] md:text-3xl lg:text-4xl"
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          {body}
          {goldDot && <span className="text-brand-gold">.</span>}
        </h1>

        {subtitle && (
          <p className="mt-0.5 text-[13px] font-normal tracking-wide text-[#9E9E9E]">
            {subtitle}
          </p>
        )}
      </div>

      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </header>
  );
}
