import { z } from "zod";
import { generateJson } from "./gemini";
import { db, selectAll } from "./supabase";
import { normName } from "./text";

export type EntityType = "guest" | "topic" | "brand";

type EntityRow = {
  id: string;
  type: EntityType;
  canonical_name: string;
  aliases: string[] | null;
  company: string | null;
  role: string | null;
};
export type NameInput = { name: string; company?: string | null; role?: string | null };

const COLS = "id, type, canonical_name, aliases, company, role";
const NOUN: Record<EntityType, string> = { guest: "person", topic: "topic", brand: "brand or company" };

const matchSchema = z.object({ matches: z.array(z.object({ index: z.number().int(), match: z.string() })) });

/**
 * Asks Gemini whether each new name is the same as an existing canonical name (section 5.5).
 * Returns, per new name, the matched existing canonical name, an earlier new name, or null (NEW).
 */
export async function matchNames(
  type: EntityType,
  fresh: NameInput[],
  existing: { canonical_name: string; company?: string | null }[],
  runId: string | null,
): Promise<(string | null)[]> {
  if (!fresh.length) return [];
  const label = (x: { company?: string | null }) => (type === "guest" && x.company ? ` (${x.company})` : "");
  const out = await generateJson({
    task: "resolve", runId, schema: matchSchema, note: `${type}: ${fresh.length} new vs ${existing.length}`,
    prompt: `You merge duplicate ${NOUN[type]} names in a podcast database.

Existing canonical ${type} names:
${existing.length ? existing.map((e) => `- ${e.canonical_name}${label(e)}`).join("\n") : "(none yet)"}

New names:
${fresh.map((f, i) => `${i}. ${f.name}${label(f)}`).join("\n")}

For each new name: is it the same ${NOUN[type]} as one of the existing names, or as an EARLIER new name in the list?
${type === "topic"
    ? "Topics are the same if a reader would treat them as one theme (e.g. \"AI agents for SMBs\" = \"AI agents for small business\"). Do not merge merely related topics."
    : type === "guest"
      ? "People are the same only if it is clearly the same individual (spelling variants, initials, nicknames). Different people who share a company are NOT the same."
      : "Brands are the same if they are the same company or product (e.g. \"Zerodha Kite\" = \"Zerodha\")."}
Return { matches: [{ index, match }] } for every new name, where match is the existing or earlier new name copied exactly, or "NEW".`,
  });

  const existingByNorm = new Map(existing.map((e) => [normName(e.canonical_name), e.canonical_name]));
  const result: (string | null)[] = fresh.map(() => null);
  for (const m of out.matches) {
    if (m.index < 0 || m.index >= fresh.length || /^new$/i.test(m.match.trim())) continue;
    const n = normName(m.match);
    if (existingByNorm.has(n)) result[m.index] = existingByNorm.get(n)!;
    else {
      const earlier = fresh.slice(0, m.index).find((f) => normName(f.name) === n);
      if (earlier) result[m.index] = earlier.name;
    }
  }
  return result;
}

/**
 * Maps extracted names to canonical rows in `entities`: exact match on name/aliases first,
 * then Gemini resolution for the rest, creating new entities only for genuinely new names.
 */
export class EntityResolver {
  private cache = new Map<EntityType, EntityRow[]>();

  constructor(readonly runId: string | null = null) {}

  private async rows(type: EntityType): Promise<EntityRow[]> {
    let rows = this.cache.get(type);
    if (!rows) {
      rows = await selectAll<EntityRow>((a, b) =>
        db().from("entities").select(COLS).eq("type", type).is("merged_into", null).order("id").range(a, b),
      );
      this.cache.set(type, rows);
    }
    return rows;
  }

  /** Existing canonical labels (most-merged first), so extraction can reuse them. */
  async knownLabels(type: EntityType, limit = 400): Promise<string[]> {
    const rows = await this.rows(type);
    return [...rows].sort((a, b) => (b.aliases?.length ?? 0) - (a.aliases?.length ?? 0)).slice(0, limit).map((r) => r.canonical_name);
  }

