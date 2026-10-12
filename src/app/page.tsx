import { RadarView } from "@/components/radar-view";
import { formatIST } from "@/lib/format";
import { scoreRange } from "@/lib/scoring-data";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Home() {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 864e5);
  const [result, { data: runs }] = await Promise.all([
    scoreRange(from, to),
    db().from("runs").select("finished_at, shows_failed, status").not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(1),
  ]);
  const last = runs?.[0];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-indigo-600">Podcast Ecosystem Radar</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Last 7 days</h1>
          <p className="mt-1 text-sm text-slate-500">Last refreshed: {formatIST(last?.finished_at)}</p>
        </div>
        <nav className="flex gap-4 text-sm">
          <a href="/settings" className="text-indigo-600 hover:underline">Settings</a>
        </nav>
      </header>
      <div className="mt-10">
        <RadarView content={{ ...result, shows_failed: last?.shows_failed ?? [] }} />
      </div>
      <footer className="mt-16 border-t border-slate-200 pt-6 text-sm text-slate-500">
        Built with Gemini Flash · Edit your shows in <a href="/settings" className="text-indigo-600 hover:underline">Settings</a>
      </footer>
    </main>
  );
}
