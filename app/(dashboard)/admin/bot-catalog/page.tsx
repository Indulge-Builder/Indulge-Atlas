import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { BotCatalogClient } from "@/components/admin/bot-catalog/BotCatalogClient";
import { getBotCatalogItems } from "@/lib/actions/bot-catalog";

export const dynamic = "force-dynamic";

export default async function AdminBotCatalogPage() {
  let items;
  try {
    items = await getBotCatalogItems();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    redirect(msg === "Forbidden" ? "/" : "/login");
  }

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="WhatsApp bot catalog"
        subtitle="Gupshup Elia recommendations — active items only reach live chats"
        hideDomainSwitcher
      />

      <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-8 lg:px-8">
        <BotCatalogClient items={items} />
      </div>
    </div>
  );
}
