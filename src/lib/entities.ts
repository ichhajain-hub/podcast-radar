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

/**
 * Maps extracted names to rows in `entities`, creating new ones when there is no match.
 * Matching is by normalised name against canonical names and aliases.
 */
export class EntityResolver {
  private cache = new Map<EntityType, EntityRow[]>();

  constructor(readonly runId: string | null = null) {}

  private async rows(type: EntityType): Promise<EntityRow[]> {
    let rows = this.cache.get(type);
    if (!rows) {
      rows = await selectAll<EntityRow>((a, b) =>
        db().from("entities").select("id, type, canonical_name, aliases, company, role").eq("type", type).range(a, b),
      );
      this.cache.set(type, rows);
    }
    return rows;
  }

  private findExact(rows: EntityRow[], name: string): EntityRow | undefined {
    const n = normName(name);
    return rows.find((r) => normName(r.canonical_name) === n || (r.aliases ?? []).some((a) => normName(a) === n));
  }

  async resolve(type: EntityType, rawName: string, extra: { company?: string | null; role?: string | null } = {}): Promise<string | null> {
    const name = (type === "topic" ? rawName.toLowerCase() : rawName).replace(/\s+/g, " ").trim();
    if (!normName(name)) return null;
    const rows = await this.rows(type);

    const hit = this.findExact(rows, name);
    if (hit) {
      if ((extra.company && !hit.company) || (extra.role && !hit.role)) {
        const patch = { company: hit.company ?? extra.company ?? null, role: hit.role ?? extra.role ?? null };
        await db().from("entities").update(patch).eq("id", hit.id);
        Object.assign(hit, patch);
      }
      return hit.id;
    }
    return this.create(type, name, extra);
  }

  protected async create(type: EntityType, name: string, extra: { company?: string | null; role?: string | null }): Promise<string> {
    const { data, error } = await db()
      .from("entities")
      .upsert(
        { type, canonical_name: name, company: extra.company || null, role: extra.role || null },
        { onConflict: "type,canonical_name", ignoreDuplicates: true },
      )
      .select("id, type, canonical_name, aliases, company, role");
    let row = data?.[0] as EntityRow | undefined;
    if (!row) {
      // Another show created it at the same moment; read it back.
      const again = await db().from("entities").select("id, type, canonical_name, aliases, company, role")
        .eq("type", type).eq("canonical_name", name).single();
      if (again.error) throw new Error(error?.message ?? again.error.message);
      row = again.data as EntityRow;
    }
    (await this.rows(type)).push(row);
    return row.id;
  }
}
