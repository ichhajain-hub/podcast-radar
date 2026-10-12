import { normName, withTimestamp } from "./text";
import type { Weights } from "./weights";

// The one scoring function (section 6). Pure: same inputs -> same output.
// Used by the daily run, the weekly brief and the dashboard's Explore view.

export type Region = "india" | "global" | "own";
export type ShowLite = { id: string; name: string; region: Region; hosts: string[] | null };
export type EpisodeLite = { id: string; show_id: string; title: string; url: string; youtube_url: string | null; audio_url?: string | null; published_at: string };
export type MentionLite = {
  entity_id: string;
  kind: "guest" | "topic" | "paid" | "organic";
  source: "notes" | "video";
  confidence: number | null;
  evidence: string | null;
  timestamp_seconds: number | null;
  stance: string | null;
  episode: EpisodeLite;
};
export type EntityLite = {
  id: string;
  type: "guest" | "topic" | "brand";
  canonical_name: string;
  company: string | null;
  role: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  linkedin_verified: boolean | null;
  fit: number | null;
  india_fit: number | null;
};
export type ScoringData = {
  shows: ShowLite[];
  entities: Map<string, EntityLite>;
  mentions: MentionLite[];
  /** Episodes published in [from, to) — for the "episodes scanned" header. */
  windowEpisodes: { id: string; show_id: string }[];
};

export type Source = {
  show_name: string;
  episode_title: string;
  url: string;
  published_at: string;
  timestamp_seconds?: number | null;
  evidence: string | null;
  source: "notes" | "video";
};

type Base = {
  entity_id: string;
  name: string;
  score: number;
  components: Record<string, number>;
  sources: Source[];
  shows: string[];
};
export type GuestItem = Base & {
  company: string | null;
  role: string | null;
  appearances: number;
  linkedin_url: string | null;
  linkedin_verified: boolean;
  website_url: string | null;
  fit_pending: boolean;
};
export type TopicItem = Base & { show_count: number; label: "ride" | "counter"; stances: Record<string, number>; trend: number[] };
export type SponsorItem = Base & { paid: boolean; show_count: number; first_seen: string; trend: number[]; fit_pending: boolean };
export type GlobalItem = Base & { global_count: number; india_count: number; fit_pending: boolean };

export type ScoreResult = {
  from: string;
  to: string;
  guests: GuestItem[];
  topics: TopicItem[];
  sponsors: SponsorItem[];
  global: GlobalItem[];
  stats: { guests_on_media_rounds: number; brands_spending: number; shows_scanned: number; episodes_scanned: number };
  /** Thresholds used for this result, so views can label the gate correctly. */
  rules?: { guest_min_shows: number };
};

export type ScoreOptions = {
  /** Guest gate: distinct India shows in 30 days (spec default 2; editable in Settings). */
  guestMinShows?: number;
};

export const TOP_N = { guests: 3, topics: 3, sponsors: 3, global: 2 } as const;

const DAY = 864e5;
const r1 = (x: number) => Math.round(x * 10) / 10;
const fitOrNeutral = (x: number | null) => (x == null ? 3 : Math.min(5, Math.max(1, x)));

