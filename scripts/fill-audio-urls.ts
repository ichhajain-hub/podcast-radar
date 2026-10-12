// One-off: fill episodes.audio_url (RSS <enclosure>) for stored episodes whose web page link
// is on a retired host. Run: node --env-file=.env.local --import tsx scripts/fill-audio-urls.ts
import { fetchFeed } from "../src/lib/rss";
import { db } from "../src/lib/supabase";

async function main() {
  const { data: eps } = await db().from("episodes").select("id, url, show_id").is("audio_url", null)
    .or("url.ilike.*podcasters.spotify.com*,url.ilike.*anchor.fm*");
  const byShow = new Map<string, { id: string; url: string }[]>();
  for (const e of eps ?? []) byShow.set(e.show_id, [...(byShow.get(e.show_id) ?? []), e]);
  for (const [showId, list] of byShow) {
    const { data: s } = await db().from("shows").select("name, rss_url").eq("id", showId).single();
    const feed = await fetchFeed(s!.rss_url, 120_000);
    const audio = new Map(feed.episodes.map((e) => [e.url, e.audio_url]));
    let n = 0;
    for (const e of list) {
      const a = audio.get(e.url);
      if (!a) continue;
      await db().from("episodes").update({ audio_url: a }).eq("id", e.id);
      n++;
    }
    console.log(`${s!.name}: ${n}/${list.length} filled`);
  }
}
main();
