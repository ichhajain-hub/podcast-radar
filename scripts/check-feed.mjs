// Usage: node scripts/check-feed.mjs <rss-url>... | --search "<term>" [country]
import Parser from "rss-parser";
const parser = new Parser({ timeout: 45000 });
const a = process.argv.slice(2);
if (a[0] === "--search") {
  const r = await fetch(`https://itunes.apple.com/search?media=podcast&entity=podcast&limit=8&country=${a[2] || "in"}&term=${encodeURIComponent(a[1])}`).then((r) => r.json());
  for (const x of r.results) console.log(`${x.collectionName} | ${x.artistName} | ${x.feedUrl}`);
} else for (const u of a) {
  try {
    const f = await parser.parseURL(u);
    const recent = f.items.filter((i) => Date.now() - new Date(i.isoDate) < 30 * 864e5).length;
    console.log(`OK ${u}\n   "${f.title}" ${f.items.length} eps, latest ${f.items[0]?.isoDate?.slice(0, 10)}, last30d: ${recent}`);
  } catch (e) { console.log(`FAIL ${u} ${e.message.slice(0, 80)}`); }
}
