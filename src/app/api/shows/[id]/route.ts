import { NextResponse } from "next/server";
import { isAdmin, unauthorized } from "@/lib/auth";
import { normalizeFeedUrl, showInput, validateFeed } from "@/lib/shows";
import { db } from "@/lib/supabase";

export const maxDuration = 60;

export async function PATCH(req: Request, ctx: RouteContext<"/api/shows/[id]">) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await ctx.params;
  const parsed = showInput.partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const patch: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };
  if ("youtube_channel_url" in patch) patch.youtube_channel_url = patch.youtube_channel_url || null;

  if (parsed.data.rss_url) {
    try {
      const n = await normalizeFeedUrl(parsed.data.rss_url);
      patch.rss_url = parsed.data.rss_url = n.rss_url;
      if (n.youtube_channel_url && !parsed.data.youtube_channel_url) patch.youtube_channel_url = n.youtube_channel_url;
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 422 });
    }
  }
  let check = null;
  const { data: current } = await db().from("shows").select("rss_url, active").eq("id", id).single();
  const urlChanged = parsed.data.rss_url && parsed.data.rss_url !== current?.rss_url;
  const activating = parsed.data.active === true && current?.active === false;
  if (urlChanged || activating) {
    check = await validateFeed(parsed.data.rss_url ?? current!.rss_url);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 422 });
    patch.last_fetch_status = `validated: latest "${check.latest_title}"`;
  }
  const { data, error } = await db().from("shows").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: /duplicate/.test(error.message) ? "That RSS URL is already in the list." : error.message }, { status: 400 });
  return NextResponse.json({ show: data, check });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/shows/[id]">) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await ctx.params;
  // History is permanent: a show with stored episodes can only be switched off, not deleted.
  const { count } = await db().from("episodes").select("id", { count: "exact", head: true }).eq("show_id", id);
  if (count) {
    return NextResponse.json({ error: `This show has ${count} stored episodes in the history, so it can't be deleted. Switch it off (Active) instead.` }, { status: 409 });
  }
  const { error } = await db().from("shows").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