  private findExact(rows: EntityRow[], name: string): EntityRow | undefined {
    const n = normName(name);
    return rows.find((r) => normName(r.canonical_name) === n || (r.aliases ?? []).some((a) => normName(a) === n));
  }

  private clean(type: EntityType, name: string) {
    return (type === "topic" ? name.toLowerCase() : name).replace(/\s+/g, " ").trim();
  }

  /** Resolves a list of names of one type; returns entity ids in the same order (null for blanks). */
  async resolveMany(type: EntityType, inputs: NameInput[]): Promise<(string | null)[]> {
    const rows = await this.rows(type);
    const ids: (string | null)[] = inputs.map(() => null);
    const pending: { i: number; input: NameInput }[] = [];

    inputs.forEach((raw, i) => {
      const input = { ...raw, name: this.clean(type, raw.name) };
      if (!normName(input.name)) return;
      const hit = this.findExact(rows, input.name);
      if (hit) ids[i] = hit.id;
      else pending.push({ i, input });
    });

    // De-duplicate exact repeats, then ask Gemini about the remaining unknown names.
    const unique = [...new Map(pending.map((p) => [normName(p.input.name), p.input])).values()];
    let matches: (string | null)[] = unique.map(() => null);
    if (unique.length && rows.length) {
      try {
        matches = await matchNames(type, unique, rows, this.runId);
      } catch (e) {
        console.error("entity resolution failed; treating names as new", (e as Error).message);
      }
    }

    const idByNorm = new Map<string, string>();
    for (let k = 0; k < unique.length; k++) {
      const input = unique[k];
      const target = matches[k];
      let id: string;
      const existingRow = target ? this.findExact(rows, target) : undefined;
      if (existingRow) {
        id = existingRow.id;
        await this.addAlias(existingRow, input.name);
      } else if (target && idByNorm.has(normName(target))) {
        id = idByNorm.get(normName(target))!;
        const row = rows.find((r) => r.id === id);
        if (row) await this.addAlias(row, input.name);
      } else {
        id = await this.create(type, input);
      }
      idByNorm.set(normName(input.name), id);
    }

    for (const p of pending) ids[p.i] = idByNorm.get(normName(p.input.name)) ?? null;
    await this.fillDetails(type, inputs, ids);
    return ids;
  }

  async resolve(type: EntityType, name: string, extra: { company?: string | null; role?: string | null } = {}) {
    return (await this.resolveMany(type, [{ name, ...extra }]))[0];
  }

  private async addAlias(row: EntityRow, alias: string) {
    if (normName(row.canonical_name) === normName(alias) || (row.aliases ?? []).some((a) => normName(a) === normName(alias))) return;
    row.aliases = [...(row.aliases ?? []), alias];
    await db().from("entities").update({ aliases: row.aliases }).eq("id", row.id);
  }

  /** Fills in company / role on guests when a later mention states them. */
  private async fillDetails(type: EntityType, inputs: NameInput[], ids: (string | null)[]) {
    if (type !== "guest") return;
    const rows = await this.rows(type);
    for (let i = 0; i < inputs.length; i++) {
      const row = rows.find((r) => r.id === ids[i]);
      const { company, role } = inputs[i];
      if (!row || !((company && !row.company) || (role && !row.role))) continue;
      const patch = { company: row.company ?? company ?? null, role: row.role ?? role ?? null };
      await db().from("entities").update(patch).eq("id", row.id);
      Object.assign(row, patch);
    }
  }

  private async create(type: EntityType, input: NameInput): Promise<string> {
    const name = input.name;
    const { data, error } = await db()
      .from("entities")
      .upsert(
        { type, canonical_name: name, company: input.company || null, role: input.role || null },
        { onConflict: "type,canonical_name", ignoreDuplicates: true },
      )
      .select(COLS);
    let row = data?.[0] as EntityRow | undefined;
    if (!row) {
      // Another show created it at the same moment; read it back.
      const again = await db().from("entities").select(COLS).eq("type", type).eq("canonical_name", name).single();
      if (again.error) throw new Error(error?.message ?? again.error.message);
      row = again.data as EntityRow;
    }
    (await this.rows(type)).push(row);
    return row.id;
  }
}

