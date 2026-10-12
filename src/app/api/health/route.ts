import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const REQUIRED = [
  "GEMINI_API_KEY", "GEMINI_MODEL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY", "BRIEF_RECIPIENT_EMAIL", "BRIEF_FROM_EMAIL", "CRON_SECRET",
  "ADMIN_PASSWORD", "APP_URL",
];

// Reports which env vars are present (never their values) and whether the database answers.
export async function GET() {
  const env = Object.fromEntries(REQUIRED.map((k) => [k, Boolean(process.env[k])]));
  let database = "ok";
  try {
    const { error } = await db().from("weights").select("key", { count: "exact", head: true });
    if (error) database = error.message;
  } catch (e) {
    database = (e as Error).message;
  }
  return NextResponse.json({ model: process.env.GEMINI_MODEL ?? null, env, database });
}
