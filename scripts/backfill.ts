// Backfill (spec section 11): ingest the last 8 weeks for every active show, then build and
// store a brief for each of those 8 weeks so the dashboard's "As sent" history is real.
// No emails are sent. YouTube sponsor deep-reads only run for the most recent 2 weeks (cost).
//
// Run:  node --env-file=.env.local --import tsx scripts/backfill.ts [--weeks 8] [--briefs-only] [--no-deep-read]

import { buildBrief, type Writer } from "../src/lib/brief";
import { addDays, istDayStart, istMonday } from "../src/lib/dates";
import { clusterTopics, consolidateSince } from "../src/lib/entities";
import type { ShowRow } from "../src/lib/extract";
import { rateMissingFits } from "../src/lib/fit";
import { ingestShow } from "../src/lib/ingest";
import { scoreRange } from "../src/lib/scoring-data";
import { db } from "../src/lib/supabase";
import { deepRead, deepReadQueue } from "../src/lib/deepread";
import { matchShowVideos } from "../src/lib/youtube";

const arg = (name: string) => process.argv.includes(name);
const weeksArg = process.argv.indexOf("--weeks");
const WEEKS = weeksArg > 0 ? Number(process.argv[weeksArg + 1]) : 8;

type Hooks = {
  /** Layer 3: deep-read YouTube for episodes published on/after this date. */
  deepRead?: (show: ShowRow, since: string, runId: string) => Promise<unknown>;
  /** Layer 4: Gemini brief writer. */
  writer?: Writer;
};

export async function backfill(hooks: Hooks = {}) {
  const thisMonday = istMonday(new Date());
  const firstWeek = addDays(thisMonday, -7 * WEEKS);
  const sinceDays = Math.ceil((Date.now() - istDayStart(firstWeek).getTime()) / 864e5);
  const { data: run, error } = await db().from("runs")
    .insert({ status: "running", mode: "backfill", log: { trigger: "backfill", weeks: WEEKS, shows: [], usage: [] } })
    .select("id, started_at").single();
  if (error) throw new Error(error.message);
  console.log(`Backfill run ${run.id}: weeks ${firstWeek} → ${thisMonday} (${sinceDays} days)`);

  const { data: shows } = await db().from("shows").select("*").eq("active", true).order("region").order("name");
  const ok: string[] = [];
  const failed: string[] = [];

  if (!arg("--briefs-only")) {
    const queue = [...((shows ?? []) as ShowRow[])];
    const worker = async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        try {
          const r = await ingestShow(s, { runId: run.id, sinceDays, budgetMs: 30 * 60_000 });
          console.log(`  ✓ ${s.name}: ${r.in_window} eps in window, ${r.extracted} extracted (${Math.round(r.ms / 1000)}s)`);
          await db().rpc("run_mark_show", { p_run: run.id, p_name: s.name, p_ok: true, p_entry: r });
          if (hooks.deepRead && s.region === "india") {
            await hooks.deepRead(s, addDays(thisMonday, -14), run.id);
          }
          ok.push(s.name);
        } catch (e) {
          console.log(`  ✗ ${s.name}: ${(e as Error).message}`);
          await db().rpc("run_mark_show", { p_run: run.id, p_name: s.name, p_ok: false, p_entry: { show: s.name, ok: false, error: (e as Error).message } });
          failed.push(s.name);
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    console.log("Merging duplicate names…", await consolidateSince(run.started_at, run.id));
  }
  if (!arg("--no-cluster")) {
    console.log("Grouping topic themes…", await clusterTopics(run.id), "labels merged");
  }

  for (let k = WEEKS; k >= 1; k--) {
    const week = addDays(thisMonday, -7 * k);
    const scored = await scoreRange(istDayStart(week), istDayStart(addDays(week, 7)));
    await rateMissingFits(scored, run.id);
    const { content, skipped } = await buildBrief(week, { runId: run.id, showsFailed: failed, writer: hooks.writer });
    console.log(`  brief ${week}: ${content.guests.length} guests, ${content.topics.length} topics, ${content.sponsors.length} sponsors, ${content.global.length} global, ${content.stats.episodes_scanned} eps${skipped ? ` (${skipped})` : ""}`);
  }

  await db().from("settings").upsert({ key: "history_start", value: firstWeek, updated_at: new Date().toISOString() });
  const { data: usage } = await db().from("runs").select("log").eq("id", run.id).single();
  const tokens = ((usage?.log?.usage ?? []) as { total_tokens: number }[]).reduce((a, u) => a + u.total_tokens, 0);
  await db().from("runs").update({ status: failed.length ? "partial" : "ok", finished_at: new Date().toISOString() }).eq("id", run.id);
  console.log(`Done. ${ok.length} shows ok, ${failed.length} failed. Gemini tokens: ${tokens.toLocaleString()}`);
}

/** Default deep-read hook: link YouTube videos and deep-read the most recent 2 weeks only (cost control). */
async function deepReadRecent(show: ShowRow, since: string, runId: string) {
  const sinceIso = istDayStart(since).toISOString();
  await matchShowVideos(show, sinceIso, runId);
  const queue = (await deepReadQueue(sinceIso, 100)).filter(Boolean);
  const { data: mine } = await db().from("episodes").select("id").eq("show_id", show.id).in("id", queue.length ? queue : ["00000000-0000-0000-0000-000000000000"]);
  const ids = (mine ?? []).map((e) => e.id as string);
  await Promise.all(ids.map((id) => withSlot(async () => {
    const r = await deepRead(id, runId);
    console.log(`    deep-read ${show.name}: ${r.ok ? `${r.brands} brands` : `failed (${r.note})`}`);
  })));
}

// At most 2 deep-reads in flight across all shows (spec 5.4).
let slots = 2;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (slots === 0) await new Promise<void>((r) => waiting.push(r));
  else slots--;
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else slots++;
  }
}

if (process.argv[1]?.endsWith("backfill.ts")) {
  backfill(arg("--no-deep-read") ? {} : { deepRead: deepReadRecent }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
