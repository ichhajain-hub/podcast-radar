import { NextResponse } from "next/server";
import { isCron, unauthorized } from "@/lib/auth";
import { deepRead } from "@/lib/deepread";

// One YouTube video per function call, with the longest duration Vercel Hobby allows.
export const maxDuration = 300;

export async function POST(req: Request, ctx: RouteContext<"/api/deepread/[episodeId]">) {
  if (!isCron(req)) return unauthorized();
  const { episodeId } = await ctx.params;
  const { runId } = (await req.json().catch(() => ({}))) as { runId?: string };
  return NextResponse.json(await deepRead(episodeId, runId ?? null));
}
