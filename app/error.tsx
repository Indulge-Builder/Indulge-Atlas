"use client";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: AppErrorProps) {
  const isConnectionIssue =
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    error.message.toLowerCase().includes("failed to fetch") ||
    error.message.toLowerCase().includes("network");

  return (
    <main className="min-h-screen bg-[#F9F9F6] text-[#1A1A1A]">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-6">
        <section className="w-full rounded-3xl border border-black/[0.06] bg-white/70 p-8 shadow-[0_14px_48px_-28px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:p-10">
          <p className="text-xs uppercase tracking-[0.22em] text-[#9E9E9E]">System Status</p>
          <h1
            className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {isConnectionIssue ? "Connection Interrupted" : "Something went wrong."}
          </h1>
          <p className="mt-4 text-sm leading-6 text-[#666666]">
            {isConnectionIssue
              ? "Your internet connection appears unstable. We will reconnect automatically once your network is back."
              : "An unexpected issue occurred. Please try again in a moment."}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-8 inline-flex items-center rounded-xl border border-black/[0.08] bg-white px-4 py-2 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-black/[0.03]"
          >
            Try Again
          </button>
        </section>
      </div>
    </main>
  );
}
