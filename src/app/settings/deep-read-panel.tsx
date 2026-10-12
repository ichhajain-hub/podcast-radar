"use client";
import { useState } from "react";

export function DeepReadPanel(props: { maxMinutes: number; priceIn: number; priceOut: number; spendWeek: string; spendMonth: string; tokensWeek: string; tokensMonth: string }) {
  const [max, setMax] = useState(props.maxMinutes);
  const [pin, setPin] = useState(props.priceIn);
  const [pout, setPout] = useState(props.priceOut);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setMsg(null);
    const res = await fetch("/api/settings", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ deep_read_max_minutes: max, price_input_per_1m: pin, price_output_per_1m: pout }),
    });
    const body = await res.json();
    setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: body.error });
  }

  const field = "w-28 rounded-md border border-slate-300 px-2 py-1.5 text-right tabular-nums";
  return (
    <section className="mt-10 rounded-2xl border border-slate-200 p-6">
      <h2 className="text-lg font-semibold">YouTube deep-read &amp; spend</h2>
      <p className="mt-1 text-sm text-slate-600">
        Gemini watches each India episode&apos;s YouTube video at low resolution (~100 tokens per second) to catch spoken sponsor reads.
        Anything after the minute cap is not read.
      </p>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div className="space-y-3 text-sm">
          <label className="flex items-center justify-between gap-3">
            <span>Max minutes read per video <span className="text-slate-500">(0 = full video)</span></span>
            <input type="number" min={0} max={600} value={max} onChange={(e) => setMax(Number(e.target.value))} className={field} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Input price per 1M tokens (USD)</span>
            <input type="number" min={0} step={0.01} value={pin} onChange={(e) => setPin(Number(e.target.value))} className={field} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Output price per 1M tokens (USD)</span>
            <input type="number" min={0} step={0.01} value={pout} onChange={(e) => setPout(Number(e.target.value))} className={field} />
          </label>
          <p className="text-xs text-slate-500">≈ ${((max || 180) * 60 * 100 * pin / 1e6).toFixed(2)} per video at this cap.</p>
          <button onClick={save} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700">Save</button>
          {msg && <p className={msg.ok ? "text-emerald-700" : "text-red-600"}>{msg.text}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-2xl font-semibold text-indigo-600">{props.spendWeek}</div>
            <div className="text-sm text-slate-600">Est. Gemini spend this week</div>
            <div className="text-xs text-slate-500">{props.tokensWeek} tokens</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-2xl font-semibold text-indigo-600">{props.spendMonth}</div>
            <div className="text-sm text-slate-600">This month</div>
            <div className="text-xs text-slate-500">{props.tokensMonth} tokens</div>
          </div>
        </div>
      </div>
    </section>
  );
}
