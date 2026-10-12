// Looks up each seed show on the public iTunes Search API, then verifies its RSS feed loads.
import Parser from "rss-parser";
const parser = new Parser({ timeout: 20000 });
const shows = [
  ["india", "Figuring Out with Raj Shamani"], ["india", "The Barbershop with Shantanu"],
  ["india", "WTF is with Nikhil Kamath"], ["india", "The Neon Show"], ["india", "Founder Thesis"],
  ["india", "100x Entrepreneur"], ["india", "The Desi VC"], ["india", "Prime Venture Partners Podcast"],
  ["india", "Paisa Vaisa"], ["india", "The Ranveer Show"],
  ["global", "Acquired"], ["global", "My First Million"], ["global", "20VC"],
  ["global", "Lenny's Podcast"], ["global", "How I Built This"],
];
for (const [region, term] of shows) {
  const r = await fetch(`https://itunes.apple.com/search?media=podcast&entity=podcast&limit=5&country=${region === "india" ? "in" : "us"}&term=${encodeURIComponent(term)}`).then((r) => r.json());
  const hits = r.results.map((x) => `${x.collectionName} | ${x.artistName} | ${x.feedUrl}`);
  const best = r.results[0];
  let check = "no feed";
  if (best?.feedUrl) {
    try {
      const f = await parser.parseURL(best.feedUrl);
      const latest = f.items[0];
      const yt = f.items.slice(0, 10).filter((i) => /youtu\.?be/.test((i.content || "") + (i.link || "") + (i["content:encoded"] || ""))).length;
      check = `OK ${f.items.length} eps, latest ${latest?.isoDate?.slice(0, 10)} "${latest?.title?.slice(0, 50)}", yt-links in last10: ${yt}`;
    } catch (e) { check = "FAIL " + e.message.slice(0, 80); }
  }
  console.log(`\n[${region}] ${term}\n  -> ${check}\n  ${hits.join("\n  ")}`);
}
