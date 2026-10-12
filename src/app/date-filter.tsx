"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addDays, istDay, istMonday } from "@/lib/dates";

export type Preset = "this-week" | "last-week" | "2-weeks-ago" | "last-30" | "custom";

export function presetRange(p: Exclude<Preset, "custom">, now = new Date()): { from: string; to: string } {
  const monday = istMonday(now);
  const tomorrow = addDays(istDay(now), 1);
  switch (p) {
    case "this-week": return { from: monday, to: tomorrow };
    case "last-week": return { from: addDays(monday, -7), to: monday };
    case "2-weeks-ago": return { from: addDays(monday, -14), to: addDays(monday, -7) };
    case "last-30": return { from: addDays(istDay(now), -29), to: tomorrow };
  }
}

const PRESETS: { id: Exclude<Preset, "custom">; label: string }[] = [
  { id: "this-week", label: "This week" },
  { id: "last-week", label: "Last week" },
  { id: "2-weeks-ago", label: "2 weeks ago" },
  { id: "last-30", label: "Last 30 days" },
];

export function DateFilter(props: { preset: Preset | null; from: string; to: string; view: "sent" | "explore"; historyStart: string | null }) {
  const router = useRouter();
  const [custom, setCustom] = useState(props.preset === "custom");
  const [from, setFrom] = useState(props.from);
  const [toIncl, setToIncl] = useState(addDays(props.to, -1));
  const today = istDay(new Date());

  const go = (q: { preset: Preset; from: string; to: string; view: "sent" | "explore" }) =>
    router.push(`/?preset=${q.preset}&from=${q.from}&to=${q.to}&view=${q.view}`);

  const pick = (p: Exclude<Preset, "custom">) => {
    setCustom(false);
    go({ preset: p, ...presetRange(p), view: props.view });
  };

  const btn = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm transition ${active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`;

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => pick(p.id)} className={btn(!custom && props.preset === p.id)}>{p.label}</button>
          ))}
          <button onClick={() => setCustom(true)} className={btn(custom)}>Custom range</button>
        </div>
        <div className="inline-flex rounded-full bg-slate-100 p-1 text-sm" role="tablist" aria-label="View">
          {(["sent", "explore"] as const).map((v) => (
            <button
              key={v} role="tab" aria-selected={props.view === v}
              onClick={() => go({ preset: props.preset ?? "custom", from: props.from, to: props.to, view: v })}
              className={`rounded-full px-3 py-1 ${props.view === v ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600"}`}
            >
              {v === "sent" ? "As sent" : "Explore"}
            </button>
          ))}
        </div>
      </div>
      {custom && (
        <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1 text-slate-600">From
            <input type="date" value={from} min={props.historyStart ?? undefined} max={today} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 text-slate-600">To
            <input type="date" value={toIncl} min={from} max={today} onChange={(e) => setToIncl(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5" />
          </label>
          <button
            disabled={!from || !toIncl || from > toIncl}
            onClick={() => go({ preset: "custom", from, to: addDays(toIncl, 1), view: props.view })}
            className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white disabled:opacity-50"
          >Apply</button>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        {props.historyStart ? `History starts ${new Date(`${props.historyStart}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}. ` : ""}
        <b>As sent</b> shows the stored brief for each week, exactly as emailed. <b>Explore</b> recomputes any range live with the current weights.
      </p>
    </div>
  );
}
