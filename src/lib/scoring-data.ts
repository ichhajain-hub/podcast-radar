import { score, type EntityLite, type MentionLite, type ScoreResult, type ScoringData, type ShowLite } from "./score";
import { db, selectAll } from "./supabase";
import { loadWeights, type Weights } from "./weights";

const DAY = 864e5;

/** Loads everything score() needs for a window ending at `to` (13 months of history for the gates). */
export async function loadScoringData(from: Date, to: Date): Promise<ScoringData> {
  const since = new Date(Math.min(to.getTime() - 400 * DAY, from.getTime() - 5 * (to.getTime() - from.getTime()))).toISOString();
  const until = to.toISOString();

  const [shows, entities, mentions, windowEpisodes] = await Promise.all([
    selectAll<ShowLite>((a, b) => db().from("shows").select("id, name, region, hosts").order("id").range(a, b)),
    selectAll<EntityLite & { merged_into: string | null }>((a, b) =>
      db().from("entities")
        .select("id, type, canonical_name, company, role, website_url, linkedin_url, linkedin_verified, fit, india_fit, merged_into")
        .order("id").range(a, b),
    ),
    selectAll<MentionLite & { id: string }>((a, b) =>
      db().from("mentions")
        .select("id, entity_id, kind, source, confidence, evidence, timestamp_seconds, stance, episode:episodes!inner(id, show_id, title, url, youtube_url, published_at)")
        .gte("episode.published_at", since)
        .lt("episode.published_at", until)
        .order("id").range(a, b) as never,
    ),
    selectAll<{ id: string; show_id: string }>((a, b) =>
      db().from("episodes").select("id, show_id").gte("published_at", from.toISOString()).lt("published_at", until).order("id").range(a, b),
    ),
  ]);

  // Merged duplicates point at their canonical entity; score everything under the canonical id.
  const byId = new Map(entities.map((e) => [e.id, e]));
  const root = (id: string) => {
    let e = byId.get(id);
    for (let hops = 0; e?.merged_into && hops < 10; hops++) e = byId.get(e.merged_into);
    return e?.id ?? id;
  };
  for (const m of mentions) m.entity_id = root(m.entity_id);
  // A merged duplicate can make two mentions of one entity in one episode; keep one per kind.
  const seen = new Set<string>();
  const unique = mentions.filter((m) => {
    const k = `${m.episode.id}|${m.entity_id}|${m.kind}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    shows,
    entities: new Map(entities.filter((e) => !e.merged_into).map((e) => [e.id, e])),
    mentions: unique,
    windowEpisodes,
  };
}

export async function scoreRange(from: Date, to: Date, weights?: Weights): Promise<ScoreResult> {
  const [data, w] = await Promise.all([loadScoringData(from, to), weights ? Promise.resolve(weights) : loadWeights()]);
  return score(from, to, w, data);
}
