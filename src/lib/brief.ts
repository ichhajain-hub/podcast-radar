import { addDays, istDayStart } from "./dates";
import { renderBriefHtml } from "./email";
import type { RadarContent } from "@/components/radar-view";
import { TOP_N, type ScoreResult } from "./score";
import { scoreRange } from "./scoring-data";
import { db } from "./supabase";
import { loadWeights } from "./weights";

export type Tag = "New" | "Rising" | "Repeat";
type Section = "guests" | "topics" | "sponsors" | "global";
const SECTIONS: Section[] = ["guests", "topics", "sponsors", "global"];

export type BriefContent = RadarContent & {
  week_start: string;
  generated_at: string;
  model: string | null;
  weights: Record<string, number>;
};

type Tagged = { entity_id: string; score: number; tag?: Tag; repeat_streak?: number };

/**
 * Compares this week's ranking with last week's brief: New / Rising (score up) / Repeat.
 * An item that is Repeat for the 3rd week in a row drops one place, so fresh leads surface.
 */
export function applyTags<T extends Tagged>(ranked: T[], n: number, prev: Tagged[] | undefined): (T & { tag: Tag; repeat_streak: number })[] {
  const prevById = new Map((prev ?? []).map((p) => [p.entity_id, p]));
  const tag = (x: T): T & { tag: Tag; repeat_streak: number } => {
    const p = prevById.get(x.entity_id);
    if (!p) return { ...x, tag: "New", repeat_streak: 0 };
    if (x.score > p.score) return { ...x, tag: "Rising", repeat_streak: 0 };
    return { ...x, tag: "Repeat", repeat_streak: (p.tag === "Repeat" ? p.repeat_streak ?? 1 : 0) + 1 };
  };
  const list = ranked.slice(0, n + 1).map(tag);
  for (let i = 0; i < Math.min(n, list.length - 1); i++) {
    if ((list[i].repeat_streak ?? 0) >= 3) {
      [list[i], list[i + 1]] = [list[i + 1], list[i]];
      i++; // the demoted item moves down only one place
    }
  }
  return list.slice(0, n);
}

export type Writer = (content: BriefContent, runId: string | null) => Promise<BriefContent>;

/** Scores one Monday-to-Monday week, tags it against last week's brief and stores it (no email). */
export async function buildBrief(
  weekStart: string,
  opts: { runId?: string | null; showsFailed?: string[]; writer?: Writer; scored?: ScoreResult } = {},
): Promise<{ content: BriefContent; html: string; skipped?: string }> {
  const from = istDayStart(weekStart);
  const to = istDayStart(addDays(weekStart, 7));
  const weights = await loadWeights();
  const result = opts.scored ?? (await scoreRange(from, to, weights));

  const { data: prev } = await db().from("briefs").select("content_json").eq("week_start", addDays(weekStart, -7)).maybeSingle();
  const prevContent = prev?.content_json as BriefContent | undefined;

  let content: BriefContent = {
    ...result,
    week_start: weekStart,
    generated_at: new Date().toISOString(),
    model: process.env.GEMINI_MODEL ?? null,
    weights,
    shows_failed: opts.showsFailed ?? [],
    guests: [], topics: [], sponsors: [], global: [],
  };
  for (const s of SECTIONS) {
    (content[s] as Tagged[]) = applyTags(result[s] as Tagged[], TOP_N[s], prevContent?.[s] as Tagged[] | undefined);
  }
  if (opts.writer) content = await opts.writer(content, opts.runId ?? null);

  const html = renderBriefHtml(content);
  const { data: existing } = await db().from("briefs").select("sent_at").eq("week_start", weekStart).maybeSingle();
  if (existing?.sent_at) return { content, html, skipped: "already sent; the stored brief is the historical record" };
  const { error } = await db().from("briefs").upsert({ week_start: weekStart, content_json: content, html }, { onConflict: "week_start" });
  if (error) throw new Error(`saving brief: ${error.message}`);
  return { content, html };
}
