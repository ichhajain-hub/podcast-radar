import { z } from "zod";
import type { BriefContent } from "./brief";
import { generateJson } from "./gemini";
import type { Source } from "./score";

// Brief writer (spec 8): the ranking is computed in code; Gemini only writes one "why now"
// line (≤ 20 words) + the action per item, and an India angle for global signals.
// Every line is checked to use only names and numbers present in that item's own facts;
// failures are retried once, then replaced by a plain line built from the facts.

type Section = "guests" | "topics" | "sponsors" | "global";
const ACTIONS: Record<Section, string[]> = { guests: ["book"], topics: ["ride", "counter"], sponsors: ["pitch"], global: ["ride"] };

const outSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    why_now: z.string(),
    action: z.string(),
    india_angle: z.string().describe("Global signals only; empty string otherwise"),
  })),
});

type Facts = { id: string; section: Section; name: string; facts: Record<string, unknown>; corpus: string; numbers: Set<string> };

function sourceFacts(s: Source[]) {
  return s.slice(0, 6).map((x) => ({ show: x.show_name, episode: x.episode_title, date: x.published_at.slice(0, 10), evidence: x.evidence }));
}

function factsFor(content: BriefContent): Facts[] {
  const out: Facts[] = [];
  const add = (section: Section, id: string, name: string, facts: Record<string, unknown>) => {
    const corpus = JSON.stringify(facts).toLowerCase();
    const numbers = new Set((JSON.stringify(facts).match(/\d+(?:\.\d+)?/g) ?? []).map(String));
    out.push({ id: `${section}:${id}`, section, name, facts, corpus, numbers });
  };
  for (const g of content.guests) add("guests", g.entity_id, g.name, { name: g.name, role: g.role, company: g.company, india_shows: g.shows.length, shows: g.shows, appearances_30d: g.appearances, sources: sourceFacts(g.sources) });
  for (const t of content.topics) add("topics", t.entity_id, t.name, { topic: t.name, india_shows_this_week: t.show_count, shows: t.shows, label: t.label, stances: t.stances, sources: sourceFacts(t.sources) });
  for (const s of content.sponsors) add("sponsors", s.entity_id, s.name, { brand: s.name, paid: s.paid, shows_30d: s.show_count, shows: s.shows, sources: sourceFacts(s.sources) });
  for (const g of content.global) add("global", g.entity_id, g.name, { topic: g.name, global_shows_14d: g.global_count, india_shows_30d: g.india_count, shows: g.shows, sources: sourceFacts(g.sources) });
  return out;
}

// Capitalised words that are fine without appearing in the facts.
const COMMON = new Set(["india", "indian", "indians", "the", "this", "these", "a", "an", "book", "pitch", "ride", "counter", "now", "why", "new", "global", "us", "ai", "its", "their", "his", "her", "they", "after", "with", "on", "in", "as", "from", "for", "and", "but", "two", "three", "four", "five", "both", "founders", "founder", "startup", "startups", "monday", "week", "weekly", "while", "across", "back", "is", "are", "was", "still", "fresh", "hot", "only", "no", "first", "also", "same", "multiple", "several", "every"]);
const NUMBER_WORDS: Record<string, string> = { two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };

