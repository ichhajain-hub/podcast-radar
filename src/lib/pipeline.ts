import { rateMissingFits } from "./fit";
import { fetchStatus, ingestShow, type IngestResult } from "./ingest";
import { kick } from "./internal";
import type { ShowRow } from "./extract";
import { scoreRange } from "./scoring-data";
import { db } from "./supabase";

export type RunMode = "daily" | "weekly";
const CONCURRENCY = 3;
const COOLDOWN_MIN = 15;

/** Creates a run, queues active shows and starts the first 3 ingests. */
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

  const { data: shows, error } = await db().from("shows").select("id, name").eq("active", true).order("region").order("name");
  if (error) throw new Error(error.message);
  const ids = (shows ?? []).map((s) => s.id as string);

  const { data: run, error: runErr } = await db().from("runs")
    .insert({ status: "running", mode, total: ids.length, pending: ids.slice(CONCURRENCY), log: { trigger, shows: [], usage: [] } })
    .select("id").single();
  if (runErr) throw new Error(runErr.message);

  if (!ids.length) await kick("/api/run/finalize", { runId: run.id });
  for (const id of ids.slice(0, CONCURRENCY)) await startIngest(run.id, id);
  return { runId: run.id, shows: ids.length };
}

export class CooldownError extends Error {}

async function startIngest(runId: string, showId: string) {
  try {
    await kick(`/api/ingest/${showId}`, { runId });
  } catch (e) {
    // Couldn't start that show: record it as failed and move the queue on.
    await finishShow(runId, showId, "unknown", null, (e as Error).message);
  }
}

/** Ingests one show inside a run, then hands the queue on and finalizes when all are done. */
export async function processShowInRun(runId: string, showId: string) {
  const { data: show } = await db().from("shows").select("*").eq("id", showId).single();
  if (!show) return finishShow(runId, showId, "unknown show", null, "show not found");
  let result: IngestResult;
  try {
    result = await ingestShow(show as ShowRow, { runId });
  } catch (e) {
    return finishShow(runId, showId, show.name, null, (e as Error).message);
  }
  return finishShow(runId, showId, show.name, result, null);
}

async function finishShow(runId: string, showId: string, name: string, result: IngestResult | null, error: string | null) {
  const entry: IngestResult = result ?? {
    show: name, ok: false, feed_episodes: 0, in_window: 0, new_episodes: 0, extracted: 0,
    pending_extraction: 0, mentions: { guests: 0, topics: 0, brands: 0 }, ms: 0, error: error ?? "failed",
  };
  if (name !== "unknown" && name !== "unknown show") {
    await db().from("shows").update({ last_fetch_status: fetchStatus(entry) }).eq("id", showId);
  }
  const { data: remaining, error: markErr } = await db().rpc("run_mark_show", {
    p_run: runId, p_name: name, p_ok: entry.ok, p_entry: entry,
  });
  if (markErr) console.error("run_mark_show", markErr.message);

  const { data: next } = await db().rpc("run_claim_next", { p_run: runId });
  if (next) await startIngest(runId, next as string);

  if (remaining === 0) {
    const { data: won } = await db().rpc("run_try_finalize", { p_run: runId });
    if (won) await kick("/api/run/finalize", { runId }).catch((e) => console.error("finalize kick", e));
  }
}

/** After all shows: rescore (rate any new candidates' fit). Weekly mode also writes the brief (Layer 4). */
export async function finalizeRun(runId: string) {
  const { data: run } = await db().from("runs").select("*").eq("id", runId).single();
  if (!run) return;
  const notes: Record<string, unknown> = {};
  try {
    const now = new Date();
    const result = await scoreRange(new Date(now.getTime() - 7 * 864e5), now);
    notes.fit_rated = await rateMissingFits(result, runId);
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
