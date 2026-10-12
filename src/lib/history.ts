import type { BriefContent } from "./brief";
import { addDays, istDayStart, istMonday } from "./dates";
import { TOP_N, type ScoreResult } from "./score";
import { scoreRange } from "./scoring-data";
import { db } from "./supabase";

export type SentBrief = { week_start: string; sent_at: string | null; content: BriefContent };

/** "As sent": stored briefs whose week starts inside [from, to). Never recomputed. */
export async function sentBriefs(from: string, to: string): Promise<SentBrief[]> {
  const { data, error } = await db().from("briefs").select("week_start, sent_at, content_json")
    .gte("week_start", istMonday(istDayStart(from))).lt("week_start", to).order("week_start", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((b) => ({ week_start: b.week_start, sent_at: b.sent_at, content: b.content_json as BriefContent }));
}

/** "Explore": recomputes everything live from mentions with the current weights. */
export async function explore(from: string, to: string): Promise<ScoreResult> {
  const end = new Date(Math.min(istDayStart(to).getTime(), Date.now()));
  return scoreRange(istDayStart(from), end);
}

export function topOnly(r: ScoreResult): ScoreResult {
  return { ...r, media_rounds: r.media_rounds?.slice(0, 5), guests: r.guests.slice(0, TOP_N.guests), topics: r.topics.slice(0, TOP_N.topics), sponsors: r.sponsors.slice(0, TOP_N.sponsors), global: r.global.slice(0, TOP_N.global) };
}

export async function historyStart(): Promise<string | null> {
  const { data } = await db().from("settings").select("value").eq("key", "history_start").maybeSingle();
  if (typeof data?.value === "string") return data.value;
  const { data: first } = await db().from("episodes").select("published_at").order("published_at").limit(1);
  return first?.[0] ? istMonday(new Date(first[0].published_at)) : null;
}

export async function latestBriefWeek(): Promise<string | null> {
  const { data } = await db().from("briefs").select("week_start").order("week_start", { ascending: false }).limit(1);
  return data?.[0]?.week_start ?? null;
}

export const weekEnd = (weekStart: string) => addDays(weekStart, 7);
