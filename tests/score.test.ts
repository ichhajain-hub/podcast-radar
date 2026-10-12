import { describe, expect, it } from "vitest";
import { applyTags } from "../src/lib/brief";
import { score, type EntityLite, type MentionLite, type ScoringData, type ShowLite } from "../src/lib/score";
import { DEFAULT_WEIGHTS } from "../src/lib/weights";

const DAY = 864e5;
const to = new Date("2026-10-12T00:00:00Z");
const from = new Date(to.getTime() - 7 * DAY);
const daysAgo = (n: number) => new Date(to.getTime() - n * DAY).toISOString();

const shows: ShowLite[] = [
  { id: "s1", name: "India A", region: "india", hosts: ["Host A"] },
  { id: "s2", name: "India B", region: "india", hosts: [] },
  { id: "s3", name: "India C", region: "india", hosts: [] },
  { id: "g1", name: "Global X", region: "global", hosts: [] },
  { id: "g2", name: "Global Y", region: "global", hosts: [] },
  { id: "o1", name: "Own", region: "own", hosts: [] },
];
const ent = (id: string, type: EntityLite["type"], name: string, fit: number | null = null): EntityLite => ({
  id, type, canonical_name: name, company: null, role: null, website_url: null, linkedin_url: null, linkedin_verified: false, fit, india_fit: fit,
});
let n = 0;
const m = (entity_id: string, kind: MentionLite["kind"], show: string, ago: number, extra: Partial<MentionLite> = {}): MentionLite => ({
  entity_id, kind, source: "notes", confidence: kind === "paid" || kind === "organic" ? 0.9 : null, evidence: "e", timestamp_seconds: null,
  stance: kind === "topic" ? "bullish" : null,
  episode: { id: `ep${n++}`, show_id: show, title: "t", url: `https://x/${n}`, youtube_url: null, published_at: daysAgo(ago) },
  ...extra,
});

function data(mentions: MentionLite[], entities: EntityLite[]): ScoringData {
  return { shows, mentions, entities: new Map(entities.map((e) => [e.id, e])), windowEpisodes: [] };
}

describe("score()", () => {
  it("gates guests on 2+ India shows in 30 days and scores spread/recency/fit", () => {
    const r = score(from, to, DEFAULT_WEIGHTS, data(
      [m("g", "guest", "s1", 3), m("g", "guest", "s2", 20), m("solo", "guest", "s1", 2)],
      [ent("g", "guest", "Asha Rao", 5), ent("solo", "guest", "One Show")],
    ));
    expect(r.guests.map((g) => g.name)).toEqual(["Asha Rao"]);
    expect(r.guests[0].components).toEqual({ guest_spread: 20, guest_recency: 12.5, guest_ahead_of_curve: 20, guest_fit: 15 });
    expect(r.guests[0].sources).toHaveLength(2);
  });

  it("excludes hosts and guests who were on the own show in the last 12 months", () => {
    const r = score(from, to, DEFAULT_WEIGHTS, data(
      [m("h", "guest", "s2", 1), m("h", "guest", "s3", 1), m("o", "guest", "s2", 1), m("o", "guest", "s3", 1), m("o", "guest", "o1", 200)],
      [ent("h", "guest", "Host A"), ent("o", "guest", "Already Booked")],
    ));
    expect(r.guests).toEqual([]);
  });

  it("labels a topic 'counter' when 3+ shows share a stance and gives the gap bonus", () => {
    const r = score(from, to, DEFAULT_WEIGHTS, data(
      [m("t", "topic", "s1", 1), m("t", "topic", "s2", 2), m("t", "topic", "s3", 3)],
      [ent("t", "topic", "quick commerce")],
    ));
    expect(r.topics[0].label).toBe("counter");
    expect(r.topics[0].components.topic_gap).toBe(30);
    expect(r.topics[0].components.topic_acceleration).toBe(30); // no prior coverage -> capped 3x
  });

  it("scores global signals only when absent from India", () => {
    const r = score(from, to, DEFAULT_WEIGHTS, data(
      [m("t", "topic", "g1", 2), m("t", "topic", "g2", 5)],
      [ent("t", "topic", "agentic commerce", 4)],
    ));
    expect(r.global[0].components).toEqual({ global_spread: 17.5, global_not_in_india: 35, global_india_translation: 24 });
  });

  it("gates sponsors on confidence ≥ 0.7 and rewards paid reads", () => {
    const r = score(from, to, DEFAULT_WEIGHTS, data(
      [m("b", "paid", "s1", 2), m("low", "paid", "s1", 2, { confidence: 0.5 })],
      [ent("b", "brand", "Zerodha"), ent("low", "brand", "Maybe")],
    ));
    expect(r.sponsors.map((s) => s.name)).toEqual(["Zerodha"]);
    expect(r.sponsors[0].components.sponsor_spend).toBe(40);
  });

  it("changing a weight changes the ranking", () => {
    const d = data(
      [m("a", "paid", "s1", 2), m("b", "organic", "s1", 2), m("b", "organic", "s2", 2), m("b", "organic", "s3", 2), m("b", "organic", "o1", 2)],
      [ent("a", "brand", "PaidCo"), ent("b", "brand", "BroadCo")],
    );
    expect(score(from, to, DEFAULT_WEIGHTS, d).sponsors[0].name).toBe("PaidCo");
    expect(score(from, to, { ...DEFAULT_WEIGHTS, sponsor_spend: 5, sponsor_breadth: 60 }, d).sponsors[0].name).toBe("BroadCo");
  });
});

describe("applyTags()", () => {
  it("tags New / Rising / Repeat and demotes a 3-week Repeat by one place", () => {
    const now = [{ entity_id: "a", score: 50 }, { entity_id: "b", score: 40 }, { entity_id: "c", score: 30 }, { entity_id: "d", score: 20 }];
    const prev = [{ entity_id: "a", score: 50, tag: "Repeat" as const, repeat_streak: 2 }, { entity_id: "b", score: 30 }];
    const out = applyTags(now, 3, prev);
    expect(out.map((x) => `${x.entity_id}:${x.tag}`)).toEqual(["b:Rising", "a:Repeat", "c:New"]);
  });
});

describe("guest gate setting", () => {
  it("lists single-show guests when the minimum is 1, with 10 spread points", () => {
    const d = data([m("solo", "guest", "s1", 2)], [ent("solo", "guest", "Solo Guest", 4)]);
    expect(score(from, to, DEFAULT_WEIGHTS, d).guests).toEqual([]);
    const r = score(from, to, DEFAULT_WEIGHTS, d, { guestMinShows: 1 });
    expect(r.guests.map((g) => g.name)).toEqual(["Solo Guest"]);
    expect(r.guests[0].components.guest_spread).toBe(10);
    expect(r.rules?.guest_min_shows).toBe(1);
  });
});

describe("media rounds", () => {
  it("always lists guests on 2+ India shows and counts only them in the tile stat", () => {
    const d = data(
      [m("multi", "guest", "s1", 3), m("multi", "guest", "s2", 10), m("solo", "guest", "s3", 1)],
      [ent("multi", "guest", "Two Shows", 2), ent("solo", "guest", "One Show", 5)],
    );
    const r = score(from, to, DEFAULT_WEIGHTS, d, { guestMinShows: 1 });
    expect(r.guests).toHaveLength(2);
    expect(r.media_rounds?.map((g) => g.name)).toEqual(["Two Shows"]);
    expect(r.stats.guests_on_media_rounds).toBe(1);
  });
});
