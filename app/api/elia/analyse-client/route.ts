import { NextRequest, NextResponse } from "next/server";
import { verifyBearerSecret } from "@/lib/utils/webhook";
import { runEliaWhatsAppAnalysis } from "@/lib/services/eliaProfileAnalysis";

// POST /api/elia/analyse-client
// Body: { clientId: string }
// Auth: Bearer token via ELIA_ANALYSIS_SECRET env var

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = verifyBearerSecret(request, "ELIA_ANALYSIS_SECRET");
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const clientId =
    body != null &&
    typeof body === "object" &&
    "clientId" in body &&
    typeof (body as Record<string, unknown>).clientId === "string"
      ? ((body as Record<string, unknown>).clientId as string).trim()
      : "";

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  const result = await runEliaWhatsAppAnalysis(clientId);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error ?? "Analysis failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    messagesAnalyzed: result.messagesAnalyzed,
  });
}
