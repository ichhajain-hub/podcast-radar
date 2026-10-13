import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { RadarView } from "@/components/radar-view";
import { addDays, isDay, istDay, istDayStart, istMonday } from "@/lib/dates";
import { formatDate, formatIST } from "@/lib/format";
import { explore, historyStart, latestBriefWeek, previousBrief, sentBriefs, weeklyEpisodeCounts } from "@/lib/history";
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

  // Which view: the two tabs, or a date-filter selection. A week that has a stored Monday brief
  // shows that brief exactly as written; any other range is calculated live.
  const filtered = isDay(q.from) && isDay(q.to) && q.from < q.to;
  const tab = filtered ? null : q.tab === "week" ? "week" : "last";
  let from = filtered ? q.from! : thisMonday;
  let to = filtered ? q.to! : tomorrow;
  if (tab === "last") {
    from = latestWeek ?? addDays(thisMonday, -7);
    to = addDays(from, 7);
  }
  const isWeek = from === istMonday(istDayStart(from)) && to === addDays(from, 7);
  const end = new Date(Math.min(istDayStart(to).getTime(), now.getTime()));
  const [stored, weekly, prev] = await Promise.all([
    isWeek ? sentBriefs(from, to).then((b) => b[0] ?? null) : Promise.resolve(null),
    weeklyEpisodeCounts(addDays(istMonday(new Date(end.getTime() - 1)), 7)),
    previousBrief(istMonday(istDayStart(from))),
  ]);
  const preset = (filtered ? (q.preset as Preset) ?? "custom" : tab === "week" ? "this-week" : null);
  const rangeLabel = `${formatDate(istDayStart(from).toISOString())} – ${formatDate(new Date(end.getTime() - 1).toISOString())}`;

  return (
    <AppShell active={tab === "week" ? "week" : "dashboard"} status={`Live data from 15 podcast feeds · refreshed ${formatIST(lastRun?.finished_at)}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">Welcome back, Aditya</h1>
          <p className="mt-1 text-sm text-muted">Here&apos;s who to book, what to talk about and who to pitch · {rangeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-line bg-panel p-1 text-sm font-medium">
            <TabLink href="/" active={tab === "last"}>Last Monday&apos;s brief</TabLink>
            <TabLink href="/?tab=week" active={tab === "week"}>This week so far</TabLink>
          </div>
          <Link href="/settings" className="flex items-center gap-2 rounded-xl accent-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet/25 transition hover:brightness-110">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg>
            Run radar
          </Link>
        </div>
      </div>

      <div className="mt-5">
        <DateFilter preset={preset} from={from} to={to} historyStart={start} />
      </div>

      <div className="mt-5">
        {stored ? (
          <>
            <Banner tone="violet">
              Monday brief for {rangeLabel} · {stored.sent_at ? `emailed ${formatIST(stored.sent_at)}` : `written ${formatIST(stored.content.generated_at)}`}
            </Banner>
            <RadarView content={stored.content} weekly={weekly} prev={prev} />
          </>
        ) : (
          <LiveView from={from} to={to} showsFailed={tab === "week" ? lastRun?.shows_failed ?? [] : []} thisWeek={tab === "week"} weekly={weekly} prev={prev} />
        )}
      </div>

      <footer className="mt-10 border-t border-line pt-5 text-xs text-dim">
        Built with Gemini Flash · Every item links to the episodes it came from · Edit shows in <Link href="/settings" className="text-violet hover:underline">Settings</Link>
      </footer>
    </AppShell>
  );
}

function Banner({ tone, children }: { tone: "violet" | "mint"; children: React.ReactNode }) {
  return (
    <p className={`mb-5 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${tone === "violet" ? "bg-violet/10 text-violet ring-violet/25" : "bg-mint/10 text-mint ring-mint/25"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone === "violet" ? "bg-violet" : "bg-mint"}`} />{children}
    </p>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-lg px-3.5 py-1.5 transition ${active ? "bg-panel2 text-fg ring-1 ring-inset ring-line" : "text-muted hover:text-fg"}`}>
      {children}
    </Link>
  );
}

async function LiveView({ from, to, showsFailed, thisWeek, weekly, prev }: {
  from: string; to: string; showsFailed: string[]; thisWeek: boolean;
  weekly: Awaited<ReturnType<typeof weeklyEpisodeCounts>>; prev: Awaited<ReturnType<typeof previousBrief>>;
}) {
  const result = await explore(from, to);
  const days = Math.max(1, Math.ceil((Date.parse(result.to) - istDayStart(from).getTime()) / 864e5));
  const earlyNote = thisWeek && days <= 3
    ? `It's early in the week: ${result.stats.episodes_scanned} episodes since Monday. Topics need 2+ India shows covering the same theme this week, so this fills in as the week goes on. Last Monday's brief has the full picture.`
    : undefined;
  return (
    <>
      <Banner tone="mint">{thisWeek ? "This week so far · refreshed every morning" : "Calculated live from the latest data and current weights"}</Banner>
      <RadarView content={{ ...result, shows_failed: showsFailed }} earlyNote={earlyNote} weekly={weekly} prev={thisWeek ? null : prev} />
    </>
  );
}
