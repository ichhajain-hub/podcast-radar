// Research helper: builds a guest-overlap map across candidate Indian shows (podcast RSS or a
// YouTube channel's long-form uploads feed) to choose a show list where guests "do the rounds".
// Gemini extracts guest names from the last 60 days of titles/descriptions of each candidate.
// Run: node --env-file=.env.local --import tsx scripts/scout-list.ts
import Parser from "rss-parser";
import { z } from "zod";
import { generateJson } from "../src/lib/gemini";
import { normName } from "../src/lib/text";

type Cand = { name: string; rss?: string; yt?: string };
const UA = { "accept-language": "en", "user-agent": "Mozilla/5.0" };
const DAY = 864e5;

const CANDIDATES: Cand[] = [
  // current India shows (for comparison, read the same way)
  { name: "Figuring Out (Raj Shamani)", rss: "https://anchor.fm/s/f5347ab0/podcast/rss" },
  { name: "WTF is with Nikhil Kamath", yt: "Nikhil Kamath" },
  { name: "The Neon Show", rss: "https://rss.buzzsprout.com/1601695.rss" },
  { name: "Founder Thesis", rss: "https://feeds.zencastr.com/f/mbqvPYFP.rss" },
  { name: "Prime Venture Partners Podcast", rss: "https://feeds.captivate.fm/prime-venture-partners/" },
  { name: "Paisa Vaisa", rss: "https://www.omnycontent.com/d/playlist/e0dce4b3-2eb8-48cb-822c-af1d00e03e20/b3d9fccc-662e-4aa7-a14a-af4e0097d44b/e2ba1850-2b92-4a77-b08f-af4e0097d46c/podcast.rss" },
  { name: "The Prakhar Gupta Xperience", rss: "https://anchor.fm/s/f6473d5c/podcast/rss" },
  { name: "The Ranveer Show (Hindi)", rss: "https://anchor.fm/s/f5d53400/podcast/rss" },
  { name: "Indian Business Podcast (Think School)", rss: "https://anchor.fm/s/f4e896f4/podcast/rss" },
  { name: "Z47 Moments", rss: "https://audioboom.com/channels/4979298.rss" },
  // candidates
  { name: "Moneycontrol Podcast", rss: "https://audioboom.com/channels/4937727.rss" },
  { name: "The Ranveer Show (English)", yt: "BeerBiceps" },
  { name: "Shubhankar Mishra", yt: "Shubhankar Mishra podcast" },
  { name: "Dostcast", yt: "Dostcast" },
  { name: "Ishan Sharma", yt: "Ishan Sharma podcast" },
  { name: "Sushant Sinha", yt: "Sushant Sinha podcast" },
  { name: "Kushal Lodha", yt: "Kushal Lodha podcast" },
  { name: "Siddharth Kannan", yt: "Siddharth Kannan" },
  { name: "Finance With Sharan", yt: "Finance with Sharan" },
  { name: "YourStory", yt: "YourStory TV" },
  { name: "CNBC-TV18 Young Turks", yt: "Young Turks CNBC TV18" },
  { name: "Inc42", yt: "Inc42 Media" },
  { name: "Entrackr", yt: "Entrackr" },
  { name: "The Barbershop with Shantanu", yt: "The Barbershop with Shantanu" },
  { name: "Ideabaaz", yt: "Ideabaaz" },
  { name: "Mint", yt: "Mint podcast livemint" },
  { name: "NDTV Profit", yt: "NDTV Profit" },
  { name: "Business Today", yt: "Business Today TV" },
  { name: "Abhijit Chavda", yt: "Abhijit Chavda podcast" },
  { name: "TBSP (The Bombay Shaving Podcast)", yt: "TBSP podcast" },
  { name: "Jaimin Shah", yt: "Jaimin Shah podcast" },
  { name: "Varun Mayya", yt: "Varun Mayya" },
  { name: "Anupam Mittal", yt: "Anupam Mittal" },
  { name: "Gaurav Kapur Breakfast with Champions", yt: "Breakfast with Champions Gaurav Kapur" },
];

