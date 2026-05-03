import { getEliaClientContext } from "@/lib/actions/elia";
import { eliaSystemPrompt } from "@/lib/elia/chat-prompt";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "Not configured" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as {
    message?: string;
    conversationHistory?: { role: "user" | "assistant"; content: string }[];
  } | null;
  const message = body?.message?.trim();
  if (!body || !message) return Response.json({ error: "Bad request" }, { status: 400 });
  const conversationHistory = body.conversationHistory ?? [];
  let memberContext: string;
  try { memberContext = await getEliaClientContext(); } catch { return Response.json({ error: "Context fetch failed" }, { status: 500 }); }
  const ar = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      stream: false,
      system: eliaSystemPrompt(memberContext),
      messages: [...conversationHistory, { role: "user", content: message }],
    }),
  });
  if (!ar.ok) {
    console.error("Anthropic error:", await ar.text());
    return Response.json({ error: "Anthropic API failed" }, { status: 502 });
  }
  const result = (await ar.json()) as { content?: { text?: string }[] };
  return Response.json({ text: result.content?.[0]?.text ?? "No response received." });
}
