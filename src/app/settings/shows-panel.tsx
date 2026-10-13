"use client";
import { Fragment, useMemo, useState } from "react";

export type Show = {
  id: string;
  name: string;
  rss_url: string;
  youtube_channel_url: string | null;
  region: "india" | "global" | "own";
  active: boolean;
  hosts: string[] | null;
  last_fetch_status: string | null;
};

type Draft = { name: string; rss_url: string; youtube_channel_url: string; region: Show["region"]; hosts: string };
const EMPTY: Draft = { name: "", rss_url: "", youtube_channel_url: "", region: "india", hosts: "" };

const toDraft = (s: Show): Draft => ({
  name: s.name, rss_url: s.rss_url, youtube_channel_url: s.youtube_channel_url ?? "", region: s.region, hosts: (s.hosts ?? []).join(", "),
});
const toBody = (d: Draft) => ({
  name: d.name, rss_url: d.rss_url, youtube_channel_url: d.youtube_channel_url, region: d.region,
  hosts: d.hosts.split(",").map((h) => h.trim()).filter(Boolean),
});

const REGION_LABEL = { india: "India", global: "Global", own: "Own" } as const;

export function ShowsPanel({ initial }: { initial: Show[] }) {
  const [shows, setShows] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const counts = useMemo(() => {
    const active = shows.filter((s) => s.active);
    return {
      india: active.filter((s) => s.region === "india").length,
      global: active.filter((s) => s.region === "global").length,
      own: shows.filter((s) => s.region === "own").length,
    };
  }, [shows]);

  async function call(id: string, url: string, init: RequestInit) {
    setBusy(id);
    setNotice(null);
    const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setNotice({ id, ok: false, text: body.error ?? `Failed (${res.status})` });
      return null;
    }
    return body;
  }

  async function save(id: string) {
    const body = await call(id, `/api/shows/${id}`, { method: "PATCH", body: JSON.stringify(toBody(draft)) });
    if (!body) return;
    setShows((xs) => xs.map((s) => (s.id === id ? body.show : s)));
    setEditing(null);
    setNotice({ id, ok: true, text: body.check ? `Feed OK — latest episode: “${body.check.latest_title}”` : "Saved." });
  }

  async function add() {
    const body = await call("new", "/api/shows", { method: "POST", body: JSON.stringify({ ...toBody(draft), active: true }) });
    if (!body) return;
    setShows((xs) => [...xs, body.show]);
    setAdding(false);
    setDraft(EMPTY);
    setNotice({ id: body.show.id, ok: true, text: `Added. Feed OK — latest episode: “${body.check.latest_title}”` });
  }

  async function toggle(s: Show) {
    const body = await call(s.id, `/api/shows/${s.id}`, { method: "PATCH", body: JSON.stringify({ active: !s.active }) });
    if (body) setShows((xs) => xs.map((x) => (x.id === s.id ? body.show : x)));
  }

  async function remove(s: Show) {
    if (!confirm(`Delete “${s.name}”?`)) return;
    const body = await call(s.id, `/api/shows/${s.id}`, { method: "DELETE" });
    if (body) setShows((xs) => xs.filter((x) => x.id !== s.id));
  }

  const input = "w-full rounded-md border border-line bg-panel2 text-fg px-2 py-1.5 text-sm outline-none focus:border-violet";
  const editor = (onSave: () => void, onCancel: () => void, key: string) => (
    <tr className="bg-violet/5">
      <td className="p-2 align-top">
        <input className={input} placeholder="Show name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input className={`${input} mt-2`} placeholder="Host names, comma separated" value={draft.hosts} onChange={(e) => setDraft({ ...draft, hosts: e.target.value })} />
      </td>
      <td className="p-2 align-top">
        <input className={input} placeholder="https://… RSS feed, or a YouTube channel link" value={draft.rss_url} onChange={(e) => setDraft({ ...draft, rss_url: e.target.value })} />
        <input className={`${input} mt-2`} placeholder="YouTube channel URL (optional)" value={draft.youtube_channel_url} onChange={(e) => setDraft({ ...draft, youtube_channel_url: e.target.value })} />
      </td>
      <td className="p-2 align-top">
        <select className={input} value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value as Show["region"] })}>
          <option value="india">India</option><option value="global">Global</option><option value="own">Own</option>
        </select>
      </td>
      <td className="p-2 align-top" colSpan={2}>
        <div className="flex gap-2">
          <button onClick={onSave} disabled={busy === key} className="rounded-md accent-gradient px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy === key ? "Checking feed…" : "Save"}
          </button>
          <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-panel/5">Cancel</button>
        </div>
        {notice?.id === key && !notice.ok && <p className="mt-2 text-sm text-bad">{notice.text}</p>}
      </td>
    </tr>
  );

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Shows</h2>
          <p className="mt-1 text-sm text-muted">
            India: <b>{counts.india}/10</b> · Global: <b>{counts.global}</b> · Own: <b>{counts.own}</b>
            <span className="text-dim"> (active shows)</span>
          </p>
          {counts.india !== 10 && (
            <p className="mt-2 rounded-md bg-amber-400/10 px-3 py-2 text-sm text-warn">
              Heads up: the radar is designed for exactly 10 active India shows (you have {counts.india}). Runs still work.
            </p>
          )}
        </div>
        {!adding && (
          <button onClick={() => { setAdding(true); setEditing(null); setDraft(EMPTY); }} className="rounded-lg border border-violet/50 px-4 py-2 text-sm font-medium text-violet hover:bg-violet/10">
            + Add show
          </button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-panel2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="p-3 font-medium">Show</th><th className="p-3 font-medium">Feeds</th>
              <th className="p-3 font-medium">Region</th><th className="p-3 font-medium">Active</th>
              <th className="p-3 font-medium">Last fetch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {adding && editor(add, () => setAdding(false), "new")}
            {shows.map((s) =>
              editing === s.id ? (
                <Fragment key={s.id}>{editor(() => save(s.id), () => setEditing(null), s.id)}</Fragment>
              ) : (
                <tr key={s.id} className={s.active ? "" : "text-dim"}>
                  <td className="p-3 align-top">
                    <div className="font-medium text-fg">{s.name}</div>
                    {!!s.hosts?.length && <div className="text-xs text-muted">Host: {s.hosts.join(", ")}</div>}
                    <div className="mt-1 flex gap-3 text-xs">
                      <button onClick={() => { setEditing(s.id); setAdding(false); setDraft(toDraft(s)); }} className="text-violet hover:underline">Edit</button>
                      <button onClick={() => remove(s)} className="text-muted hover:text-bad">Delete</button>
                    </div>
                  </td>
                  <td className="max-w-xs p-3 align-top">
                    <a href={s.rss_url} target="_blank" rel="noreferrer" className="block truncate text-muted hover:text-violet">{s.rss_url}</a>
                    {s.youtube_channel_url && <a href={s.youtube_channel_url} target="_blank" rel="noreferrer" className="block truncate text-xs text-muted hover:text-violet">{s.youtube_channel_url}</a>}
                  </td>
                  <td className="p-3 align-top">{REGION_LABEL[s.region]}</td>
                  <td className="p-3 align-top">
                    <button
                      onClick={() => toggle(s)} disabled={busy === s.id} aria-pressed={s.active}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${s.active ? "accent-gradient" : "bg-line"} disabled:opacity-50`}
                    >
                      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${s.active ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                  <td className="max-w-xs p-3 align-top text-xs">
                    <span className={s.last_fetch_status?.startsWith("error") ? "text-bad" : "text-muted"}>{s.last_fetch_status ?? "—"}</span>
                    {notice?.id === s.id && <p className={`mt-1 ${notice.ok ? "text-mint" : "text-bad"}`}>{notice.text}</p>}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
