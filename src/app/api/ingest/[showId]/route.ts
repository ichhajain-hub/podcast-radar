import { after, NextResponse } from "next/server";
import { isCron, unauthorized } from "@/lib/auth";
import { processShowInRun } from "@/lib/pipeline";

export const maxDuration = 300;

// Ingests one show. Answers 202 at once; the work continues in this same invocation.
export async function POST(req: Request, ctx: RouteContext<"/api/ingest/[showId]">) {
  if (!isCron(req)) return unauthorized();
  const { showId } = await ctx.params;
  const { runId } = (await req.json().catch(() => ({}))) as { runId?: string };
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });
  after(() => processShowInRun(runId, showId));
  return NextResponse.json({ accepted: true }, { status: 202 });
}
