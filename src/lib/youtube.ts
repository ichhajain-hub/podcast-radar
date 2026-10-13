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
  if (!out.size) for (const v of await channelPageVideos(id)) out.set(v.id, v);
  return [...out.values()];
}

/**
 * Fallback when YouTube's RSS feeds are down (they intermittently return 404): read the channel's
 * public /videos page. Dates there are relative ("5 days ago"), so they are approximate.
 */
export async function channelPageVideos(id: string, withDescriptions = false, sinceMs = 0): Promise<(Video & { description?: string })[]> {
  const html = await fetch(`https://www.youtube.com/channel/${id}/videos`, { headers: BROWSER, signal: AbortSignal.timeout(25_000) }).then((r) => (r.ok ? r.text() : ""));
  const data = initialData(html, "ytInitialData");
  if (!data) return [];
  const vids: (Video & { description?: string })[] = [];
  for (const l of findAll(data, "lockupViewModel")) {
    const vid = l.contentId as string | undefined;
    const md = (l.metadata as Record<string, Record<string, unknown>> | undefined)?.lockupMetadataViewModel;
    const title = (md?.title as { content?: string } | undefined)?.content;
    if (!vid || !title || l.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") continue;
    const labels = JSON.stringify(md?.metadata ?? {}).match(/"accessibilityLabel":"([^"]*ago)"/g) ?? [];
    const ago = labels.map((x) => x.slice(21, -1)).find((x) => /ago$/.test(x));
    vids.push({ id: vid, title, published: ago ? relativeToMs(ago) : null });
  }
  if (withDescriptions) {
    const wanted = vids.filter((v) => (v.published ?? 0) >= sinceMs).slice(0, 15);
    await Promise.all(wanted.map(async (v) => {
      try {
        const page = await fetch(`https://www.youtube.com/watch?v=${v.id}`, { headers: BROWSER, signal: AbortSignal.timeout(15_000) }).then((r) => r.text());
        const player = initialData(page, "ytInitialPlayerResponse") as { videoDetails?: { shortDescription?: string } } | null;
        v.description = player?.videoDetails?.shortDescription ?? "";
        const date = page.match(/"(?:uploadDate|publishDate)":"([^"]+)"/)?.[1];
        if (date && !Number.isNaN(Date.parse(date))) v.published = Date.parse(date);
      } catch { /* keep the title-only entry */ }
    }));
  }
  return vids;
}

const BROWSER = { "accept-language": "en", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" };

function initialData(html: string, name: string): Record<string, unknown> | null {
  const start = html.indexOf(`${name} = {`);
  if (start < 0) return null;
  const from = html.indexOf("{", start);
  const end = html.indexOf("};", from);
  for (let e = end; e > 0 && e < html.length; e = html.indexOf("};", e + 1)) {
    try {
      return JSON.parse(html.slice(from, e + 1));
    } catch { /* the object ends at a later "};" */ }
    if (e - from > 5_000_000) break;
  }
  return null;
}

function findAll(o: unknown, key: string, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(o)) for (const v of o) findAll(v, key, out);
  else if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o)) {
      if (k === key && v && typeof v === "object") out.push(v as Record<string, unknown>);
      else findAll(v, key, out);
    }
  }
  return out;
}

function relativeToMs(text: string): number | null {
  const m = text.match(/(\d+)\s+(second|minute|hour|day|week|month|year)/);
  if (!m) return null;
  const unit = { second: 1e3, minute: 6e4, hour: 36e5, day: DAY, week: 7 * DAY, month: 30 * DAY, year: 365 * DAY }[m[2] as "day"];
  return Date.now() - Number(m[1]) * unit;
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
