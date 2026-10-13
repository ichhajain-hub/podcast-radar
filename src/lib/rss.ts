import Parser from "rss-parser";
import { findYouTube, stripHtml } from "./text";
import { channelPageVideos } from "./youtube";

type RawItem = {
  title?: string;
  link?: string;
  guid?: string;
  isoDate?: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  contentEncoded?: string;
  itunesSummary?: string;
  enclosure?: { url?: string };
  /** YouTube channel feeds (Atom) keep the video description in <media:group><media:description>. */
  mediaGroup?: { "media:description"?: string[] };
};

const parser: Parser<object, RawItem> = new Parser({
  customFields: { item: [["content:encoded", "contentEncoded"], ["itunes:summary", "itunesSummary"], ["media:group", "mediaGroup"]] },
});

export type FeedEpisode = {
  title: string;
  description: string;
  url: string;
  published_at: string;
  youtube_url: string | null;
  audio_url: string | null;
};

/**
 * Fetches and parses a live feed: podcast RSS, or a YouTube channel's uploads feed (Atom, 15 newest
 * videos) for shows that only publish on YouTube. Large feeds (e.g. 20VC, ~12 MB) get a long timeout.
 */
export async function fetchFeed(url: string, timeoutMs = 90_000): Promise<{ title: string; episodes: FeedEpisode[] }> {
  try {
    return await fetchOne(url, timeoutMs);
  } catch (e) {
    // YouTube sometimes refuses the long-form uploads feed (playlist UULF…) to cloud servers;
    // fall back to the channel's standard feed, which lists the same videos plus Shorts.
    const m = url.match(/youtube\.com\/feeds\/videos\.xml\?(?:playlist_id=UULF|channel_id=UC)([\w-]{22})/);
    if (!m) throw e;
    try {
      const feed = await fetchOne(`https://www.youtube.com/feeds/videos.xml?channel_id=UC${m[1]}`, timeoutMs);
      return { ...feed, episodes: feed.episodes.filter((ep) => !/#shorts/i.test(ep.title)) };
    } catch {
      // Both feeds down: read the channel's public videos page (with each recent video's description).
      const vids = await channelPageVideos(`UC${m[1]}`, true, Date.now() - 31 * 864e5);
      if (!vids.length) throw e;
      return {
        title: "YouTube channel",
        episodes: vids.filter((v) => v.published != null && !/#shorts/i.test(v.title)).map((v) => ({
          title: v.title,
          description: (v.description ?? "").slice(0, 6000),
          url: `https://www.youtube.com/watch?v=${v.id}`,
          published_at: new Date(v.published!).toISOString(),
          youtube_url: `https://www.youtube.com/watch?v=${v.id}`,
          audio_url: null,
        })),
      };
    }
  }
}

async function fetchOne(url: string, timeoutMs: number): Promise<{ title: string; episodes: FeedEpisode[] }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
    headers: {
      "user-agent": "PodcastRadar/1.0 (+https://podcast-radar-psi.vercel.app)",
      accept: "application/rss+xml, application/xml, text/xml, */*",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching feed`);
  const feed = await parser.parseString(await res.text());
  const items = feed.items ?? [];

  // Some feeds reuse one <link> for every episode; fall back to the audio URL or guid then.
  const linkCounts = new Map<string, number>();
  for (const i of items) if (i.link) linkCounts.set(i.link, (linkCounts.get(i.link) ?? 0) + 1);

  const episodes: FeedEpisode[] = [];
  for (const i of items) {
    const published = i.isoDate ?? (i.pubDate ? new Date(i.pubDate).toISOString() : null);
    const title = i.title?.trim();
    if (!published || !title || Number.isNaN(Date.parse(published))) continue;
    const rawDesc = i.contentEncoded || i.content || i.itunesSummary || i.mediaGroup?.["media:description"]?.[0] || i.contentSnippet || "";
    const uniqueLink = i.link && (linkCounts.get(i.link) ?? 0) === 1 ? i.link : null;
    const epUrl = uniqueLink ?? i.enclosure?.url ?? (i.guid?.startsWith("http") ? i.guid : null) ?? i.link;
    if (!epUrl) continue;
    episodes.push({
      title,
      description: stripHtml(rawDesc).slice(0, 6000),
      url: epUrl,
      published_at: published,
      youtube_url: findYouTube(`${rawDesc} ${i.link ?? ""} ${i.guid ?? ""}`),
      audio_url: i.enclosure?.url ?? null,
    });
  }
  return { title: feed.title ?? "", episodes };
}
