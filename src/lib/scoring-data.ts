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
    selectAll<EntityLite>((a, b) =>
      db().from("entities")
        .select("id, type, canonical_name, company, role, website_url, linkedin_url, linkedin_verified, fit, india_fit")
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

  return { shows, entities: new Map(entities.map((e) => [e.id, e])), mentions, windowEpisodes };
}

export async function scoreRange(from: Date, to: Date, weights?: Weights): Promise<ScoreResult> {
  const [data, w] = await Promise.all([loadScoringData(from, to), weights ? Promise.resolve(weights) : loadWeights()]);
  return score(from, to, w, data);
}
