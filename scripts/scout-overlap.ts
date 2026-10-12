// Research helper: finds active Indian podcasts whose recent episodes feature guests we already track,
// so a show-list change makes "2+ India shows in 30 days" guests possible.
// Run: node --env-file=.env.local --import tsx scripts/scout-overlap.ts
import Parser from "rss-parser";
import { db } from "../src/lib/supabase";
import { normName } from "../src/lib/text";

const TERMS = [
  "startup podcast india", "indian business podcast", "founder stories india", "hindi podcast business", "entrepreneur podcast india",
  "venture capital india podcast", "people by wtf", "dostcast", "ankur warikoo", "ishan sharma podcast", "varun mayya podcast",
  "anupam mittal podcast", "shark tank india podcast", "kunal shah podcast", "the mindset show", "bharat talks", "invest aaj for kal",
  "zerodha podcast", "sharan hegde podcast", "nikhil kamath", "raj shamani", "abhijit chavda podcast", "the ken podcast", "ideabaaz",
  "unfiltered samdish", "think school", "beerbiceps", "prakhar gupta", "the seen and the unseen", "tbsp podcast", "jaimin shah",
];

async function main() {
  const since60 = Date.now() - 60 * 864e5;
  const { data: guests } = await db().from("entities").select("canonical_name, aliases").eq("type", "guest").is("merged_into", null);
  const names = (guests ?? []).flatMap((g) => [g.canonical_name, ...(g.aliases ?? [])])
    .map((n) => normName(n.replace(/^dr\.?\s+/i, ""))).filter((n) => n.split(" ").length >= 2);
  const { data: current } = await db().from("shows").select("rss_url");
  const have = new Set((current ?? []).map((s) => s.rss_url));

  const feeds = new Map<string, string>();
  for (const t of TERMS) {
    const r = await fetch(`https://itunes.apple.com/search?media=podcast&entity=podcast&limit=6&country=in&term=${encodeURIComponent(t)}`).then((x) => x.json()).catch(() => ({ results: [] }));
    for (const x of r.results) if (x.feedUrl && !have.has(x.feedUrl)) feeds.set(x.feedUrl, `${x.collectionName} | ${x.artistName}`);
  }
  const parser = new Parser({ timeout: 30000 });
  const rows: string[] = [];
  await Promise.all([...feeds].map(async ([url, label]) => {
    try {
      const f = await parser.parseURL(url);
      const recent = f.items.filter((i) => Date.parse(i.isoDate ?? "") >= since60);
      if (recent.length < 3) return;
      const text = normName(recent.map((i) => `${i.title} ${i.contentSnippet ?? ""}`).join(" "));
      const hits = [...new Set(names.filter((n) => text.includes(n)))];
      rows.push(`${String(hits.length).padStart(2)} overlap | ${String(recent.length).padStart(2)} eps/60d | ${label} | ${url}${hits.length ? `\n      ${hits.slice(0, 8).join(", ")}` : ""}`);
    } catch { /* skip */ }
  }));
  rows.sort((a, b) => Number(b.slice(0, 2)) - Number(a.slice(0, 2)) || Number(b.split("|")[1].trim().split(" ")[0]) - Number(a.split("|")[1].trim().split(" ")[0]));
  console.log(rows.slice(0, 30).join("\n"));
}
main();
