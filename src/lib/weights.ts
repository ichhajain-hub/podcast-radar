import { db } from "./supabase";

// Section 6 defaults. Each group totals 100.
export const DEFAULT_WEIGHTS = {
  guest_spread: 40, guest_recency: 25, guest_ahead_of_curve: 20, guest_fit: 15,
  topic_spread: 40, topic_acceleration: 30, topic_gap: 30,
  sponsor_spend: 40, sponsor_breadth: 25, sponsor_recency: 20, sponsor_fit: 15,
  global_spread: 35, global_not_in_india: 35, global_india_translation: 30,
} as const;

export type WeightKey = keyof typeof DEFAULT_WEIGHTS;
export type Weights = Record<WeightKey, number>;

export const WEIGHT_GROUPS: { title: string; prefix: string; keys: WeightKey[] }[] = [
  { title: "Guests", prefix: "guest_", keys: ["guest_spread", "guest_recency", "guest_ahead_of_curve", "guest_fit"] },
  { title: "Topics", prefix: "topic_", keys: ["topic_spread", "topic_acceleration", "topic_gap"] },
  { title: "Sponsors", prefix: "sponsor_", keys: ["sponsor_spend", "sponsor_breadth", "sponsor_recency", "sponsor_fit"] },
  { title: "Global", prefix: "global_", keys: ["global_spread", "global_not_in_india", "global_india_translation"] },
];

export async function loadWeights(): Promise<Weights> {
  const { data, error } = await db().from("weights").select("key, value");
  if (error) throw new Error(error.message);
  const w: Weights = { ...DEFAULT_WEIGHTS };
  for (const row of data ?? []) if (row.key in w) w[row.key as WeightKey] = Number(row.value);
  return w;
}
