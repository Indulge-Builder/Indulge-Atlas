import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { getRecentWhatsAppConversations } from "@/lib/actions/whatsapp";
import { WhatsAppHubClient } from "@/components/whatsapp/WhatsAppHubClient";

export const dynamic = "force-dynamic";

function HubSkeleton() {
  return (
    <div className="flex-1 min-h-0 px-8 py-6">
      <div className="h-full overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_1px_4px_0_rgb(0_0_0/0.04)]">
        <div className="grid h-full grid-cols-[400px_1fr]">
          <div className="border-r border-stone-200 bg-stone-50/50" />
          <div className="bg-[#FAFAF9]" />
        </div>
      </div>
    </div>
  );
}

async function HubContent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const conversations = await getRecentWhatsAppConversations();
  return <WhatsAppHubClient initialConversations={conversations} />;
}

export default function WhatsAppHubPage() {
  return (
    <div className="min-h-screen bg-[#F9F9F6] flex flex-col">
      <TopBar title="WhatsApp Hub" subtitle="Global message console" />
      <main className="flex-1 min-h-0">
        <Suspense fallback={<HubSkeleton />}>
          <HubContent />
        </Suspense>
      </main>
    </div>
  );
}

