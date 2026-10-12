import Link from "next/link";
import { RadarView } from "@/components/radar-view";
import { addDays, isDay, istDay, istDayStart, istMonday } from "@/lib/dates";
import { formatIST } from "@/lib/format";
import { explore, historyStart, latestBriefWeek, sentBriefs } from "@/lib/history";
import { db } from "@/lib/supabase";
import { DateFilter, type Preset } from "./date-filter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Search = { tab?: string; preset?: string; from?: string; to?: string; view?: string };

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const now = new Date();
  const thisMonday = istMonday(now);
  const tomorrow = addDays(istDay(now), 1);

  const [{ data: runs }, start, latestWeek] = await Promise.all([
    db().from("runs").select("finished_at, shows_failed").not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(1),
    historyStart(),
    latestBriefWeek(),
  ]);
  const lastRun = runs?.[0];

  // Which view: the two tabs, or a date-filter selection.
  const filtered = isDay(q.from) && isDay(q.to) && q.from < q.to;
  // The home page opens on the latest brief; "This week so far" is a click away (it's thin early in the week).
  const tab = filtered ? null : q.tab === "week" ? "week" : "last";
  let from = filtered ? q.from! : thisMonday;
  let to = filtered ? q.to! : tomorrow;
  let view: "sent" | "explore" = filtered ? (q.view === "sent" ? "sent" : "explore") : "explore";
  if (tab === "last") {
    view = "sent";
    from = latestWeek ?? addDays(thisMonday, -7);
    to = addDays(from, 7);
  }
  const preset = (filtered ? (q.preset as Preset) ?? "custom" : tab === "week" ? "this-week" : null);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-indigo-600">Podcast Ecosystem Radar</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your weekly radar</h1>
          <p className="mt-1 text-sm text-slate-500">Last refreshed: {formatIST(lastRun?.finished_at)}</p>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/archive" className="text-indigo-600 hover:underline">Archive</Link>
          <Link href="/runs" className="text-indigo-600 hover:underline">Runs</Link>
          <Link href="/settings" className="text-indigo-600 hover:underline">Settings</Link>
        </nav>
      </header>

      <div className="mt-8 flex gap-6 border-b border-slate-200 text-sm font-medium">
        <TabLink href="/" active={tab === "last"}>Last Monday&apos;s brief</TabLink>
        <TabLink href="/?tab=week" active={tab === "week"}>This week so far</TabLink>
      </div>

      <div className="mt-6">
        <DateFilter preset={preset} from={from} to={to} view={view} historyStart={start} />
      </div>

      <div className="mt-10">
        {view === "explore" ? (
          <ExploreView from={from} to={to} showsFailed={tab === "week" ? lastRun?.shows_failed ?? [] : []} thisWeek={tab === "week"} />
        ) : (
          <SentView from={from} to={to} />
        )}
      </div>

      <footer className="mt-16 border-t border-slate-200 pt-6 text-sm text-slate-500">
        Built with Gemini Flash · Edit your shows in <Link href="/settings" className="text-indigo-600 hover:underline">Settings</Link>
      </footer>
    </main>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`-mb-px border-b-2 pb-3 ${active ? "border-indigo-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
      {children}
    </Link>
  );
}

async function ExploreView({ from, to, showsFailed, thisWeek }: { from: string; to: string; showsFailed: string[]; thisWeek: boolean }) {
  const result = await explore(from, to);
  const days = Math.max(1, Math.ceil((Date.parse(result.to) - istDayStart(from).getTime()) / 864e5));
  const earlyNote = thisWeek && days <= 3
    ? `It's early in the week: ${result.stats.episodes_scanned} episodes since Monday. Topics need 2+ India shows covering the same theme this week, so this fills in as the week goes on. Last Monday's brief has the full picture.`
    : undefined;
  return (
    <>
      <p className="mb-6 rounded-lg bg-indigo-50 px-4 py-2 text-sm text-indigo-800">
        {thisWeek ? "This week so far · " : "Explore · "}recomputed live from stored mentions with the current weights (rebuilt daily). Not the emailed brief.
      </p>
      <RadarView content={{ ...result, shows_failed: showsFailed }} earlyNote={earlyNote} />
    </>
  );
}

async function SentView({ from, to }: { from: string; to: string }) {
  const briefs = await sentBriefs(from, to);
  if (!briefs.length) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-600">
        No brief is stored for this period yet — briefs are written every Monday morning for the week before. Switch to <b>Explore</b> to recompute it live.
      </p>
    );
  }
  if (briefs.length > 1) {
    return (
      <div>
        <p className="text-sm text-slate-600">{briefs.length} weekly briefs in this range — pick one:</p>
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {briefs.map((b) => (
            <li key={b.week_start} className="flex items-center justify-between p-4 text-sm">
              <Link href={`/?preset=custom&view=sent&from=${b.week_start}&to=${addDays(b.week_start, 7)}`} className="font-medium text-indigo-600 hover:underline">
                Week of {new Date(`${b.week_start}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
              </Link>
              <span className="text-slate-500">{b.content.guests.length} guests · {b.content.topics.length} topics · {b.content.sponsors.length} brands</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const b = briefs[0];
  return (
    <>
      <p className="mb-6 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">
        As sent · {b.sent_at ? `emailed ${formatIST(b.sent_at)}` : `stored ${formatIST(b.content.generated_at)} (history backfill, not emailed)`} · this record never changes.
      </p>
      <RadarView content={b.content} />
    </>
  );
}
