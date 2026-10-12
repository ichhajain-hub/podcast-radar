import Link from "next/link";
import { addDays } from "@/lib/dates";
import { formatIST } from "@/lib/format";
import { db } from "@/lib/supabase";
import type { BriefContent } from "@/lib/brief";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const { data } = await db().from("briefs").select("week_start, sent_at, content_json").order("week_start", { ascending: false });
  const briefs = (data ?? []) as { week_start: string; sent_at: string | null; content_json: BriefContent }[];
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <Link href="/" className="text-sm text-indigo-600 hover:underline">← Dashboard</Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Archive</h1>
      <p className="mt-1 text-slate-600">Every weekly brief, exactly as it was stored.</p>
      <ul className="mt-8 divide-y divide-slate-100 rounded-2xl border border-slate-200">
        {briefs.map((b) => (
          <li key={b.week_start} className="flex flex-wrap items-center justify-between gap-2 p-5">
            <div>
              <Link href={`/?preset=custom&from=${b.week_start}&to=${addDays(b.week_start, 7)}`} className="font-medium text-indigo-600 hover:underline">
                Week of {fmt(b.week_start)} – {fmt(addDays(b.week_start, 6))}
              </Link>
              <div className="text-sm text-slate-500">
                {b.sent_at ? `Emailed ${formatIST(b.sent_at)}` : "Backfilled (not emailed)"} · {b.content_json.stats.episodes_scanned} episodes
              </div>
            </div>
            <div className="text-sm text-slate-600">
              {b.content_json.guests.length} guests · {b.content_json.topics.length} topics · {b.content_json.sponsors.length} brands · {b.content_json.global.length} global
            </div>
          </li>
        ))}
        {!briefs.length && <li className="p-6 text-center text-slate-500">No briefs yet.</li>}
      </ul>
    </main>
  );
}
