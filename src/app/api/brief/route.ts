import { NextResponse } from "next/server";
import { isAdmin, isCron, unauthorized } from "@/lib/auth";
import { isDay } from "@/lib/dates";
import { sendTestEmail, writeAndSendBrief } from "@/lib/send";

export const maxDuration = 300;

// POST /api/brief            -> write + store + email last week's brief (weekly cron does this)
// POST /api/brief {test:true}-> email the latest stored brief as a test (Settings button)
// POST /api/brief {week, send:false} -> (re)write and store a week without emailing
export async function POST(req: Request) {
  if (!isCron(req) && !(await isAdmin())) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { week?: string; send?: boolean; test?: boolean; showsFailed?: string[] };
  try {
    if (body.test) return NextResponse.json(await sendTestEmail());
    if (body.week && !isDay(body.week)) return NextResponse.json({ error: "week must be YYYY-MM-DD (a Monday)" }, { status: 400 });
    return NextResponse.json(await writeAndSendBrief({ week: body.week, send: body.send, showsFailed: body.showsFailed }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
