// One-off audit: for every merged topic group, Gemini keeps only children that are true rewordings of the
// group's label; the rest are un-merged (merged_into cleared, removed from the root's aliases). Nothing is deleted.
// Run: node --env-file=.env.local --import tsx scripts/audit-topic-merges.ts
import { z } from "zod";
import { generateJson } from "../src/lib/gemini";
import { db, selectAll } from "../src/lib/supabase";
import { normName } from "../src/lib/text";

type E = { id: string; canonical_name: string; aliases: string[] | null; merged_into: string | null };
const schema = z.object({ groups: z.array(z.object({ root: z.string(), same: z.array(z.string()) })) });

async function main() {
  const all = await selectAll<E>((a, b) => db().from("entities").select("id, canonical_name, aliases, merged_into").eq("type", "topic").order("id").range(a, b));
  const byId = new Map(all.map((e) => [e.id, e]));
  const groups = new Map<string, E[]>();
  for (const e of all) if (e.merged_into) groups.set(e.merged_into, [...(groups.get(e.merged_into) ?? []), e]);
  const entries = [...groups].map(([rootId, kids]) => ({ root: byId.get(rootId)!, kids }));
  console.log(`${entries.length} merged groups, ${all.filter((e) => e.merged_into).length} merged labels`);

  let unmerged = 0, kept = 0;
  for (let i = 0; i < entries.length; i += 40) {
    const chunk = entries.slice(i, i + 40);
    const out = await generateJson({
      task: "audit_topic_merges", schema, note: `${chunk.length} groups`,
      prompt: `Each group below has a topic label and labels that were merged into it.
For each group, return the merged labels that are truly the SAME specific topic as the group label (a rewording or near-synonym).
Leave out labels that are only related, broader, narrower, or share a keyword (e.g. "stock trading" vs "nike stock performance" are different topics).
Copy labels exactly.

${chunk.map((g) => `GROUP "${g.root.canonical_name}": ${g.kids.map((k) => `"${k.canonical_name}"`).join(", ")}`).join("\n")}`,
    });
    const keepBy = new Map(out.groups.map((g) => [normName(g.root), new Set(g.same.map(normName))]));
    for (const g of chunk) {
      const keep = keepBy.get(normName(g.root.canonical_name)) ?? new Set<string>();
      const drop = g.kids.filter((k) => !keep.has(normName(k.canonical_name)));
      kept += g.kids.length - drop.length;
      if (!drop.length) continue;
      for (const k of drop) {
        await db().from("entities").update({ merged_into: null }).eq("id", k.id);
        unmerged++;
      }
      const dropNames = new Set(drop.flatMap((k) => [k.canonical_name, ...(k.aliases ?? [])]).map(normName));
      const aliases = (g.root.aliases ?? []).filter((a) => !dropNames.has(normName(a)));
      await db().from("entities").update({ aliases }).eq("id", g.root.id);
      console.log(`  "${g.root.canonical_name}": un-merged ${drop.map((k) => k.canonical_name).join(", ")}`);
    }
  }
  console.log(`Done: kept ${kept} true rewordings, un-merged ${unmerged}.`);
}
main();