export function score(from: Date, to: Date, weights: Weights, data: ScoringData, opts: ScoreOptions = {}): ScoreResult {
  const guestMinShows = Math.max(1, Math.round(opts.guestMinShows ?? 2));
  const F = from.getTime();
  const T = to.getTime();
  const L = Math.max(T - F, DAY);
  const w = weights;
  const showById = new Map(data.shows.map((s) => [s.id, s]));
  const hostNames = new Set(data.shows.flatMap((s) => s.hosts ?? []).map(normName));
  const region = (m: MentionLite) => showById.get(m.episode.show_id)?.region;
  const t = (m: MentionLite) => Date.parse(m.episode.published_at);
  const within = (m: MentionLite, a: number, b: number) => t(m) >= a && t(m) < b;
  const distinctShows = (ms: MentionLite[]) => new Set(ms.map((m) => m.episode.show_id));
  const showNames = (ids: Set<string>) => [...ids].map((id) => showById.get(id)?.name ?? "Unknown show").sort();

  const sourcesOf = (ms: MentionLite[]): Source[] => {
    const byEp = new Map<string, Source>();
    for (const m of [...ms].sort((a, b) => t(b) - t(a))) {
      const prev = byEp.get(m.episode.id);
      if (prev && (prev.timestamp_seconds != null || m.timestamp_seconds == null)) continue;
      const video = m.source === "video" && m.episode.youtube_url;
      byEp.set(m.episode.id, {
        show_name: showById.get(m.episode.show_id)?.name ?? "Unknown show",
        episode_title: m.episode.title,
        // The public YouTube video is the most reliable link (feed pages, e.g. old Spotify-for-Podcasters URLs, can 404).
        url: video ? withTimestamp(m.episode.youtube_url!, m.timestamp_seconds) : m.episode.youtube_url ?? webOrAudio(m.episode),
        published_at: m.episode.published_at,
        timestamp_seconds: m.timestamp_seconds,
        evidence: m.evidence,
        source: m.source,
      });
    }
    return [...byEp.values()];
  };

  // Weekly show counts for the 8 weeks ending at `to` (oldest first), for trend lines.
  const trend = (ms: MentionLite[]) =>
    Array.from({ length: 8 }, (_, i) => {
      const k = 7 - i;
      return distinctShows(ms.filter((m) => within(m, T - (k + 1) * 7 * DAY, T - k * 7 * DAY))).size;
    });

  const byEntity = new Map<string, MentionLite[]>();
  for (const m of data.mentions) {
    if (t(m) >= T) continue;
    const list = byEntity.get(m.entity_id);
    if (list) list.push(m);
    else byEntity.set(m.entity_id, [m]);
  }

  const guests: GuestItem[] = [];
  const topics: TopicItem[] = [];
  const sponsors: SponsorItem[] = [];
  const global: GlobalItem[] = [];

  for (const [entityId, all] of byEntity) {
    const e = data.entities.get(entityId);
    if (!e) continue;

    if (e.type === "guest") {
      const gm = all.filter((m) => m.kind === "guest");
      const in30 = gm.filter((m) => within(m, T - 30 * DAY, T) && region(m) === "india");
      const shows = distinctShows(in30);
      if (shows.size < guestMinShows) continue;
      if (hostNames.has(normName(e.canonical_name))) continue;
      if (gm.some((m) => region(m) === "own" && within(m, T - 365 * DAY, T))) continue;

      const eps = new Set(in30.map((m) => m.episode.id));
      const recentEps = new Set(in30.filter((m) => within(m, T - 14 * DAY, T)).map((m) => m.episode.id));
      const before = new Set(gm.filter((m) => t(m) < T - 30 * DAY).map((m) => m.episode.id)).size;
      const spreadPts = Math.min(shows.size, 4) * 10; // 1 = 10, 2 = 20, 3 = 30, 4+ = 40
      const c = {
        guest_spread: r1((w.guest_spread * spreadPts) / 40),
        guest_recency: r1(w.guest_recency * (recentEps.size / eps.size)),
        guest_ahead_of_curve: r1(before <= 1 ? w.guest_ahead_of_curve : before <= 3 ? w.guest_ahead_of_curve / 2 : 0),
        guest_fit: r1((w.guest_fit * fitOrNeutral(e.fit)) / 5),
      };
      guests.push({
        entity_id: entityId, name: e.canonical_name, score: r1(sum(c)), components: c,
        sources: sourcesOf(gm.filter((m) => within(m, T - 30 * DAY, T))), shows: showNames(shows),
        company: e.company, role: e.role, appearances: eps.size,
        linkedin_url: e.linkedin_url, linkedin_verified: !!e.linkedin_verified, website_url: e.website_url,
        fit_pending: e.fit == null,
      });
    }

    if (e.type === "topic") {
      const tm = all.filter((m) => m.kind === "topic");
      // India topics: momentum score
      const week = tm.filter((m) => within(m, F, T) && region(m) === "india");
      const weekShows = distinctShows(week);
      if (weekShows.size >= 2) {
        let prev = 0;
        for (let k = 1; k <= 4; k++) {
          prev += distinctShows(tm.filter((m) => region(m) === "india" && within(m, F - k * L, F - (k - 1) * L))).size;
        }
        const avg = prev / 4;
        const ratio = avg > 0 ? weekShows.size / avg : 3;
        const ownCovered = tm.some((m) => region(m) === "own" && within(m, T - 56 * DAY, T));
        const stanceByShow = new Map<string, string>();
        for (const m of [...week].sort((a, b) => t(a) - t(b))) stanceByShow.set(m.episode.show_id, m.stance ?? "neutral");
        const stances: Record<string, number> = {};
        for (const s of stanceByShow.values()) stances[s] = (stances[s] ?? 0) + 1;
        const c = {
          topic_spread: r1((w.topic_spread * Math.min(weekShows.size, 5)) / 5),
          topic_acceleration: r1((w.topic_acceleration * Math.min(ratio, 3)) / 3),
          topic_gap: r1(ownCovered ? 0 : w.topic_gap),
        };
        topics.push({
          entity_id: entityId, name: e.canonical_name, score: r1(sum(c)), components: c,
          sources: sourcesOf(week), shows: showNames(weekShows), show_count: weekShows.size,
          label: Object.values(stances).some((n) => n >= 3) ? "counter" : "ride", stances,
          trend: trend(tm.filter((m) => region(m) === "india")),
        });
      }

      // Global signals: lead-time score
      const g14 = tm.filter((m) => within(m, T - 14 * DAY, T) && region(m) === "global");
      const gShows = distinctShows(g14);
      if (gShows.size >= 2) {
        const indiaCount = distinctShows(tm.filter((m) => within(m, T - 30 * DAY, T) && region(m) === "india")).size;
        const c = {
          global_spread: r1((w.global_spread * Math.min(gShows.size, 4)) / 4),
          global_not_in_india: r1(indiaCount === 0 ? w.global_not_in_india : indiaCount === 1 ? (w.global_not_in_india * 15) / 35 : 0),
          global_india_translation: r1((w.global_india_translation * fitOrNeutral(e.india_fit)) / 5),
        };
        global.push({
          entity_id: entityId, name: e.canonical_name, score: r1(sum(c)), components: c,
          sources: sourcesOf(g14), shows: showNames(gShows), global_count: gShows.size, india_count: indiaCount,
          fit_pending: e.india_fit == null,
        });
      }
    }

    if (e.type === "brand") {
      const bm = all.filter((m) => (m.kind === "paid" || m.kind === "organic") && (m.confidence ?? 0) >= 0.7);
      const in30 = bm.filter((m) => within(m, T - 30 * DAY, T));
      if (!in30.length) continue;
      const shows = distinctShows(in30);
      const firstSeen = Math.min(...bm.map(t));
      const paid = in30.some((m) => m.kind === "paid");
      const c = {
        sponsor_spend: r1(paid ? w.sponsor_spend : w.sponsor_spend / 4),
        sponsor_breadth: r1((w.sponsor_breadth * Math.min(shows.size, 4)) / 4),
        sponsor_recency: r1(firstSeen >= T - 14 * DAY ? w.sponsor_recency : w.sponsor_recency / 4),
        sponsor_fit: r1((w.sponsor_fit * fitOrNeutral(e.fit)) / 5),
      };
      sponsors.push({
        entity_id: entityId, name: e.canonical_name, score: r1(sum(c)), components: c,
        sources: sourcesOf(in30), shows: showNames(shows), paid, show_count: shows.size,
        first_seen: new Date(firstSeen).toISOString(), trend: trend(bm), fit_pending: e.fit == null,
      });
    }
  }

  const rank = <X extends Base>(xs: X[]) =>
    xs.filter((x) => x.sources.length > 0).sort((a, b) => b.score - a.score || b.sources.length - a.sources.length || a.name.localeCompare(b.name));

  const windowShows = new Set(data.windowEpisodes.map((e) => e.show_id));
  const rankedGuests = rank(guests);
  const rankedSponsors = rank(sponsors);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    guests: rankedGuests,
    topics: rank(topics),
    sponsors: rankedSponsors,
    global: rank(global),
    stats: {
      guests_on_media_rounds: rankedGuests.length,
      brands_spending: rankedSponsors.filter((s) => s.paid).length,
      shows_scanned: windowShows.size,
      episodes_scanned: data.windowEpisodes.length,
    },
    rules: { guest_min_shows: guestMinShows },
  };
}

// Retired hosts whose episode pages now 404; the audio file still plays.
const DEAD_PAGE = /podcasters\.spotify\.com|anchor\.fm\/[^/]+\/episodes/;
function webOrAudio(ep: EpisodeLite): string {
  return DEAD_PAGE.test(ep.url) && ep.audio_url ? ep.audio_url : ep.url;
}

function sum(c: Record<string, number>): number {
  return Object.values(c).reduce((a, b) => a + b, 0);
}
