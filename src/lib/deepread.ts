import { MediaResolution } from "@google/genai";
import { z } from "zod";
import { EntityResolver } from "./entities";
import { generateJson } from "./gemini";
import { getSetting } from "./settings";
import { db } from "./supabase";
import { clipWords } from "./text";

// Sponsor deep-read (spec 5.4): Gemini watches the public YouTube video at LOW media
// resolution (~100 tokens per second, so a 3-hour episode fits in 1M tokens) and lists
// spoken sponsor reads and brand endorsements with timestamps.

const schema = z.object({
  brands: z.array(z.object({
    name: z.string(),
    kind: z.enum(["paid", "organic"]),
    confidence: z.number().min(0).max(1),
    timestamp_seconds: z.number().int().min(0),
    is_show_own_or_network: z.boolean(),
    evidence: z.string().describe("What is said, max 15 words"),
  })),
});

export type DeepReadResult = { episode_id: string; ok: boolean; brands: number; minutes_cap: number; note?: string };

export const DEEP_READ_MAX_ATTEMPTS = 3;
const STUCK_MS = 10 * 60_000;

/** India episodes with a YouTube link that still need (or should retry) a deep-read. */
export async function deepReadQueue(sinceIso: string, limit = 50): Promise<string[]> {
  const { data } = await db().from("episodes")
    .select("id, deep_read_status, deep_read_attempts, deep_read_started_at, published_at, shows!inner(region, active)")
    .eq("shows.region", "india").eq("shows.active", true)
    .not("youtube_url", "is", null).is("deep_read_at", null).gte("published_at", sinceIso)
    .order("published_at", { ascending: false }).limit(200);
  const now = Date.now();
  return (data ?? [])
    .filter((e) => {
      if ((e.deep_read_attempts ?? 0) >= DEEP_READ_MAX_ATTEMPTS) return false;
      if (e.deep_read_status === "running") return now - Date.parse(e.deep_read_started_at ?? "1970-01-01") > STUCK_MS;
      return true;
    })
    .slice(0, limit)
    .map((e) => e.id as string);
}

export async function deepRead(episodeId: string, runId: string | null): Promise<DeepReadResult> {
  const { data: ep } = await db().from("episodes")
    .select("id, title, youtube_url, deep_read_attempts, shows!inner(name, region, hosts)").eq("id", episodeId).single();
  const capMin = Number(await getSetting("deep_read_max_minutes", 170)) || 0;
  if (!ep?.youtube_url) return { episode_id: episodeId, ok: false, brands: 0, minutes_cap: capMin, note: "no YouTube link" };
  const show = ep.shows as unknown as { name: string; region: string; hosts: string[] | null };

  await db().from("episodes").update({
    deep_read_status: "running", deep_read_started_at: new Date().toISOString(), deep_read_attempts: (ep.deep_read_attempts ?? 0) + 1,
  }).eq("id", episodeId);

  try {
    const out = await generateJson({
      task: "deep_read", runId, schema, note: `${show.name}: ${ep.title.slice(0, 60)}`,
      parts: [{
        fileData: { fileUri: ep.youtube_url, mimeType: "video/*" },
        ...(capMin > 0 ? { videoMetadata: { endOffset: `${capMin * 60}s` } } : {}),
      }],
      config: { mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW },
      prompt: `This is an episode of the Indian podcast "${show.name}"${show.hosts?.length ? ` (host: ${show.hosts.join(", ")})` : ""}.
List every SPOKEN sponsor read or ad — "this episode is brought to you by", "thanks to our partner", promo codes, discount links, mid-roll ads (kind "paid") —
and every product the host or guest explicitly recommends to listeners (kind "organic").
Do not list companies that are merely discussed, a guest's employer, or investments, and do not list "listen/watch us on Spotify / Apple Podcasts / YouTube" distribution notes.
For each: brand name, kind, confidence 0-1, timestamp_seconds where it starts, is_show_own_or_network (the show's own product, the host's company, or its podcast network), and evidence: what is said, max 15 words.
Only list what is actually said or shown. If unsure, omit it. Never invent brands. Return { brands: [] } if there are none.`,
    });

    const keep = out.brands.filter((b) => !b.is_show_own_or_network && b.name.trim());
    const ids = await new EntityResolver(runId).resolveMany("brand", keep.map((b) => ({ name: b.name })));
    const rows = keep.map((b, i) => ids[i] && ({
      episode_id: episodeId, entity_id: ids[i], kind: b.kind, source: "video", confidence: b.confidence,
      timestamp_seconds: b.timestamp_seconds, evidence: clipWords(b.evidence),
    })).filter(Boolean) as Record<string, unknown>[];
    const unique = [...new Map(rows.map((r) => [`${r.entity_id}|${r.kind}`, r])).values()];
    if (unique.length) {
      // A brand already found in the show notes gets upgraded with the video timestamp.
      const { error } = await db().from("mentions").upsert(unique, { onConflict: "episode_id,entity_id,kind" });
      if (error) throw new Error(`saving mentions: ${error.message}`);
    }
    await db().from("episodes").update({
      deep_read_at: new Date().toISOString(), deep_read_status: "ok", deep_read_note: `${unique.length} brands${capMin ? `, first ${capMin} min` : ", full video"}`,
    }).eq("id", episodeId);
    return { episode_id: episodeId, ok: true, brands: unique.length, minutes_cap: capMin };
  } catch (e) {
    const note = (e as Error).message.slice(0, 300);
    await db().from("episodes").update({ deep_read_status: "failed", deep_read_note: note }).eq("id", episodeId);
    return { episode_id: episodeId, ok: false, brands: 0, minutes_cap: capMin, note };
  }
}
