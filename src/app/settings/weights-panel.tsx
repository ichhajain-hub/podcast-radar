"use client";
import { useState } from "react";

type Group = { title: string; keys: string[] };
const LABELS: Record<string, string> = {
  guest_spread: "Spread across shows", guest_recency: "Recency (14 days)", guest_ahead_of_curve: "Ahead of the curve", guest_fit: "Audience fit",
  topic_spread: "Shows covering it", topic_acceleration: "Acceleration", topic_gap: "Gap on your show",
  sponsor_spend: "Paid vs organic", sponsor_breadth: "Breadth", sponsor_recency: "Newly seen", sponsor_fit: "Founder fit",
  global_spread: "Global spread", global_not_in_india: "Not yet in India", global_india_translation: "India translation",
};

export function WeightsPanel({ initial, defaults, groups, guestMinShows }: { initial: Record<string, number>; defaults: Record<string, number>; groups: Group[]; guestMinShows: number }) {
  const [w, setW] = useState(initial);
  const [gate, setGate] = useState(guestMinShows);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const totals = Object.fromEntries(groups.map((g) => [g.title, g.keys.reduce((a, k) => a + (Number(w[k]) || 0), 0)]));
  const allOk = Object.values(totals).every((t) => Math.abs(t - 100) < 0.01);

  async function save(reset = false) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(reset ? { reset_weights: true } : { weights: w, guest_min_shows: gate }) });
    const body = await res.json();
    setBusy(false);
    if (res.ok && reset) setW({ ...defaults });
    setMsg(res.ok ? { ok: true, text: reset ? "Reset to defaults." : "Saved. The dashboard and the next brief use these weights." } : { ok: false, text: body.error });
  }

  return (
    <section className="mt-10 rounded-2xl border border-line bg-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Scoring weights</h2>
          <p className="mt-1 text-sm text-muted">Each group must total 100. Changes apply immediately to Explore and to the next run.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => save(true)} disabled={busy} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-panel/5">Reset to defaults</button>
          <button onClick={() => save()} disabled={busy || !allOk} className="rounded-lg accent-gradient px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">Save weights</button>
        </div>
      </div>
      <label className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-violet/10 p-4 text-sm">
        <span className="font-medium">Guest gate:</span> a guest must appear on at least
        <select value={gate} onChange={(e) => setGate(Number(e.target.value))} className="rounded-md border border-line bg-panel px-2 py-1">
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        India show{gate === 1 ? "" : "s"} in 30 days to appear in “Book this week”.
        <span className="text-muted">Spec default is 2 (media rounds); 1 lists every recent guest, ranked.</span>
      </label>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {groups.map((g) => {
          const ok = Math.abs(totals[g.title] - 100) < 0.01;
          return (
            <div key={g.title} className="rounded-xl bg-panel2 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{g.title}</h3>
                <span className={`text-sm tabular-nums ${ok ? "text-mint" : "text-rose-400"}`}>total = {totals[g.title]}{ok ? " ✓" : " (must be 100)"}</span>
              </div>
              <div className="mt-3 space-y-2">
                {g.keys.map((k) => (
                  <label key={k} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-fg/80">{LABELS[k] ?? k}</span>
                    <input
                      type="number" min={0} max={100} step={1} value={w[k]}
                      onChange={(e) => setW({ ...w, [k]: e.target.value === "" ? 0 : Number(e.target.value) })}
                      className="w-20 rounded-md border border-line bg-panel2 text-fg px-2 py-1 text-right tabular-nums"
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {msg && <p className={`mt-4 text-sm ${msg.ok ? "text-mint" : "text-rose-400"}`}>{msg.text}</p>}
    </section>
  );
}
