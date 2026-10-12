import { db } from "./supabase";

// Non-weight settings stored in the `settings` table (editable in /settings).

export const SETTING_DEFAULTS = {
  deep_read_max_minutes: 170,
  price_input_per_1m: 0.75,
  price_output_per_1m: 3.75,
  guest_min_shows: 2,
} as const;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await db().from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value ?? fallback) as T;
}

export async function setSetting(key: string, value: unknown) {
  const { error } = await db().from("settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** Where the Monday brief goes: the Settings value, else the BRIEF_RECIPIENT_EMAIL env var. */
export async function briefRecipients(): Promise<string> {
  const v = await getSetting<string | null>("brief_recipient_email", null);
  return (typeof v === "string" && v.trim()) || process.env.BRIEF_RECIPIENT_EMAIL || "";
}
