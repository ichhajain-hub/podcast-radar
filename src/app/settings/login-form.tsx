"use client";
import { useState } from "react";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    setBusy(false);
    if (res.ok) window.location.reload();
    else setError((await res.json()).error ?? "Sign-in failed");
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <input
        type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password"
        className="w-full rounded-lg border border-line bg-panel2 text-fg px-4 py-3 outline-none focus:border-violet focus:ring-2 focus:ring-violet/20"
      />
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button disabled={busy || !password} className="w-full rounded-lg accent-gradient px-4 py-3 font-medium text-white hover:brightness-110 disabled:opacity-50">
        {busy ? "Checking…" : "Sign in"}
      </button>
      <p className="text-xs text-muted">You stay signed in on this browser for 7 days.</p>
    </form>
  );
}
