import { EntityResolver } from "./entities";
import { extractBatch, type EpisodeForExtraction, type ShowRow } from "./extract";
import { fetchFeed } from "./rss";
import { db } from "./supabase";

export const WINDOW_DAYS: Record<ShowRow["region"], number> = { india: 30, own: 30, global: 14 };
const BATCH = 8;

export type IngestResult = {
  show: string;
  ok: boolean;
  feed_episodes: number;
  in_window: number;
  new_episodes: number;
  extracted: number;
  pending_extraction: number;
  mentions: { guests: number; topics: number; brands: number };
  ms: number;
  error?: string;
};

/**
 * Ingests one show: fetch RSS -> upsert episodes in the window -> extract unprocessed episodes.
 * Stops starting new Gemini batches after `budgetMs` so the function never times out;
 * anything left over has extracted_at = null and is picked up by the next run.
 */
export async function ingestShow(
  show: ShowRow,
  opts: { runId?: string | null; sinceDays?: number; budgetMs?: number } = {},
): Promise<IngestResult> {
  const t0 = Date.now();
  const runId = opts.runId ?? null;
  const days = opts.sinceDays ?? WINDOW_DAYS[show.region];
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const budget = opts.budgetMs ?? 220_000;
  const res: IngestResult = {
    show: show.name, ok: true, feed_episodes: 0, in_window: 0, new_episodes: 0,
    extracted: 0, pending_extraction: 0, mentions: { guests: 0, topics: 0, brands: 0 }, ms: 0,
  };

  const feed = await fetchFeed(show.rss_url);
  res.feed_episodes = feed.episodes.length;
  const recent = feed.episodes.filter((e) => e.published_at >= since);
  res.in_window = recent.length;

  if (recent.length) {
    const rows = [...new Map(recent.map((e) => [e.url, { ...e, show_id: show.id }])).values()];
    const { data, error } = await db()
      .from("episodes")
      .upsert(rows, { onConflict: "url", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`saving episodes: ${error.message}`);
    res.new_episodes = data?.length ?? 0;
  }

  const { data: todo, error } = await db()
    .from("episodes")
    .select("id, title, description, url")
    .eq("show_id", show.id)
    .is("extracted_at", null)
    .gte("published_at", since)
    .order("published_at", { ascending: false });
  if (error) throw new Error(`loading episodes: ${error.message}`);

  const resolver = new EntityResolver(runId);
  const queue = (todo ?? []) as EpisodeForExtraction[];
  for (let i = 0; i < queue.length; i += BATCH) {
    if (Date.now() - t0 > budget) break;
    const batch = queue.slice(i, i + BATCH);
    const c = await extractBatch(show, batch, resolver, runId);
    res.extracted += batch.length;
    res.mentions.guests += c.guests;
    res.mentions.topics += c.topics;
    res.mentions.brands += c.brands;
  }
  res.pending_extraction = queue.length - res.extracted;
  res.ms = Date.now() - t0;
  return res;
}

export function fetchStatus(r: IngestResult): string {
  const when = new Date().toISOString().slice(0, 16).replace("T", " ");
  if (!r.ok) return `error ${when} UTC: ${r.error}`;
  return `ok ${when} UTC · ${r.in_window} recent eps, ${r.new_episodes} new, ${r.extracted} extracted${r.pending_extraction ? `, ${r.pending_extraction} queued` : ""}`;
}
