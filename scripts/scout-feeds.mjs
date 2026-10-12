// Dev helper: search iTunes for podcasts and report how active each feed is (last 30/60 days).
import Parser from "rss-parser";
const parser = new Parser({ timeout: 40000 });
const terms = process.argv.slice(2);
const seen = new Set();
for (const term of terms) {
  const r = await fetch(`https://itunes.apple.com/search?media=podcast&entity=podcast&limit=4&country=in&term=${encodeURIComponent(term)}`).then((r) => r.json());
  for (const x of r.results) {
    if (!x.feedUrl || seen.has(x.feedUrl)) continue;
    seen.add(x.feedUrl);
    try {
      const f = await parser.parseURL(x.feedUrl);
      const d = (n) => f.items.filter((i) => Date.now() - Date.parse(i.isoDate) < n * 864e5).length;
      console.log(`${d(30)}/30d ${d(60)}/60d | ${x.collectionName} | ${x.artistName} | ${x.feedUrl}`);
    } catch (e) { console.log(`ERR | ${x.collectionName} | ${x.feedUrl}`); }
  }
}
