import { getGroupTimeline } from "@/lib/actions/chetto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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
  if (!groupId) {
    return Response.json({ error: "groupId is required" }, { status: 400 });
  }

  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 50;
  const offsetId = url.searchParams.get("offsetId")?.trim() ?? undefined;

  const result = await getGroupTimeline(
    groupId,
    Number.isFinite(limit) && limit > 0 ? limit : 50,
    offsetId,
  );
  return Response.json(result);
}
