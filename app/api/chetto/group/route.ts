import { fetchGroupMetadata } from "@/lib/actions/chetto";
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

  const group = await fetchGroupMetadata(groupId);
  return Response.json({ group });
}