/**
 * Catches duplicates created in parallel (3 shows ingest at once): every root entity created
 * since `since` is checked against older roots; matches are linked via merged_into (never deleted).
 */
export async function consolidateSince(since: string, runId: string | null) {
  const merged: Record<EntityType, number> = { guest: 0, topic: 0, brand: 0 };
  for (const type of ["guest", "topic", "brand"] as EntityType[]) {
    const roots = await selectAll<EntityRow & { created_at: string }>((a, b) =>
      db().from("entities").select(`${COLS}, created_at`).eq("type", type).is("merged_into", null).order("created_at").range(a, b),
    );
    const fresh = roots.filter((r) => r.created_at >= since);
    const older = roots.filter((r) => r.created_at < since);
    if (!fresh.length || !older.length) continue;
    for (let i = 0; i < fresh.length; i += 150) {
      const chunk = fresh.slice(i, i + 150);
      const matches = await matchNames(type, chunk.map((f) => ({ name: f.canonical_name, company: f.company })), older, runId);
      for (let k = 0; k < chunk.length; k++) {
        const target = matches[k] && older.find((o) => normName(o.canonical_name) === normName(matches[k]!));
        if (!target) continue;
        await db().from("entities").update({ merged_into: target.id }).eq("id", chunk[k].id);
        const aliases = [...new Set([...(target.aliases ?? []), chunk[k].canonical_name, ...(chunk[k].aliases ?? [])])];
        await db().from("entities").update({ aliases }).eq("id", target.id);
        target.aliases = aliases;
        merged[type]++;
      }
    }
  }
  return merged;
}

const clusterSchema = z.object({ groups: z.array(z.object({ members: z.array(z.string()) })) });

/**
 * Topic theme pass: groups root topic labels that a newsletter editor would file under one
 * heading, and links each group to its most-used label via merged_into (nothing is deleted).
 */
export async function clusterTopics(runId: string | null): Promise<number> {
  const roots = await selectAll<EntityRow>((a, b) =>
    db().from("entities").select(COLS).eq("type", "topic").is("merged_into", null).order("id").range(a, b),
  );
  if (roots.length < 2) return 0;
  const counts = new Map<string, number>();
  const ments = await selectAll<{ entity_id: string }>((a, b) => db().from("mentions").select("entity_id").eq("kind", "topic").order("id").range(a, b));
  for (const m of ments) counts.set(m.entity_id, (counts.get(m.entity_id) ?? 0) + 1);
  const byNorm = new Map(roots.map((r) => [normName(r.canonical_name), r]));

  let merged = 0;
  for (let i = 0; i < roots.length; i += 600) {
    const chunk = roots.slice(i, i + 600);
    const out = await generateJson({
      task: "cluster_topics", runId, schema: clusterSchema, note: `${chunk.length} topic labels`,
      prompt: `These are topic labels extracted from Indian and global business podcasts.
Group labels that describe the same theme — the ones a newsletter editor would file under one heading.
Examples of one theme: "ai agents for smbs" / "ai agents for small business" / "smb ai automation"; "quick commerce unit economics" / "q-commerce profitability" / "10-minute delivery economics".
Do NOT group merely adjacent themes ("ai in healthcare" vs "ai in education", "ipo market" vs "venture capital").
Copy labels exactly. Only return groups with 2 or more members; leave unique labels out.

${chunk.map((r) => `- ${r.canonical_name}`).join("\n")}`,
    });
    for (const g of out.groups) {
      const members = [...new Set(g.members.map((m) => byNorm.get(normName(m))).filter((r): r is EntityRow => !!r))];
      if (members.length < 2) continue;
      members.sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.canonical_name.length - b.canonical_name.length);
      const [target, ...rest] = members;
      const aliases = [...new Set([...(target.aliases ?? []), ...rest.flatMap((r) => [r.canonical_name, ...(r.aliases ?? [])])])];
      await db().from("entities").update({ aliases }).eq("id", target.id);
      target.aliases = aliases;
      for (const r of rest) {
        await db().from("entities").update({ merged_into: target.id }).eq("id", r.id);
        byNorm.delete(normName(r.canonical_name));
        merged++;
      }
    }
  }
  return merged;
}
