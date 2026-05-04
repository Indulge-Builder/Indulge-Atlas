import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";

type LeaderPerspectiveNoticeProps = {
  title: string;
  subtitle: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
};

/**
 * Shown when leadership opens a surface that is wired for individual agents
 * (scoped queries, agent-only server actions).
 */
export function LeaderPerspectiveNotice({
  title,
  subtitle,
  body,
  ctaHref,
  ctaLabel,
}: LeaderPerspectiveNoticeProps) {
  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar title={title} subtitle={subtitle} />
      <div className="mx-auto max-w-md px-6 py-16 text-center space-y-5">
        <p className="text-sm text-zinc-600 leading-relaxed">{body}</p>
        <Link
          href={ctaHref}
          className="inline-flex items-center justify-center rounded-xl bg-[#1A1814] px-4 py-2.5 text-sm font-medium text-[#F9F9F6] hover:bg-[#2d2924] transition-colors"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
