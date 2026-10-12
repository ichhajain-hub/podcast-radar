import Link from "next/link";
import { RadarView } from "@/components/radar-view";
import { addDays, isDay, istDay, istDayStart, istMonday } from "@/lib/dates";
import { formatDate, formatIST } from "@/lib/format";
import { explore, historyStart, latestBriefWeek, sentBriefs } from "@/lib/history";
import { db } from "@/lib/supabase";
import { DateFilter, type Preset } from "./date-filter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Search = { tab?: string; preset?: string; from?: string; to?: string };

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

  // Which view: the two tabs, or a date-filter selection. No toggle: a week that has a stored
  // Monday brief shows that brief exactly as written; any other range is calculated live.
  const filtered = isDay(q.from) && isDay(q.to) && q.from < q.to;
  const tab = filtered ? null : q.tab === "week" ? "week" : "last";
  let from = filtered ? q.from! : thisMonday;
  let to = filtered ? q.to! : tomorrow;
  if (tab === "last") {
    from = latestWeek ?? addDays(thisMonday, -7);
    to = addDays(from, 7);
  }
  const isWeek = from === istMonday(istDayStart(from)) && to === addDays(from, 7);
  const stored = isWeek ? (await sentBriefs(from, to))[0] ?? null : null;
  const preset = (filtered ? (q.preset as Preset) ?? "custom" : tab === "week" ? "this-week" : null);

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 12a8 8 0 0 1 8-8M7.5 12A4.5 4.5 0 0 1 12 7.5" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></svg>
            </span>
            <span className="font-semibold tracking-tight text-slate-900">Podcast Ecosystem Radar</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            {[["/archive", "Archive"], ["/runs", "Runs"], ["/settings", "Settings"]].map(([href, label]) => (
              <Link key={href} href={href} className="rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">{label}</Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Your weekly radar</h1>
            <p className="mt-1 text-sm text-slate-500">Who to book, what to talk about, who to pitch · Last refreshed {formatIST(lastRun?.finished_at)}</p>
          </div>
          <div className="inline-flex rounded-full bg-slate-200/70 p-1 text-sm font-medium">
            <TabLink href="/" active={tab === "last"}>Last Monday&apos;s brief</TabLink>
            <TabLink href="/?tab=week" active={tab === "week"}>This week so far</TabLink>
          </div>
        </div>

        <div className="mt-8">
          <DateFilter preset={preset} from={from} to={to} historyStart={start} />
        </div>

        <div className="mt-8">
          {stored ? (
            <>
              <Banner>
                Monday brief for {formatDate(istDayStart(from).toISOString())} – {formatDate(istDayStart(addDays(from, 6)).toISOString())} · {stored.sent_at ? `emailed ${formatIST(stored.sent_at)}` : `written ${formatIST(stored.content.generated_at)}`}
              </Banner>
              <RadarView content={stored.content} />
            </>
          ) : (
            <LiveView from={from} to={to} showsFailed={tab === "week" ? lastRun?.shows_failed ?? [] : []} thisWeek={tab === "week"} />
          )}
        </div>

        <footer className="mt-16 border-t border-slate-200 pt-6 text-sm text-slate-500">
          Built with Gemini Flash · Edit your shows in <Link href="/settings" className="text-indigo-600 hover:underline">Settings</Link>
        </footer>
      </main>
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return <p className="mb-8 inline-flex rounded-full bg-white px-4 py-1.5 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">{children}</p>;
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-full px-4 py-1.5 transition ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
      {children}
    </Link>
  );
}

async function LiveView({ from, to, showsFailed, thisWeek }: { from: string; to: string; showsFailed: string[]; thisWeek: boolean }) {
  const result = await explore(from, to);
  const days = Math.max(1, Math.ceil((Date.parse(result.to) - istDayStart(from).getTime()) / 864e5));
  const earlyNote = thisWeek && days <= 3
    ? `It's early in the week: ${result.stats.episodes_scanned} episodes since Monday. Topics need 2+ India shows covering the same theme this week, so this fills in as the week goes on. Last Monday's brief has the full picture.`
    : undefined;
  return (
    <>
      <Banner>{thisWeek ? "This week so far · refreshed every morning" : "Calculated live from the latest data and current weights"}</Banner>
      <RadarView content={{ ...result, shows_failed: showsFailed }} earlyNote={earlyNote} />
    </>
  );
}
