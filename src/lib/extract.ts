import { z } from "zod";
import { generateJson } from "./gemini";
import { db } from "./supabase";
import { clipWords } from "./text";
import type { EntityResolver } from "./entities";

export type Region = "india" | "global" | "own";

export type ShowRow = {
  id: string;
  name: string;
  rss_url: string;
  youtube_channel_url: string | null;
  region: Region;
  active: boolean;
  hosts: string[] | null;
};

export type EpisodeForExtraction = { id: string; title: string; description: string | null; url: string };

const evidence = z.string().describe("Exact short phrase (max 15 words) copied from the text that proves this");

const guest = z.object({
  name: z.string(),
  company: z.string().describe("Company or organisation, empty string if not stated"),
  role: z.string().describe("Role or title, empty string if not stated"),
  evidence,
});
const topic = z.object({
  label: z.string().describe("Short reusable topic label, 2-6 words, lowercase, e.g. 'quick commerce unit economics'"),
  stance: z.enum(["bullish", "bearish", "neutral"]),
  evidence,
});
const brand = z.object({
  name: z.string(),
  kind: z.enum(["paid", "organic"]).describe("paid = sponsor / ad read / 'brought to you by' / promo code; organic = product the host or guest recommends or endorses to listeners without stated payment"),
  confidence: z.number().min(0).max(1),
  is_show_own_or_network: z.boolean().describe("true if the brand is this show's own product, its host's company, or its podcast network"),
  evidence,
});

const fullSchema = z.object({
  episodes: z.array(z.object({ episode_index: z.number().int(), guests: z.array(guest), topics: z.array(topic), brands: z.array(brand) })),
});
const topicsOnlySchema = z.object({
  episodes: z.array(z.object({ episode_index: z.number().int(), topics: z.array(topic) })),
});

function buildPrompt(show: ShowRow, eps: EpisodeForExtraction[], topicsOnly: boolean): string {
  const hosts = (show.hosts ?? []).filter(Boolean);
  const list = eps
    .map((e, i) => `### episode_index ${i}\nTitle: ${e.title}\nURL: ${e.url}\nShow notes:\n${(e.description ?? "").slice(0, 3500)}`)
    .join("\n\n");
  const asks = topicsOnly
    ? `For each episode return:
- topics: 3-5 short, reusable topic labels (e.g. "quick commerce unit economics"), each with stance (bullish / bearish / neutral) and evidence.`
    : `For each episode return:
- guests: only people interviewed on this episode — never the host${hosts.length ? ` (hosts: ${hosts.join(", ")})` : ""}. Include company and role only if stated.
- topics: 3-5 short, reusable topic labels (e.g. "quick commerce unit economics"), each with stance (bullish / bearish / neutral) and evidence.
- brands: ONLY brands that are advertised or endorsed to listeners — sponsor reads, ads, "brought to you by", "thanks to our partner", promo codes, discount links (kind "paid"), or products the host/guest explicitly recommends to listeners (kind "organic").
  Do NOT include companies merely mentioned as a guest's employer, an investor's portfolio, a competitor, or the subject of discussion — those are not brand placements.
  confidence 0-1 = how sure you are it is a sponsor read / endorsement of that kind. Mark is_show_own_or_network when it is the show's own product, the host's company, or the podcast network.`;
  return `You extract structured facts from podcast show notes for "${show.name}" (${show.region === "global" ? "a global business podcast" : "an Indian business/startup podcast"}).

Only extract what is explicitly stated in the text. If unsure, omit it. Never invent names.
Evidence must be a short phrase (max 15 words) copied from the show notes.

${asks}

Return one entry per episode, using its episode_index.

${list}`;
}

/** Runs extraction for up to 8 episodes in one Gemini call and stores the mentions. */
export async function extractBatch(
  show: ShowRow,
  eps: EpisodeForExtraction[],
  resolver: EntityResolver,
  runId: string | null,
): Promise<{ guests: number; topics: number; brands: number }> {
  const topicsOnly = show.region === "global";
  const counts = { guests: 0, topics: 0, brands: 0 };
  const prompt = buildPrompt(show, eps, topicsOnly);
  const note = `${show.name}: ${eps.length} eps`;

  type Out = { episode_index: number; guests?: z.infer<typeof guest>[]; topics: z.infer<typeof topic>[]; brands?: z.infer<typeof brand>[] };
  const result: { episodes: Out[] } = topicsOnly
    ? await generateJson({ task: "extract", runId, prompt, schema: topicsOnlySchema, note })
    : await generateJson({ task: "extract", runId, prompt, schema: fullSchema, note });

  const hostNames = new Set((show.hosts ?? []).map((h) => h.toLowerCase()));
  const rows: Record<string, unknown>[] = [];

  for (const out of result.episodes) {
    const ep = eps[out.episode_index];
    if (!ep) continue;
    for (const g of out.guests ?? []) {
      if (!g.name.trim() || hostNames.has(g.name.trim().toLowerCase())) continue;
      const id = await resolver.resolve("guest", g.name, { company: g.company || null, role: g.role || null });
      if (!id) continue;
      rows.push({ episode_id: ep.id, entity_id: id, kind: "guest", source: "notes", evidence: clipWords(g.evidence) });
      counts.guests++;
    }
    for (const t of out.topics.slice(0, 5)) {
      const id = await resolver.resolve("topic", t.label);
      if (!id) continue;
      rows.push({ episode_id: ep.id, entity_id: id, kind: "topic", source: "notes", stance: t.stance, evidence: clipWords(t.evidence) });
      counts.topics++;
    }
    for (const b of out.brands ?? []) {
      if (b.is_show_own_or_network || !b.name.trim()) continue;
      const id = await resolver.resolve("brand", b.name);
      if (!id) continue;
      rows.push({ episode_id: ep.id, entity_id: id, kind: b.kind, source: "notes", confidence: b.confidence, evidence: clipWords(b.evidence) });
      counts.brands++;
    }
  }

  // One mention per (episode, entity, kind); duplicates inside the batch are collapsed first.
  const unique = [...new Map(rows.map((r) => [`${r.episode_id}|${r.entity_id}|${r.kind}`, r])).values()];
  if (unique.length) {
    const { error } = await db().from("mentions").upsert(unique, { onConflict: "episode_id,entity_id,kind", ignoreDuplicates: true });
    if (error) throw new Error(`saving mentions: ${error.message}`);
  }
  const { error } = await db().from("episodes").update({ extracted_at: new Date().toISOString() }).in("id", eps.map((e) => e.id));
  if (error) throw new Error(`marking extracted: ${error.message}`);
  return counts;
}
