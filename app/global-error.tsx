"use client";

import * as Sentry from "@sentry/nextjs";
import { Geist } from "next/font/google";
import { AlertCircle } from "lucide-react";
import { useEffect } from "react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} min-h-screen font-sans antialiased`}
        suppressHydrationWarning
      >
        <div className="flex min-h-screen items-center justify-center bg-[#F9F9F6] p-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-rose-900/35">
              <AlertCircle className="h-6 w-6" strokeWidth={1.5} aria-hidden />
            </div>
            <h1 className="mt-4 text-xl font-semibold text-stone-900">
              System Interruption
            </h1>
            <p className="mt-2 text-sm text-stone-500 leading-relaxed">
              An unexpected error occurred in the workspace. Our engineering
              team has been automatically notified and is investigating.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="mt-6 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
