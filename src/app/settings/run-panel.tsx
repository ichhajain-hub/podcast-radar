"use client";
import { useState } from "react";
import { formatIST } from "@/lib/format";

type Run = { id: string; started_at: string; finished_at: string | null; status: string | null; mode: string | null };

export function RunPanel({ lastRun }: { lastRun: Run | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);

  async function testEmail() {
    setMailBusy(true);
    setMsg(null);
    const res = await fetch("/api/brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ test: true }) });
    const body = await res.json();
    setMailBusy(false);
    setMsg(res.ok ? `Test email sent: “${body.subject}”. Check your inbox (and spam).` : body.error);
  }

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
            <br />Automatic: daily 5:30 AM IST (refresh) and Mondays 6:30 AM IST (brief email).
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={testEmail} disabled={mailBusy} className="rounded-lg border border-indigo-600 px-4 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
            {mailBusy ? "Sending…" : "Send test email"}
          </button>
          <button onClick={runNow} disabled={busy} className="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? "Starting…" : "Run now"}
          </button>
        </div>
      </div>
      {msg && <p className="mt-3 text-sm text-slate-700">{msg}</p>}
    </section>
  );
}
