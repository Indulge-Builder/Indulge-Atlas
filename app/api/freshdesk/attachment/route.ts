import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const FRESHDESK_BASE = "https://indulge.freshdesk.com";

function getFreshdeskAuthHeader(): string {
  const key = process.env.FRESHDESK_API_KEY?.trim();
  if (!key) throw new Error("FRESHDESK_API_KEY not configured");
  const token = Buffer.from(`${key}:X`, "utf8").toString("base64");
  return `Basic ${token}`;
}

export async function GET(req: NextRequest) {
  // Must be authenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return new NextResponse("Missing url param", { status: 400 });
  }

  // Only allow proxying URLs that belong to indulge.freshdesk.com
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (
    parsed.hostname !== "indulge.freshdesk.com" &&
    !parsed.hostname.endsWith(".freshdesk.com") &&
    !parsed.hostname.endsWith(".freshworksapi.com") &&
    !parsed.hostname.endsWith(".amazonaws.com")
  ) {
    return new NextResponse("URL not allowed", { status: 403 });
  }

  let authHeader: string;
  try {
    authHeader = getFreshdeskAuthHeader();
  } catch {
    return new NextResponse("Freshdesk not configured", { status: 500 });
  }

  // Freshdesk attachment URLs are typically pre-signed S3 URLs (amazonaws.com)
  // or served via the Freshdesk CDN. Pre-signed S3 URLs don't need auth,
  // but Freshdesk-served URLs do.
  const isS3 =
    parsed.hostname.endsWith(".amazonaws.com") ||
    parsed.hostname.endsWith(".freshworksapi.com");

  const upstream = await fetch(rawUrl, {
    headers: isS3
      ? {}
      : {
          Authorization: authHeader,
        },
    cache: "no-store",
  });

  if (!upstream.ok) {
    return new NextResponse(`Upstream error: ${upstream.status}`, {
      status: upstream.status,
    });
  }

  const contentType =
    upstream.headers.get("content-type") ?? "application/octet-stream";
  const contentDisposition = upstream.headers.get("content-disposition");

  // Buffer fully — streaming ReadableStream directly can silently fail in
  // Next.js Turbopack dev mode for binary responses.
  const buffer = await upstream.arrayBuffer();

  const headers = new Headers();
  headers.set("content-type", contentType);
  headers.set("content-length", String(buffer.byteLength));
  if (contentDisposition) {
    headers.set("content-disposition", contentDisposition);
  }
  // Cache for 1 hour — attachments are immutable once uploaded
  headers.set("cache-control", "private, max-age=3600");

  return new NextResponse(buffer, {
    status: 200,
    headers,
  });
}
