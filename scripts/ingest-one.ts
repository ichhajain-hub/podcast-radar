// Dev helper: ingest a single show by (partial) name. Usage: npx tsx scripts/ingest-one.ts "Neon"
import { db } from "../src/lib/supabase";
import { ingestShow } from "../src/lib/ingest";
import type { ShowRow } from "../src/lib/extract";

async function main() {
  const q = process.argv[2] ?? "";
  const { data } = await db().from("shows").select("*").ilike("name", `%${q}%`).limit(1);
  if (!data?.[0]) throw new Error("no show matches " + q);
  console.log(JSON.stringify(await ingestShow(data[0] as ShowRow), null, 2));
}
main();
