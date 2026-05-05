import { findClientGroup } from "@/lib/actions/chetto";
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
  const clientPhone = url.searchParams.get("clientPhone")?.trim() ?? "";
  const queendom = url.searchParams.get("queendom")?.trim() ?? "Unassigned";

  if (!clientPhone) {
    return Response.json({ group: null });
  }

  const group = await findClientGroup(clientPhone, queendom);
  return Response.json({ group });
}
