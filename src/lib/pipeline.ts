import { buildBrief } from "./brief";
import { addDays, istDayStart, istMonday } from "./dates";
import { clusterTopics, consolidateSince } from "./entities";
import { rateMissingFits } from "./fit";
import { fetchStatus, ingestShow, type IngestResult } from "./ingest";
import { deepReadQueue, type DeepReadResult } from "./deepread";
import { kickAndWait } from "./internal";
import { lookupGuests } from "./linkedin";
import type { ShowRow } from "./extract";
import { scoreRange } from "./scoring-data";
import { db } from "./supabase";

export type RunMode = "daily" | "weekly";
const CONCURRENCY = 3;
const COOLDOWN_MIN = 15;

/** Creates a run row for the active shows. The work itself happens in runPipeline(). */
export async function startRun(mode: RunMode, trigger: "cron" | "admin"): Promise<{ runId: string; shows: number }> {
  // Any run stuck for 20+ minutes (e.g. a timed-out function) is closed so it doesn't block.
  const staleBefore = new Date(Date.now() - 20 * 60_000).toISOString();
  await db().from("runs").update({ status: "stale", finished_at: new Date().toISOString() })
    .in("status", ["running", "finalizing"]).lt("started_at", staleBefore);

  if (trigger === "admin") {
    const { data: last } = await db().from("runs").select("started_at").order("started_at", { ascending: false }).limit(1);
    const lastAt = last?.[0]?.started_at ? Date.parse(last[0].started_at) : 0;
    const waitMin = Math.ceil(COOLDOWN_MIN - (Date.now() - lastAt) / 60_000);
    if (waitMin > 0) throw new CooldownError(`A run started less than ${COOLDOWN_MIN} minutes ago. Try again in ${waitMin} min.`);
  }

  const { count, error } = await db().from("shows").select("id", { count: "exact", head: true }).eq("active", true);
  if (error) throw new Error(error.message);
  const { data: run, error: runErr } = await db().from("runs")
    .insert({ status: "running", mode, total: count ?? 0, log: { trigger, shows: [], usage: [] } })
    .select("id").single();
  if (runErr) throw new Error(runErr.message);
  return { runId: run.id, shows: count ?? 0 };
}

export class CooldownError extends Error {}

/**
 * The run, inside one function invocation (≤ 300 s on Vercel Hobby):
 *  1. POST /api/ingest/[showId] for every active show, 3 at a time (each its own function call)
 *  2. POST /api/deepread/[episodeId] for queued India videos, 2 at a time, while time remains;
 *     the rest stay queued for the next daily run
 *  3. POST /api/run/finalize, which rescores (and in weekly mode writes the brief) in its own invocation
 */
export async function runPipeline(runId: string) {
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;
  const { data: shows } = await db().from("shows").select("id, name").eq("active", true).order("region").order("name");
  const queue = [...(shows ?? [])];
  const ingestWorker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      if (elapsed() > INGEST_BUDGET_MS) {
        await recordShow(runId, s.id, s.name, null, "skipped: run time budget used up; will be picked up next run");
        continue;
      }
      try {
        const result = await kickAndWait<IngestResult>(`/api/ingest/${s.id}`, { runId }, INGEST_TIMEOUT_MS);
        await recordShow(runId, s.id, s.name, result, result.ok ? null : result.error ?? "failed");
      } catch (e) {
        await recordShow(runId, s.id, s.name, null, (e as Error).message);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, ingestWorker));

  // Sponsor deep-reads: max 2 in parallel (spec 5.4); unfinished ones retry on the next run.
  // Only recent videos (14 days) are deep-read, to keep Gemini spend predictable.
  const videos = await deepReadQueue(new Date(Date.now() - 14 * 864e5).toISOString());
  const deep: DeepReadResult[] = [];
  const deepWorker = async () => {
    for (let id = videos.shift(); id; id = videos.shift()) {
      if (elapsed() > DEEP_READ_START_BY_MS) break;
      try {
        deep.push(await kickAndWait<DeepReadResult>(`/api/deepread/${id}`, { runId }, Math.max(10_000, RUN_END_MS - elapsed())));
      } catch (e) {
        deep.push({ episode_id: id, ok: false, brands: 0, minutes_cap: 0, note: `still running or failed: ${(e as Error).message}` });
      }
    }
  };
  await Promise.all([deepWorker(), deepWorker()]);
  const { data: cur } = await db().from("runs").select("log").eq("id", runId).single();
  await db().from("runs").update({
    status: "finalizing",
    log: { ...(cur?.log ?? {}), deep_reads: deep, deep_read_queue_left: videos.length },
  }).eq("id", runId);

  await kickAndWait("/api/run/finalize", { runId }, 20_000).catch(async (e) => {
    await db().from("runs").update({ status: "error", finished_at: new Date().toISOString() }).eq("id", runId);
    console.error("finalize kick failed", e);
  });
}