async function channelId(q: string) {
  const html = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAg%253D%253D`, { headers: UA }).then((r) => r.text()).catch(() => "");
  const m = html.match(/"channelRenderer":\{"channelId":"(UC[\w-]{22})","title":\{"simpleText":"([^"]+)"/);
  return m ? { id: m[1], title: m[2] } : null;
}

type Ep = { title: string; desc: string; date: number };

async function episodes(c: Cand): Promise<{ eps: Ep[]; source: string }> {
  const since = Date.now() - 60 * DAY;
  if (c.rss) {
    const f = await new Parser({ timeout: 60000 }).parseURL(c.rss);
    return {
      eps: f.items.map((i) => ({ title: i.title ?? "", desc: (i.contentSnippet ?? "").slice(0, 500), date: Date.parse(i.isoDate ?? "") })).filter((e) => e.date >= since),
      source: c.rss,
    };
  }
  const ch = await channelId(c.yt!);
  if (!ch) return { eps: [], source: "not found" };
  const xml = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${ch.id.slice(2)}`, { headers: UA }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  const eps = xml.split("<entry>").slice(1).map((e) => ({
    title: (e.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
    desc: (e.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1] ?? "").slice(0, 500),
    date: Date.parse(e.match(/<published>([^<]+)<\/published>/)?.[1] ?? ""),
  })).filter((e) => e.date >= since);
  return { eps, source: `${ch.title} https://www.youtube.com/channel/${ch.id}` };
}

const schema = z.object({ episodes: z.array(z.object({ index: z.number().int(), guests: z.array(z.string()) })) });

async function main() {
  const results: { c: Cand; source: string; eps: number; guests: { name: string; date: number }[] }[] = [];
  await Promise.all(CANDIDATES.map(async (c) => {
    try {
      const { eps, source } = await episodes(c);
      if (!eps.length) { results.push({ c, source, eps: 0, guests: [] }); return; }
      const out = await generateJson({
        task: "scout_guests", schema,
        prompt: `List the people interviewed (guests, never the host) in each episode of "${c.name}". Use full names as written. Only names explicitly present; omit if unsure.\n\n${eps.map((e, i) => `${i}. ${e.title}\n${e.desc.replace(/\s+/g, " ")}`).join("\n\n")}`,
      });
      const guests = out.episodes.flatMap((o) => (eps[o.index] ? o.guests.map((g) => ({ name: g, date: eps[o.index].date })) : []));
      results.push({ c, source, eps: eps.length, guests });
    } catch (e) {
      results.push({ c, source: `error ${(e as Error).message.slice(0, 60)}`, eps: 0, guests: [] });
    }
  }));

  const key = (n: string) => normName(n.replace(/^(dr|mr|ms|mrs)\.?\s+/i, "")).split(" ").filter((w) => w.length > 1).join(" ");
  const byGuest = new Map<string, { show: string; date: number; raw: string }[]>();
  for (const r of results) for (const g of r.guests) {
    const k = key(g.name);
    if (k.split(" ").length < 2) continue;
    byGuest.set(k, [...(byGuest.get(k) ?? []), { show: r.c.name, date: g.date, raw: g.name }]);
  }
  const multi = [...byGuest].map(([k, a]) => ({ k, shows: [...new Set(a.map((x) => x.show))], a })).filter((x) => x.shows.length > 1);
  const within30 = multi.filter((x) => {
    return x.a.some((p) => x.a.some((q) => p.show !== q.show && Math.abs(p.date - q.date) <= 30 * DAY));
  });

  console.log("\nSHOWS (eps in 60d, guests found, guests shared with any other show):");
  for (const r of results.sort((a, b) => a.c.name.localeCompare(b.c.name))) {
    const shared = multi.filter((m) => m.shows.includes(r.c.name)).length;
    console.log(`  ${String(shared).padStart(2)} shared | ${String(r.eps).padStart(2)} eps | ${String(r.guests.length).padStart(2)} guests | ${r.c.name} — ${r.source.slice(0, 90)}`);
  }
  console.log(`\nGUESTS ON 2+ SHOWS (60 days): ${multi.length}, of which within 30 days of each other: ${within30.length}`);
  for (const m of multi.sort((a, b) => b.shows.length - a.shows.length)) {
    console.log(`  ${within30.includes(m) ? "★" : " "} ${m.a[0].raw}: ${m.a.map((x) => `${x.show} ${new Date(x.date).toISOString().slice(5, 10)}`).join(" | ")}`);
  }
}
main();
