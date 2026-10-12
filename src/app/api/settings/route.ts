import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin, unauthorized } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { db } from "@/lib/supabase";
import { DEFAULT_WEIGHTS, WEIGHT_GROUPS } from "@/lib/weights";

const body = z.object({
  weights: z.record(z.string(), z.number().min(0).max(100)).optional(),
  reset_weights: z.boolean().optional(),
  deep_read_max_minutes: z.number().int().min(0).max(600).optional(),
  price_input_per_1m: z.number().min(0).max(100).optional(),
  price_output_per_1m: z.number().min(0).max(100).optional(),
});

// Saves weights (each group must total 100) and deep-read / pricing settings. Admin only.
export async function PUT(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const b = parsed.data;

  const weights = b.reset_weights ? { ...DEFAULT_WEIGHTS } : b.weights;
  if (weights) {
    for (const g of WEIGHT_GROUPS) {
      const total = g.keys.reduce((a, k) => a + Number(weights[k] ?? 0), 0);
      if (Math.abs(total - 100) > 0.01) return NextResponse.json({ error: `${g.title} weights add up to ${total}, not 100.` }, { status: 400 });
    }
    const rows = Object.entries(weights).filter(([k]) => k in DEFAULT_WEIGHTS).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
    const { error } = await db().from("weights").upsert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  for (const k of ["deep_read_max_minutes", "price_input_per_1m", "price_output_per_1m"] as const) {
    if (b[k] !== undefined) await setSetting(k, b[k]);
  }
  return NextResponse.json({ ok: true, weights: weights ?? null });
}
