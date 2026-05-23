import { TopBar } from "@/components/layout/TopBar";
import { WaBusinessClient } from "@/components/wa-business/WaBusinessClient";
import { getWaSessions } from "@/lib/actions/wa-business";

export const dynamic = "force-dynamic";

export default async function WaBusinessPage() {
  const sessions = await getWaSessions();

  return (
    <div className="flex flex-col h-screen bg-[#1A1814]">
      <TopBar
        title="WA Business"
        subtitle="Gupshup bot conversations — read-only monitor"
      />
      <div className="flex-1 min-h-0">
        <WaBusinessClient sessions={sessions} />
      </div>
    </div>
  );
}
