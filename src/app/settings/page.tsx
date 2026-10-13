import { AppShell } from "@/components/app-shell";
import type { Metadata } from "next";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { LoginForm } from "./login-form";
import { ShowsPanel, type Show } from "./shows-panel";
import { RunPanel } from "./run-panel";
import { WeightsPanel } from "./weights-panel";
import { DeepReadPanel } from "./deep-read-panel";
import { DEFAULT_WEIGHTS, loadWeights, WEIGHT_GROUPS } from "@/lib/weights";
import { briefRecipients, getSetting, SETTING_DEFAULTS } from "@/lib/settings";
import { spendSummary, usd } from "@/lib/spend";

export const metadata: Metadata = { title: "Settings · Podcast Radar" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await isAdmin())) {
    return (
      <AppShell active="settings"><div className="mx-auto w-full max-w-md rounded-2xl border border-line bg-panel p-8 mt-10">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-muted">Enter the admin password to edit shows and weights.</p>
        <LoginForm />
      </div></AppShell>
    );
  }

  const [{ data: shows }, { data: runs }, weights, maxMin, spend, gate, recipient] = await Promise.all([
    db().from("shows").select("*").order("region").order("name"),
    db().from("runs").select("id, started_at, finished_at, status, mode").order("started_at", { ascending: false }).limit(1),
    loadWeights(),
    getSetting("deep_read_max_minutes", SETTING_DEFAULTS.deep_read_max_minutes),
    spendSummary(),
    getSetting("guest_min_shows", SETTING_DEFAULTS.guest_min_shows),
    briefRecipients(),
  ]);

  return (
    <AppShell active="settings">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
              <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-muted">Changes apply to the next run. No code or redeploy needed.</p>
        </div>
      </div>
      <RunPanel lastRun={runs?.[0] ?? null} recipient={recipient} />
      <ShowsPanel initial={(shows ?? []) as Show[]} />
      <WeightsPanel initial={weights} defaults={{ ...DEFAULT_WEIGHTS }} groups={WEIGHT_GROUPS.map((g) => ({ title: g.title, keys: g.keys }))} guestMinShows={Number(gate)} />
      <DeepReadPanel
        maxMinutes={Number(maxMin)} priceIn={spend.prices.input} priceOut={spend.prices.output}
        spendWeek={usd(spend.week)} spendMonth={usd(spend.month)}
        tokensWeek={spend.weekTokens.toLocaleString("en-IN")} tokensMonth={spend.monthTokens.toLocaleString("en-IN")}
      />
    </AppShell>
  );
}
