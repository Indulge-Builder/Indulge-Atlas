import {
  getEliaClientContext,
  getEliaSingleClientProfileText,
} from "@/lib/actions/elia";
import {
  eliaClientScopedPrompt,
  eliaSystemPrompt,
  parseEliaClientDisplayNameFromProfile,
} from "@/lib/elia/chat-prompt";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

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
    clientId?: string;
  } | null;
  const message = body?.message?.trim();
  if (!body || !message) return Response.json({ error: "Bad request" }, { status: 400 });
  const conversationHistory = body.conversationHistory ?? [];
  const clientIdRaw = body.clientId?.trim();
  let systemPrompt: string;
  if (clientIdRaw) {
    const uuid = z.string().uuid().safeParse(clientIdRaw);
    if (!uuid.success) {
      return Response.json({ error: "Invalid client id" }, { status: 400 });
    }
    let single: string | null;
    try {
      single = await getEliaSingleClientProfileText(uuid.data);
    } catch {
      return Response.json({ error: "Context fetch failed" }, { status: 500 });
    }
    if (single === null) {
      return Response.json({ error: "Client not found" }, { status: 404 });
    }
    const displayName = parseEliaClientDisplayNameFromProfile(single);
    systemPrompt = eliaClientScopedPrompt(displayName, single);
  } else {
    let memberContext: string;
    try {
      memberContext = await getEliaClientContext();
    } catch {
      return Response.json({ error: "Context fetch failed" }, { status: 500 });
    }
    systemPrompt = eliaSystemPrompt(memberContext);
  }
  const ar = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      stream: false,
      system: systemPrompt,
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
