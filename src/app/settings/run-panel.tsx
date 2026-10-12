"use client";
import { useState } from "react";
import { formatIST } from "@/lib/format";

type Run = { id: string; started_at: string; finished_at: string | null; status: string | null; mode: string | null };

export function RunPanel({ lastRun }: { lastRun: Run | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runNow() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/run?mode=daily");
    const body = await res.json();
    setBusy(false);
    setMsg(res.ok ? `Started: ingesting ${body.shows} active shows. It takes a few minutes — watch progress on the Runs page.` : body.error);
  }

  return (
    <section className="mt-10 rounded-2xl border border-slate-200 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Run</h2>
          <p className="mt-1 text-sm text-slate-600">
            {lastRun
              ? <>Last run: {formatIST(lastRun.started_at)} · {lastRun.mode ?? "daily"} · <span className="font-medium">{lastRun.status}</span></>
              : "No runs yet."}{" "}
            <a href="/runs" className="text-indigo-600 hover:underline">Run log →</a>
          </p>
        </div>
        <button onClick={runNow} disabled={busy} className="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {busy ? "Starting…" : "Run now"}
        </button>
      </div>
      {msg && <p className="mt-3 text-sm text-slate-700">{msg}</p>}
    </section>
  );
}
