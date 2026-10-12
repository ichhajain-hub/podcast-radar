import { z } from "zod";
import { fetchFeed } from "./rss";
import { channelId } from "./youtube";

/**
 * A YouTube channel link (…/channel/UC…, …/@handle) is turned into that channel's long-form
 * uploads feed, so YouTube-only shows can be tracked like podcasts.
 */
export async function normalizeFeedUrl(url: string): Promise<{ rss_url: string; youtube_channel_url?: string }> {
  const u = url.trim();
  if (!/youtube\.com\/(channel\/|@|c\/|user\/)/i.test(u) || /feeds\/videos\.xml/i.test(u)) return { rss_url: u };
  const id = await channelId(u);
  if (!id) throw new Error("Couldn't find that YouTube channel.");
  return { rss_url: `https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${id.slice(2)}`, youtube_channel_url: `https://www.youtube.com/channel/${id}` };
}

export const showInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  rss_url: z.string().trim().url("RSS URL must be a full https:// link"),
  youtube_channel_url: z.string().trim().url("YouTube URL must be a full link").or(z.literal("")).nullable().optional(),
  region: z.enum(["india", "global", "own"]),
  active: z.boolean().optional(),
  hosts: z.array(z.string().trim().min(1)).max(10).optional(),
});

/** Fetches a feed server-side and returns its latest episode title, or a readable error. */
export async function validateFeed(url: string): Promise<{ ok: true; feed_title: string; latest_title: string; latest_date: string } | { ok: false; error: string }> {
  try {
    const feed = await fetchFeed(url, 45_000);
    const latest = [...feed.episodes].sort((a, b) => b.published_at.localeCompare(a.published_at))[0];
    if (!latest) return { ok: false, error: "The feed loaded but has no episodes." };
    return { ok: true, feed_title: feed.title, latest_title: latest.title, latest_date: latest.published_at };
  } catch (e) {
    const msg = (e as Error).message;
    return { ok: false, error: /timeout|aborted/i.test(msg) ? "The feed took too long to load (45 s)." : `The feed didn't load: ${msg}` };
  }
}
