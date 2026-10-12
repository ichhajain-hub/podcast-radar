import { getSetting, SETTING_DEFAULTS } from "./settings";
import { db, selectAll } from "./supabase";
import { istDayStart, istMonday } from "./dates";

// Estimated Gemini spend from the token counts logged on every call (runs.log.usage),
// priced with the per-1M-token rates stored in settings. Output price covers thinking tokens.

type Usage = { prompt_tokens?: number; output_tokens?: number; thought_tokens?: number; total_tokens?: number; task?: string };
export type Prices = { input: number; output: number };

export async function prices(): Promise<Prices> {
  return {
    input: Number(await getSetting("price_input_per_1m", SETTING_DEFAULTS.price_input_per_1m)),
    output: Number(await getSetting("price_output_per_1m", SETTING_DEFAULTS.price_output_per_1m)),
  };
}

export function usageCost(usage: Usage[] | undefined, p: Prices): { usd: number; tokens: number; calls: number } {
  let usd = 0, tokens = 0;
  for (const u of usage ?? []) {
    usd += ((u.prompt_tokens ?? 0) * p.input + ((u.output_tokens ?? 0) + (u.thought_tokens ?? 0)) * p.output) / 1e6;
    tokens += u.total_tokens ?? 0;
  }
  return { usd, tokens, calls: usage?.length ?? 0 };
}

export async function spendSummary(): Promise<{ week: number; month: number; weekTokens: number; monthTokens: number; byTask: Record<string, number>; prices: Prices }> {
  const p = await prices();
  const now = new Date();
  const weekStart = istDayStart(istMonday(now));
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const monthStart = istDayStart(`${ist.toISOString().slice(0, 7)}-01`);
  const since = new Date(Math.min(weekStart.getTime(), monthStart.getTime())).toISOString();
  const runs = await selectAll<{ started_at: string; log: { usage?: Usage[] } | null }>((a, b) =>
    db().from("runs").select("started_at, log").gte("started_at", since).order("started_at").range(a, b),
  );
  let week = 0, month = 0, weekTokens = 0, monthTokens = 0;
  const byTask: Record<string, number> = {};
  for (const r of runs) {
    const c = usageCost(r.log?.usage, p);
    const t = Date.parse(r.started_at);
    if (t >= weekStart.getTime()) { week += c.usd; weekTokens += c.tokens; }
    if (t >= monthStart.getTime()) {
      month += c.usd; monthTokens += c.tokens;
      for (const u of r.log?.usage ?? []) byTask[u.task ?? "other"] = (byTask[u.task ?? "other"] ?? 0) + usageCost([u], p).usd;
    }
  }
  return { week, month, weekTokens, monthTokens, byTask, prices: p };
}

export const usd = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(0)}`;
