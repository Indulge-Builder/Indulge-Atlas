import { listEscalations } from "@/lib/actions/chetto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId")?.trim();
  const queendom = url.searchParams.get("queendom")?.trim() ?? undefined;
  const label = url.searchParams.get("label")?.trim() ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 20;

  const result = await listEscalations({
    groupIds: groupId ? [groupId] : undefined,
    queendom,
    label,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
  });

  return Response.json(result);
}
