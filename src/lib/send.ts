import { Resend } from "resend";
import { buildBrief, type BriefContent } from "./brief";
import { addDays, istMonday } from "./dates";
import { renderBriefHtml } from "./email";
import { briefRecipients } from "./settings";
import { db } from "./supabase";
import { writeBrief } from "./writer";

export function subjectFor(c: Pick<BriefContent, "guests" | "topics" | "sponsors">): string {
  return `Your Monday radar: ${c.guests.length} guests to book, ${c.topics.length} topics, ${c.sponsors.length} brands`;
}

async function deliver(subject: string, html: string): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  const to = await briefRecipients();
  const from = process.env.BRIEF_FROM_EMAIL ?? "Podcast Radar <onboarding@resend.dev>";
  if (!key || !to) throw new Error("No email address set. Add one under Email in Settings.");
  const { data, error } = await new Resend(key).emails.send({ from, to: to.split(",").map((s) => s.trim()), subject, html });
  if (error) {
    const hint = /only send testing emails|verify a domain/i.test(error.message)
      ? " Resend's free plan only delivers to the address the Resend account was created with, unless a domain is verified at resend.com/domains."
      : "";
    throw new Error(`Resend: ${error.message}${hint}`);
  }
  return data?.id ?? "";
}

/**
 * Writes the brief for the week starting `week` (scores in code, Gemini writes the lines),
 * stores it in `briefs`, and emails it. A week that was already emailed is never re-sent.
 */
export async function writeAndSendBrief(opts: { week?: string; runId?: string | null; showsFailed?: string[]; send?: boolean } = {}) {
  const week = opts.week ?? addDays(istMonday(new Date()), -7);
  const { data: existing } = await db().from("briefs").select("sent_at").eq("week_start", week).maybeSingle();
  if (existing?.sent_at) return { week, sent: false, note: "already sent" };
  const { content, html } = await buildBrief(week, { runId: opts.runId, showsFailed: opts.showsFailed, writer: writeBrief });
  if (opts.send === false) return { week, sent: false, note: "stored, not sent" };
  const id = await deliver(subjectFor(content), html);
  await db().from("briefs").update({ sent_at: new Date().toISOString() }).eq("week_start", week);
  return { week, sent: true, email_id: id, subject: subjectFor(content) };
}

/** Sends the latest stored brief as a test, without marking any week as sent. */
export async function sendTestEmail() {
  const { data } = await db().from("briefs").select("week_start, content_json").order("week_start", { ascending: false }).limit(1).single();
  if (!data) throw new Error("No brief stored yet");
  const content = data.content_json as BriefContent;
  const subject = `[Test] ${subjectFor(content)}`;
  return { week: data.week_start, subject, email_id: await deliver(subject, renderBriefHtml(content)) };
}
