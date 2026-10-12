import { NextResponse } from "next/server";
import { isAdmin, unauthorized } from "@/lib/auth";
import { normalizeFeedUrl, showInput, validateFeed } from "@/lib/shows";
import { db } from "@/lib/supabase";

export const maxDuration = 60;

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const { data, error } = await db().from("shows").select("*").order("region").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shows: data });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const parsed = showInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const n = await normalizeFeedUrl(parsed.data.rss_url);
    parsed.data.rss_url = n.rss_url;
    if (n.youtube_channel_url && !parsed.data.youtube_channel_url) parsed.data.youtube_channel_url = n.youtube_channel_url;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
  const check = await validateFeed(parsed.data.rss_url);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 422 });
  const { data, error } = await db().from("shows").insert({
    ...parsed.data, youtube_channel_url: parsed.data.youtube_channel_url || null,
    last_fetch_status: `validated: latest "${check.latest_title}"`, updated_at: new Date().toISOString(),
  }).select("*").single();
  if (error) return NextResponse.json({ error: /duplicate/.test(error.message) ? "That RSS URL is already in the list." : error.message }, { status: 400 });
  return NextResponse.json({ show: data, check });
}
