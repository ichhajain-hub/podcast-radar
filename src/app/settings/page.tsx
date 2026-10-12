import Link from "next/link";
import type { Metadata } from "next";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { LoginForm } from "./login-form";
import { ShowsPanel, type Show } from "./shows-panel";
import { RunPanel } from "./run-panel";

export const metadata: Metadata = { title: "Settings · Podcast Radar" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-24">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-slate-600">Enter the admin password to edit shows and weights.</p>
        <LoginForm />
      </main>
    );
  }

  const [{ data: shows }, { data: runs }] = await Promise.all([
    db().from("shows").select("*").order("region").order("name"),
    db().from("runs").select("id, started_at, finished_at, status, mode").order("started_at", { ascending: false }).limit(1),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-indigo-600 hover:underline">← Dashboard</Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-slate-600">Changes apply to the next run. No code or redeploy needed.</p>
        </div>
      </div>
      <RunPanel lastRun={runs?.[0] ?? null} />
      <ShowsPanel initial={(shows ?? []) as Show[]} />
    </main>
  );
}
