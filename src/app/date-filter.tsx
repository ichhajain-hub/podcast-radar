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

/** Date presets + custom range. A week with a stored Monday brief shows that brief; any other range is calculated live. */
export function DateFilter(props: { preset: Preset | null; from: string; to: string; historyStart: string | null }) {
  const router = useRouter();
  const [custom, setCustom] = useState(props.preset === "custom");
  const [from, setFrom] = useState(props.from);
  const [toIncl, setToIncl] = useState(addDays(props.to, -1));
  const today = istDay(new Date());

  const go = (q: { preset: Preset; from: string; to: string }) => router.push(`/?preset=${q.preset}&from=${q.from}&to=${q.to}`);

  const btn = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition ${active ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => { setCustom(false); go({ preset: p.id, ...presetRange(p.id) }); }} className={btn(!custom && props.preset === p.id)}>
            {p.label}
          </button>
        ))}
        <button onClick={() => setCustom(!custom)} className={btn(custom)}>Custom range</button>
        {props.historyStart && (
          <span className="ml-auto text-xs text-slate-500">
            History starts {new Date(`${props.historyStart}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
          </span>
        )}
      </div>
      {custom && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-white p-3 text-sm ring-1 ring-inset ring-slate-200">
          <label htmlFor="range-from" className="flex flex-col gap-1 text-slate-600">From
            <input id="range-from" type="date" value={from} min={props.historyStart ?? undefined} max={today} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5" />
          </label>
          <label htmlFor="range-to" className="flex flex-col gap-1 text-slate-600">To
            <input id="range-to" type="date" value={toIncl} min={from} max={today} onChange={(e) => setToIncl(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5" />
          </label>
          <button
            disabled={!from || !toIncl || from > toIncl}
            onClick={() => go({ preset: "custom", from, to: addDays(toIncl, 1) })}
            className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white disabled:opacity-50"
          >Show</button>
        </div>
      )}
    </div>
  );
}
