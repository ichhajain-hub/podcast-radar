import { NextResponse } from "next/server";
import { isDay } from "@/lib/dates";
import { explore, sentBriefs, topOnly } from "@/lib/history";

export const maxDuration = 60;

// GET /api/history?from=YYYY-MM-DD&to=YYYY-MM-DD&view=sent|explore
// sent    -> the stored briefs for weeks in the range, exactly as emailed
// explore -> guests/topics/sponsors/global recomputed live from mentions with current weights
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const from = q.get("from");
  const to = q.get("to");
  const view = q.get("view") === "sent" ? "sent" : "explore";
  if (!isDay(from) || !isDay(to) || from >= to) {
    return NextResponse.json({ error: "Use from=YYYY-MM-DD&to=YYYY-MM-DD with from < to (to is exclusive)" }, { status: 400 });
  }
  try {
    if (view === "sent") return NextResponse.json({ view, from, to, briefs: await sentBriefs(from, to) });
    const full = q.get("full") === "1";
    const r = await explore(from, to);
    return NextResponse.json({ view, from, to, recomputed: true, result: full ? r : topOnly(r) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
