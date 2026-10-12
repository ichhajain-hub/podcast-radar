import { z } from "zod";
import { generateJson } from "./gemini";
import { db } from "./supabase";
import { normName } from "./text";

// Links RSS episodes to their public YouTube videos. Most podcast feeds don't include the
// YouTube link, so we read the show's recent channel uploads and match them to episodes.

const UA = { "accept-language": "en", "user-agent": "Mozilla/5.0 (PodcastRadar)" };
const DAY = 864e5;

export async function channelId(url: string): Promise<string | null> {
  const direct = url.match(/channel\/(UC[\w-]{22})/)?.[1];
  if (direct) return direct;
  const html = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) }).then((r) => r.text());
  return html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ?? html.match(/channel\/(UC[\w-]{22})/)?.[1] ?? null;
}

type Video = { id: string; title: string; published: number | null };

/**
 * Recent uploads with exact dates: the channel's long-form uploads playlist (UULF…, no Shorts)
 * plus the channel feed, 15 newest each.
 */
export async function channelVideos(id: string): Promise<Video[]> {
  const out = new Map<string, Video>();
  const feeds = [`playlist_id=UULF${id.slice(2)}`, `channel_id=${id}`];
  for (const q of feeds) {
    try {
      const xml = await fetch(`https://www.youtube.com/feeds/videos.xml?${q}`, { headers: UA, signal: AbortSignal.timeout(20_000) }).then((r) => (r.ok ? r.text() : ""));
      for (const e of xml.split("<entry>").slice(1)) {
        const vid = e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
        const title = e.match(/<title>([^<]*)<\/title>/)?.[1];
        const pub = e.match(/<published>([^<]+)<\/published>/)?.[1];
        if (!vid || !title || out.has(vid) || /#shorts/i.test(title)) continue;
        out.set(vid, { id: vid, title: decode(title), published: pub ? Date.parse(pub) : null });
      }
    } catch { /* try the next feed */ }
  }
  return [...out.values()];
}

function decode(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

const STOP = new Set(["the", "and", "with", "for", "how", "why", "what", "this", "that", "are", "you", "your", "from", "who", "has", "his", "her", "its", "was", "will", "podcast", "episode", "ft", "feat", "show"]);

function tokens(title: string, drop: Set<string>): Set<string> {
  return new Set(normName(title).replace(/\b(ep|fo|e)\s?\d+\b/g, " ").split(" ").filter((w) => w.length >= 3 && !STOP.has(w) && !drop.has(w)));
}

/** Share of the shorter title's words found in the other title. */
export function titleSimilarity(a: string, b: string, drop = new Set<string>()): number {
  const x = tokens(a, drop);
  const y = tokens(b, drop);
  if (!x.size || !y.size) return 0;
  let hit = 0;
  for (const w of x) if (y.has(w)) hit++;
  return hit / Math.min(x.size, y.size);
}

/** Fills episodes.youtube_url for a show's recent episodes by matching titles to channel videos. */
export async function matchShowVideos(
  show: { id: string; name: string; hosts: string[] | null; youtube_channel_url: string | null },
  sinceIso: string,
  runId: string | null = null,
): Promise<number> {
  if (!show.youtube_channel_url) return 0;
  const { data: eps } = await db().from("episodes").select("id, title, published_at")
    .eq("show_id", show.id).is("youtube_url", null).gte("published_at", sinceIso);
  if (!eps?.length) return 0;
  const id = await channelId(show.youtube_channel_url);
  if (!id) return 0;
  const videos = await channelVideos(id);
  const drop = new Set([...normName(show.name).split(" "), ...(show.hosts ?? []).flatMap((h) => normName(h).split(" "))]);

  let matched = 0;
  const used = new Set<string>();
  const leftovers: typeof eps = [];
  for (const ep of eps) {
    const t = Date.parse(ep.published_at);
    let best: { v: Video; s: number } | null = null;
    for (const v of videos) {
      if (used.has(v.id)) continue;
      if (v.published != null && Math.abs(v.published - t) > 6 * DAY) continue;
      const s = titleSimilarity(ep.title, v.title, drop);
      if (s >= 0.6 && (!best || s > best.s)) best = { v, s };
    }
    if (best) {
      used.add(best.v.id);
      await db().from("episodes").update({ youtube_url: `https://www.youtube.com/watch?v=${best.v.id}` }).eq("id", ep.id);
      matched++;
    } else leftovers.push(ep);
  }

  // Channels often retitle uploads; let Gemini pair what the word overlap couldn't.
  const open = videos.filter((v) => !used.has(v.id));
  if (leftovers.length && open.length) {
    const pairs = await pairWithGemini(show.name, leftovers, open, runId);
    for (const [epIdx, vidIdx] of pairs) {
      const ep = leftovers[epIdx];
      const v = open[vidIdx];
      if (!ep || !v || used.has(v.id)) continue;
      if (v.published != null && Math.abs(v.published - Date.parse(ep.published_at)) > 7 * DAY) continue;
      used.add(v.id);
      await db().from("episodes").update({ youtube_url: `https://www.youtube.com/watch?v=${v.id}` }).eq("id", ep.id);
      matched++;
    }
  }
  return matched;
}

const pairSchema = z.object({ pairs: z.array(z.object({ episode: z.number().int(), video: z.number().int() })) });

async function pairWithGemini(showName: string, eps: { title: string; published_at: string }[], videos: Video[], runId: string | null) {
  const day = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : "?");
  const out = await generateJson({
    task: "match_youtube", runId, schema: pairSchema, note: `${showName}: ${eps.length} eps vs ${videos.length} videos`,
    prompt: `Podcast "${showName}" publishes each episode as an audio podcast and as a full-length YouTube video, often with a different title.
Pair each podcast episode with the YouTube video of the SAME full conversation (same guest and subject, published within a few days).
Skip clips, trailers and highlights. Only pair when clearly the same episode; leave the rest out.

Podcast episodes:
${eps.map((e, i) => `${i}. [${e.published_at.slice(0, 10)}] ${e.title}`).join("\n")}

YouTube videos:
${videos.map((v, i) => `${i}. [${day(v.published)}] ${v.title}`).join("\n")}

Return { pairs: [{ episode, video }] } using the numbers above.`,
  });
  return out.pairs.map((p) => [p.episode, p.video] as const);
}
