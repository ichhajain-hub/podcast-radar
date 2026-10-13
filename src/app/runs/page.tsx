import { AppShell } from "@/components/app-shell";
import { formatIST } from "@/lib/format";
import { db } from "@/lib/supabase";
import { prices, spendSummary, usageCost, usd } from "@/lib/spend";

export const dynamic = "force-dynamic";

type Run = {
  id: string; started_at: string; finished_at: string | null; status: string | null; mode: string | null;
  total: number | null; shows_ok: string[]; shows_failed: string[];
  log: {
    trigger?: string;
    usage?: { prompt_tokens: number; output_tokens: number; thought_tokens: number; total_tokens: number; task?: string }[];
    shows?: { show: string; error?: string }[];
    deep_reads?: { ok: boolean }[];
    deep_read_queue_left?: number;
  } | null;
};

export default async function RunsPage() {
  const [{ data }, spend, p] = await Promise.all([
    db().from("runs").select("*").order("started_at", { ascending: false }).limit(50),
    spendSummary(),
    prices(),
  ]);
  const runs = (data ?? []) as Run[];
  return (
    <AppShell active="runs">
      <h1 className="text-2xl font-semibold tracking-tight">Run log</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line p-5">
          <div className="text-3xl font-semibold text-violet">{usd(spend.week)}</div>
          <div className="text-sm text-muted">Estimated Gemini spend this week · {spend.weekTokens.toLocaleString("en-IN")} tokens</div>
        </div>
        <div className="rounded-2xl border border-line p-5">
          <div className="text-3xl font-semibold text-violet">{usd(spend.month)}</div>
          <div className="text-sm text-muted">This month · {Object.entries(spend.byTask).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, v]) => `${t.replace("_", "-")} ${usd(v)}`).join(" · ")}</div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">Priced at ${p.input}/1M input and ${p.output}/1M output tokens (editable in Settings). Estimates from logged token counts.</p>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-panel2 text-xs uppercase tracking-wide text-muted">
            <tr><th className="p-3">Started</th><th className="p-3">Mode</th><th className="p-3">Status</th><th className="p-3">Shows</th><th className="p-3">Time taken</th><th className="p-3">Deep-reads</th><th className="p-3">Gemini tokens · est. cost</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {runs.map((r) => {
              const secs = r.finished_at ? Math.round((Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000) : null;
              const cost = usageCost(r.log?.usage, p);
              const dr = r.log?.deep_reads ?? [];
              const errors = (r.log?.shows ?? []).filter((s) => s.error);
              return (
                <tr key={r.id} className="align-top">
                  <td className="p-3">{formatIST(r.started_at)}<div className="text-xs text-muted">{r.log?.trigger ?? ""}</div></td>
                  <td className="p-3">{r.mode ?? "—"}</td>
                  <td className="p-3"><span className={r.status === "ok" ? "text-mint" : r.status === "running" || r.status === "finalizing" ? "text-violet" : "text-warn"}>{r.status}</span></td>
                  <td className="p-3">
                    {r.shows_ok.length} ok{r.shows_failed.length ? `, ${r.shows_failed.length} failed` : ""}{r.total ? ` of ${r.total}` : ""}
                    {errors.map((s, i) => <div key={i} className="text-xs text-bad">{s.show}: {s.error}</div>)}
                  </td>
                  <td className="p-3">{secs == null ? "—" : secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`}</td>
                  <td className="p-3">{dr.length ? `${dr.filter((d) => d.ok).length}/${dr.length} ok` : "—"}{r.log?.deep_read_queue_left ? <div className="text-xs text-muted">{r.log.deep_read_queue_left} queued</div> : null}</td>
                  <td className="p-3 tabular-nums">{cost.tokens.toLocaleString("en-IN")}<div className="text-xs text-muted">{usd(cost.usd)}</div></td>
                </tr>
              );
            })}
            {!runs.length && <tr><td colSpan={7} className="p-6 text-center text-muted">No runs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
