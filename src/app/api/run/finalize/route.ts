import { after, NextResponse } from "next/server";
import { isCron, unauthorized } from "@/lib/auth";
import { finalizeRun } from "@/lib/pipeline";

export const maxDuration = 300;

// Rescore after a run (and write the brief in weekly mode) in its own function invocation.
export async function POST(req: Request) {
  if (!isCron(req)) return unauthorized();
  const { runId } = (await req.json().catch(() => ({}))) as { runId?: string };
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });
  after(() => finalizeRun(runId));
  return NextResponse.json({ accepted: true }, { status: 202 });
}
