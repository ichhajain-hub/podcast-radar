import { NextResponse } from "next/server";
import { isCron, unauthorized } from "@/lib/auth";
import { ingestOne } from "@/lib/pipeline";

export const maxDuration = 300;

// Ingests one show and returns the result. Called by the orchestrator, 3 shows at a time.
export async function POST(req: Request, ctx: RouteContext<"/api/ingest/[showId]">) {
  if (!isCron(req)) return unauthorized();
  const { showId } = await ctx.params;
  const { runId } = (await req.json().catch(() => ({}))) as { runId?: string };
  return NextResponse.json(await ingestOne(runId ?? null, showId));
}
