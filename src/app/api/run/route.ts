import { after, NextResponse } from "next/server";
import { isAdmin, isCron, unauthorized } from "@/lib/auth";
import { CooldownError, runPipeline, startRun, type RunMode } from "@/lib/pipeline";

export const maxDuration = 300;

// Orchestrator. Vercel Cron calls it with `Authorization: Bearer CRON_SECRET`;
// the Settings "Run now" button calls it with the admin session cookie.
export async function GET(req: Request) {
  const cron = isCron(req);
  if (!cron && !(await isAdmin())) return unauthorized();
  const mode: RunMode = new URL(req.url).searchParams.get("mode") === "weekly" ? "weekly" : "daily";
  try {
    const r = await startRun(mode, cron ? "cron" : "admin");
    // Answer at once; the shows are processed after the response, within this function's time limit.
    after(() => runPipeline(r.runId));
    return NextResponse.json({ started: true, mode, ...r });
  } catch (e) {
    const status = e instanceof CooldownError ? 429 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
