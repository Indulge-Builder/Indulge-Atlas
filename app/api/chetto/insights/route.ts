import { askChettoInsights } from "@/lib/actions/chetto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    groupId?: string;
    question?: string;
  } | null;

  const groupId = body?.groupId?.trim();
  const question = body?.question?.trim();
  if (!groupId || !question) {
    return Response.json({ error: "groupId and question are required" }, { status: 400 });
  }

  const result = await askChettoInsights(groupId, question);
  return Response.json(result);
}
