import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Concierge agent creation moved into User Management (`/admin`). */
export default function ConciergeAgentsRedirectPage() {
  redirect("/admin");
}
