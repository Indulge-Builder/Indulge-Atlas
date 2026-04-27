"use client";

import Link from "next/link";
import { IndulgeButton } from "@/components/ui/indulge-button";

interface ErrorPageProps {
  error:  Error & { digest?: string };
  reset:  () => void;
}

export default function MasterTaskError({ error, reset }: ErrorPageProps) {
  return (
    <div className="min-h-screen bg-[#F9F9F6] flex flex-col items-center justify-center gap-4 text-center px-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
        Error
      </p>
      <h1 className="font-serif text-2xl font-bold text-zinc-800">
        Couldn&apos;t load this task
      </h1>
      <p className="text-sm text-zinc-500 max-w-sm">
        {error.message ?? "An unexpected error occurred while loading the task."}
      </p>
      <div className="flex gap-2 mt-2">
        <IndulgeButton variant="outline" size="sm" onClick={reset}>
          Try Again
        </IndulgeButton>
        <Link href="/tasks">
          <IndulgeButton variant="gold" size="sm">
            Back to Tasks
          </IndulgeButton>
        </Link>
      </div>
    </div>
  );
}