/** Returns a reason when the text uses a name or number that is not in the item's facts. */
export function checkGrounded(text: string, f: Pick<Facts, "corpus" | "numbers">): string | null {
  if (!text.trim()) return "empty";
  for (const n of text.match(/\d+(?:\.\d+)?/g) ?? []) if (!f.numbers.has(n)) return `number ${n} not in facts`;
  for (const [w, n] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${w}\\b`, "i").test(text) && !f.numbers.has(n)) return `count "${w}" not in facts`;
  const words = text.replace(/[“”"'’‘()]/g, " ").split(/[\s\-–—/]+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[^A-Za-z0-9&.-]/g, "");
    if (!/^[A-Z]/.test(w)) continue;
    const prev = words[i - 1] ?? "";
    if (i === 0 || /[.!?:]$/.test(prev)) continue; // sentence start
    const lw = w.toLowerCase().replace(/\.$/, "");
    if (COMMON.has(lw) || f.corpus.includes(lw)) continue;
    return `name "${w}" not in facts`;
  }
  return null;
}

function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function fallback(f: Facts): { why_now: string; action: string; india_angle: string } {
  const x = f.facts as Record<string, number | string | string[]>;
  const shows = (x.shows as string[]).slice(0, 3).join(", ");
  switch (f.section) {
    case "guests": return { why_now: `On ${x.india_shows} India shows in 30 days: ${shows}.`, action: "book", india_angle: "" };
    case "topics": return { why_now: `Covered by ${x.india_shows_this_week} India shows this week: ${shows}.`, action: String(x.label), india_angle: "" };
    case "sponsors": return { why_now: `${x.paid ? "Paid reads" : "Mentions"} on ${x.shows_30d} show${x.shows_30d === 1 ? "" : "s"} in 30 days: ${shows}.`, action: "pitch", india_angle: "" };
    case "global": return { why_now: `On ${x.global_shows_14d} global shows in 14 days, ${x.india_shows_30d} India shows in 30.`, action: "ride", india_angle: "Not yet covered by India shows — room to lead the conversation." };
  }
}

async function ask(items: Facts[], runId: string | null) {
  return generateJson({
    task: "write_brief", runId, schema: outSchema, note: `${items.length} items`,
    prompt: `You write a crisp Monday radar for the host of an Indian startup-founder podcast.
For each item write:
- why_now: ONE line, max 20 words: the "so what" for the host this week — e.g. a guest doing media rounds, a theme several shows agree on (counter it) or are just starting (ride it), a brand newly buying reads. Don't just restate the counts.
- action: one of ${JSON.stringify(ACTIONS)} for its section (topics: use its label).
- india_angle: for "global" items only, one line (max 20 words): the Indian-market version of this theme an Indian founder audience would care about (e.g. regulation, UPI, tier-2 consumers, Indian SaaS), without naming companies not in the facts; empty string for others.
STRICT: use only facts given for that item. Do not mention any person, company, show or number that is not in its facts. No hype words.

Items:
${JSON.stringify(items.map((i) => ({ id: i.id, section: i.section, facts: i.facts })), null, 1)}`,
  });
}

/** Adds why_now / action / india_angle to every item of the brief (spec 8 + 7). */
export const writeBrief = async (content: BriefContent, runId: string | null): Promise<BriefContent> => {
  const facts = factsFor(content);
  if (!facts.length) return content;
  const byId = new Map(facts.map((f) => [f.id, f]));
  const result = new Map<string, { why_now: string; action: string; india_angle: string; grounded: boolean }>();

  const validate = (out: z.infer<typeof outSchema>) => {
    const bad: Facts[] = [];
    for (const o of out.items) {
      const f = byId.get(o.id);
      if (!f || result.has(o.id)) continue;
      const action = ACTIONS[f.section].includes(o.action) ? o.action : ACTIONS[f.section][0];
      const why = o.why_now.trim();
      const angle = f.section === "global" ? o.india_angle.trim() : "";
      const reason =
        (wordCount(why) > 20 && "too long") || checkGrounded(why, f) ||
        (f.section === "global" && (wordCount(angle) > 25 ? "angle too long" : checkGrounded(angle, f)));
      if (reason) bad.push(f);
      else result.set(o.id, { why_now: why, action: f.section === "topics" ? String(f.facts.label) : action, india_angle: angle, grounded: true });
    }
    return bad;
  };

  try {
    validate(await ask(facts, runId));
    const missing = facts.filter((f) => !result.has(f.id));
    if (missing.length) validate(await ask(missing, runId)); // retry once
  } catch (e) {
    console.error("brief writer failed; using fact lines", (e as Error).message);
  }
  for (const f of facts) if (!result.has(f.id)) result.set(f.id, { ...fallback(f), grounded: false });

  const apply = <T extends { entity_id: string }>(section: Section, xs: T[]) =>
    xs.map((x) => {
      const r = result.get(`${section}:${x.entity_id}`)!;
      return { ...x, why_now: r.why_now, action: r.action, ...(section === "global" ? { india_angle: r.india_angle } : {}) };
    });
  return {
    ...content,
    guests: apply("guests", content.guests),
    topics: apply("topics", content.topics),
    sponsors: apply("sponsors", content.sponsors),
    global: apply("global", content.global),
  };
};
