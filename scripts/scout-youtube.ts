// Research helper: for candidate YouTube interview channels, count recent long-form videos that feature
// guests already seen on our tracked shows (by name in title/description).
// Run: node --env-file=.env.local --import tsx scripts/scout-youtube.ts "query 1" "query 2" ...
import { db } from "../src/lib/supabase";
import { normName } from "../src/lib/text";

const UA = { "accept-language": "en", "user-agent": "Mozilla/5.0" };

async function firstChannel(q: string) {
  const html = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAg%253D%253D`, { headers: UA }).then((r) => r.text());
  const m = html.match(/"channelRenderer":\{"channelId":"(UC[\w-]{22})","title":\{"simpleText":"([^"]+)"/);
  return m ? { id: m[1], title: m[2] } : null;
}

async function main() {
  const { data: guests } = await db().from("entities").select("canonical_name, aliases").eq("type", "guest").is("merged_into", null);
  const names = [...new Set((guests ?? []).flatMap((g) => [g.canonical_name, ...(g.aliases ?? [])])
    .map((n) => normName(n.replace(/^dr\.?\s+/i, ""))).filter((n) => n.split(" ").length >= 2))];
  for (const q of process.argv.slice(2)) {
    const ch = await firstChannel(q);
    if (!ch) { console.log(`?? ${q}`); continue; }
    const xml = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${ch.id.slice(2)}`, { headers: UA }).then((r) => (r.ok ? r.text() : ""));
    const entries = xml.split("<entry>").slice(1).map((e) => ({
      title: e.match(/<title>([^<]*)<\/title>/)?.[1] ?? "",
      desc: e.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1] ?? "",
      pub: Date.parse(e.match(/<published>([^<]+)<\/published>/)?.[1] ?? ""),
    })).filter((e) => Date.now() - e.pub < 60 * 864e5);
    const text = normName(entries.map((e) => `${e.title} ${e.desc.slice(0, 600)}`).join(" "));
    const hits = names.filter((n) => text.includes(n));
    console.log(`${String(hits.length).padStart(2)} overlap | ${String(entries.length).padStart(2)} long videos/60d | ${ch.title} | https://www.youtube.com/channel/${ch.id}${hits.length ? `\n      ${hits.slice(0, 8).join(", ")}` : ""}`);
  }
}
main();
