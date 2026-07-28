import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/getAuthUser";

/**
 * Genie Trainer shell — a standalone, WhatsApp-flavoured trainee surface.
 *
 * Auth-gated like the rest of Atlas (interns are Atlas users). This surface is
 * READ-ONLY training data: it reads the committed, anonymised scenario store and
 * never touches Freshdesk or any member table. There is no write path here.
 */
export default async function TrainingLayout({ children }: { children: React.ReactNode }) {
  try {
    const { profile } = await getAuthUser();
    if (!profile) redirect("/login");
  } catch {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0b141a] text-white">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-lg">🧞</span>
          <span className="text-sm font-semibold tracking-wide">Genie Trainer</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/60">
            practice
          </span>
        </div>
        <Link href="/" className="text-[12px] text-white/60 hover:text-white">
          ← Atlas
        </Link>
      </header>
      <main className="min-h-0 flex-1 px-3 pb-4">{children}</main>
    </div>
  );
}