const INGEST_BUDGET_MS = 150_000;
const INGEST_TIMEOUT_MS = 170_000;
const DEEP_READ_START_BY_MS = 200_000;
const RUN_END_MS = 270_000;

/** Ingests one show (called by /api/ingest/[showId]). Never throws: errors come back in the result. */
export async function ingestOne(runId: string | null, showId: string): Promise<IngestResult> {
  const { data: show } = await db().from("shows").select("*").eq("id", showId).single();
  if (!show) return failed("unknown show", "show not found");
  try {
    return await ingestShow(show as ShowRow, { runId, budgetMs: 110_000 });
  } catch (e) {
    return failed(show.name, (e as Error).message);
  }
}

function failed(name: string, error: string): IngestResult {
  return {
    show: name, ok: false, feed_episodes: 0, in_window: 0, new_episodes: 0, extracted: 0,
    pending_extraction: 0, mentions: { guests: 0, topics: 0, brands: 0 }, ms: 0, error,
  };
}

async function recordShow(runId: string, showId: string, name: string, result: IngestResult | null, error: string | null) {
  const entry = result ?? failed(name, error ?? "failed");
  await db().from("shows").update({ last_fetch_status: fetchStatus(entry) }).eq("id", showId);
  const { error: markErr } = await db().rpc("run_mark_show", { p_run: runId, p_name: name, p_ok: entry.ok, p_entry: entry });
  if (markErr) console.error("run_mark_show", markErr.message);
}

/**
 * After all shows: merge duplicate names created in parallel, rate fit for new candidates
 * (daily rescore). Weekly mode also writes and stores the brief for the week that just ended.
 */
export async function finalizeRun(runId: string) {
  const { data: run } = await db().from("runs").select("*").eq("id", runId).single();
  if (!run) return;
  const notes: Record<string, unknown> = {};
  try {
    notes.merged = await consolidateSince(run.started_at, runId);
    notes.topics_grouped = await clusterTopics(runId);
    const now = new Date();
    // Rate fit for anything that could appear on the dashboard or in this Monday's brief.
    const lastWeek = istDayStart(addDays(istMonday(now), -7));
    for (const [from, to] of [[new Date(now.getTime() - 7 * 864e5), now], [lastWeek, istDayStart(istMonday(now))]]) {
      const result = await scoreRange(from, to);
      notes.fit_rated = await rateMissingFits(result, runId);
      notes.linkedin_lookups = await lookupGuests(result.guests.slice(0, 6), runId);
    }
    if (run.mode === "weekly") {
      const week = addDays(istMonday(now), -7);
      const { data: latest } = await db().from("runs").select("shows_failed").eq("id", runId).single();
      const brief = await buildBrief(week, { runId, showsFailed: latest?.shows_failed ?? [] });
      notes.brief = { week_start: week, skipped: brief.skipped ?? null };
    }
  } catch (e) {
    notes.finalize_error = (e as Error).message;
  }
  const { data: latest } = await db().from("runs").select("log, shows_failed").eq("id", runId).single();
  await db().from("runs").update({
    status: notes.finalize_error ? "error" : (latest?.shows_failed?.length ?? 0) > 0 ? "partial" : "ok",
    finished_at: new Date().toISOString(),
    log: { ...(latest?.log ?? {}), ...notes },
  }).eq("id", runId);
}
