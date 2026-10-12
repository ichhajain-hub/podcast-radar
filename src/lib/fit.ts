import { z } from "zod";
import { generateJson } from "./gemini";
import type { ScoreResult } from "./score";
import { db } from "./supabase";

// Gemini 1-5 ratings used by the fit components of the score. Stored on entities so
// score() stays pure and each name is rated once.

const ratings = z.object({ ratings: z.array(z.object({ index: z.number().int(), rating: z.number().min(1).max(5) })) });

async function rate(
  task: string,
  question: string,
  items: { id: string; text: string }[],
  column: "fit" | "india_fit",
  runId: string | null,
) {
  if (!items.length) return 0;
  const out = await generateJson({
    task, runId, schema: ratings,
    prompt: `${question}
Rate each item from 1 (poor) to 5 (excellent). Base the rating only on the information given; if it is too thin to judge, answer 3.
Return { ratings: [{ index, rating }] } for every item.

${items.map((x, i) => `${i}. ${x.text}`).join("\n")}`,
  });
  let n = 0;
  for (const r of out.ratings) {
    const item = items[r.index];
    if (!item) continue;
    const { error } = await db().from("entities").update({ [column]: Math.round(r.rating) }).eq("id", item.id);
    if (!error) n++;
  }
  return n;
}

/** Rates every gated candidate that has no rating yet. */
export async function rateMissingFits(result: ScoreResult, runId: string | null) {
  const guests = result.guests.filter((g) => g.fit_pending).slice(0, 40).map((g) => ({
    id: g.entity_id,
    text: `${g.name}${g.role ? `, ${g.role}` : ""}${g.company ? ` at ${g.company}` : ""} — appeared on ${g.shows.join(", ")}. Evidence: ${g.sources.map((s) => s.evidence).filter(Boolean).slice(0, 2).join(" | ")}`,
  }));
  const brands = result.sponsors.filter((s) => s.fit_pending).slice(0, 40).map((s) => ({
    id: s.entity_id,
    text: `${s.name} (${s.paid ? "paid sponsor read" : "organic mention"}) on ${s.shows.join(", ")}. Evidence: ${s.sources.map((x) => x.evidence).filter(Boolean).slice(0, 2).join(" | ")}`,
  }));
  const globals = result.global.filter((g) => g.fit_pending).slice(0, 40).map((g) => ({
    id: g.entity_id,
    text: `Topic "${g.name}" covered by ${g.shows.join(", ")}. Evidence: ${g.sources.map((x) => x.evidence).filter(Boolean).slice(0, 2).join(" | ")}`,
  }));

  return {
    guests: await rate("fit_guests", "How good a podcast guest would each person be for an audience of independent Indian startup founders?", guests, "fit", runId),
    brands: await rate("fit_brands", "How good a sponsor fit is each brand for a podcast whose audience is startup founders?", brands, "fit", runId),
    global: await rate("fit_global", "How well does each global podcast topic translate to Indian startup founders (relevance to Indian market, regulation, consumers)?", globals, "india_fit", runId),
  };
}
