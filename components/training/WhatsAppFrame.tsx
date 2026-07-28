import type { ReactNode } from "react";

/**
 * Presentational WhatsApp-style chrome for the Genie Trainer. Fixed light "WA"
 * palette on purpose (this surface deliberately looks like the tool interns use
 * on the floor), so it is not theme-reactive.
 */
export function WhatsAppFrame({
  title,
  subtitle,
  right,
  footer,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-[#ECE5DD] shadow-xl">
      {/* header */}
      <header className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20 text-sm font-semibold">
          🧞
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-tight">{title}</div>
          {subtitle ? (
            <div className="truncate text-[12px] leading-tight text-white/80">{subtitle}</div>
          ) : null}
        </div>
        {right ? <div className="shrink-0 text-right text-[12px]">{right}</div> : null}
      </header>

      {/* chat body — the faint WA doodle tint */}
      <div
        className="flex-1 overflow-y-auto px-3 py-4"
        style={{
          backgroundImage:
            "radial-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        {children}
      </div>

      {footer ? <footer className="border-t border-black/10 bg-[#F0F0F0] p-3">{footer}</footer> : null}
    </div>
  );
}

/** A single chat bubble. `side` = who sent it. */
export function Bubble({
  side,
  meta,
  children,
}: {
  side: "member" | "agent" | "system";
  meta?: ReactNode;
  children: ReactNode;
}) {
  if (side === "system") {
    return (
      <div className="my-2 flex justify-center">
        <div className="rounded-md bg-[#FCF4CB] px-3 py-1 text-center text-[11px] text-black/60 shadow-sm">
          {children}
        </div>
      </div>
    );
  }
  const isAgent = side === "agent";
  return (
    <div className={`my-1 flex ${isAgent ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-[14px] leading-snug shadow-sm ${
          isAgent ? "bg-[#DCF8C6] text-black" : "bg-white text-black"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{children}</div>
        {meta ? <div className="mt-1 text-right text-[10px] text-black/45">{meta}</div> : null}
      </div>
    </div>
  );
}
