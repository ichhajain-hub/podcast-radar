import { after, NextResponse } from "next/server";
import { isCron, unauthorized } from "@/lib/auth";
import { finalizeRun } from "@/lib/pipeline";

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!isCron(req)) return unauthorized();
  const { runId } = (await req.json().catch(() => ({}))) as { runId?: string };
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });
  after(() => finalizeRun(runId));
  return NextResponse.json({ accepted: true }, { status: 202 });
}
