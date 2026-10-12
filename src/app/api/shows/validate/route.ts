import { NextResponse } from "next/server";
import { isAdmin, unauthorized } from "@/lib/auth";
import { validateFeed } from "@/lib/shows";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const { rss_url } = (await req.json().catch(() => ({}))) as { rss_url?: string };
  if (!rss_url) return NextResponse.json({ ok: false, error: "Enter an RSS URL" }, { status: 400 });
  return NextResponse.json(await validateFeed(rss_url));
}
