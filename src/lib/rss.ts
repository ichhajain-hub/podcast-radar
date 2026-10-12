import Parser from "rss-parser";
import { findYouTube, stripHtml } from "./text";

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
};

const parser: Parser<object, RawItem> = new Parser({
  customFields: { item: [["content:encoded", "contentEncoded"], ["itunes:summary", "itunesSummary"]] },
});

export type FeedEpisode = {
  title: string;
  description: string;
  url: string;
  published_at: string;
  youtube_url: string | null;
  audio_url: string | null;
};

/** Fetches and parses a live RSS feed. Large feeds (e.g. 20VC, ~12 MB) get a long timeout. */
export async function fetchFeed(url: string, timeoutMs = 90_000): Promise<{ title: string; episodes: FeedEpisode[] }> {
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
    const rawDesc = i.contentEncoded || i.content || i.itunesSummary || i.contentSnippet || "";
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
