"use client";
import { useState } from "react";
import { formatIST } from "@/lib/format";

type Run = { id: string; started_at: string; finished_at: string | null; status: string | null; mode: string | null };

export function RunPanel({ lastRun, recipient }: { lastRun: Run | null; recipient: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [email, setEmail] = useState(recipient);
  const [saved, setSaved] = useState(recipient);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveEmail() {
    setEmailMsg(null);
    const res = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ brief_recipient_email: email }) });
    const body = await res.json();
    if (res.ok) setSaved(email.split(",").map((x) => x.trim()).filter(Boolean).join(", "));
    setEmailMsg(res.ok ? { ok: true, text: "Saved. The Monday brief and test emails go here now." } : { ok: false, text: body.error });
  }
  const [busy, setBusy] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);

  async function testEmail() {
    setMailBusy(true);
    setMsg(null);
    const res = await fetch("/api/brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ test: true }) });
    const body = await res.json();
    setMailBusy(false);
    setMsg(res.ok ? `Test email sent to ${saved}: “${body.subject}”. Check the inbox (and spam).` : body.error);
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
    <section className="mt-10 rounded-2xl border border-line bg-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Run</h2>
          <p className="mt-1 text-sm text-muted">
            {lastRun
              ? <>Last run: {formatIST(lastRun.started_at)} · {lastRun.mode ?? "daily"} · <span className="font-medium">{lastRun.status}</span></>
              : "No runs yet."}{" "}
            <a href="/runs" className="text-violet hover:underline">Run log →</a>
            <br />Automatic: every day at 5:30 AM IST (refresh); on Mondays that run also emails the brief (arrives by ~6:35 AM IST).
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={testEmail} disabled={mailBusy} className="rounded-lg border border-violet/50 px-4 py-2.5 text-sm font-medium text-violet hover:bg-violet/10 disabled:opacity-50">
            {mailBusy ? "Sending…" : "Send test email"}
          </button>
          <button onClick={runNow} disabled={busy} className="rounded-lg accent-gradient px-5 py-2.5 font-medium text-white hover:brightness-110 disabled:opacity-50">
            {busy ? "Starting…" : "Run now"}
          </button>
        </div>
      </div>
      {msg && <p className="mt-3 text-sm text-fg/80">{msg}</p>}
      <div className="mt-6 border-t border-line pt-5">
        <label htmlFor="brief-email" className="text-sm font-medium">Email the brief to</label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            id="brief-email" type="text" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com, another@example.com"
            className="w-full max-w-md rounded-lg border border-line bg-panel2 text-fg px-3 py-2 text-sm outline-none focus:border-violet"
          />
          <button onClick={saveEmail} disabled={!email.trim() || email === saved} className="rounded-lg accent-gradient px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">
            Save email
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Up to 5 addresses, separated by commas. Use “Send test email” to check delivery. On Resend&apos;s free plan, mail is only delivered to
          the address the Resend account was created with, unless you verify a domain at resend.com/domains.
        </p>
        {emailMsg && <p className={`mt-2 text-sm ${emailMsg.ok ? "text-mint" : "text-rose-400"}`}>{emailMsg.text}</p>}
      </div>
    </section>
  );
}
