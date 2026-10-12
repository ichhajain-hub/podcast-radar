// Dev helper: list channels from a YouTube search results page.
for (const q of process.argv.slice(2)) {
  const html = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAg%253D%253D`, { headers: { "accept-language": "en", "user-agent": "Mozilla/5.0" } }).then((r) => r.text());
  const out = [...html.matchAll(/"channelRenderer":\{"channelId":"(UC[\w-]{22})","title":\{"simpleText":"([^"]+)"[\s\S]{0,1500}?"canonicalBaseUrl":"(\/@[^"]+)"/g)].slice(0, 4).map((m) => `${m[2]} ${m[3]} ${m[1]}`);
  console.log(`${q}:\n  ${out.join("\n  ")}`);
}
