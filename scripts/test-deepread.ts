// Dev helper: match YouTube videos for India shows (last N days), optionally deep-read one episode.
// Usage: npx tsx scripts/test-deepread.ts [days] [--read]
import { db } from "../src/lib/supabase";
import { matchShowVideos } from "../src/lib/youtube";
import { deepRead, deepReadQueue } from "../src/lib/deepread";

async function main() {
  const days = Number(process.argv[2] ?? 30);
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data: shows } = await db().from("shows").select("id, name, hosts, youtube_channel_url").eq("region", "india").eq("active", true);
  for (const s of shows ?? []) {
    const { count } = await db().from("episodes").select("id", { count: "exact", head: true }).eq("show_id", s.id).gte("published_at", since);
    console.log(`${s.name}: matched ${await matchShowVideos(s, since)} new · ${count} eps in window`);
  }
  const queue = await deepReadQueue(since);
  console.log(`deep-read queue: ${queue.length}`);
  if (process.argv.includes("--read") && queue[0]) {
    const t = Date.now();
    const { data: ep } = await db().from("episodes").select("title, youtube_url").eq("id", queue[0]).single();
    console.log("reading:", ep?.title, ep?.youtube_url);
    console.log(await deepRead(queue[0], null), `${Math.round((Date.now() - t) / 1000)}s`);
  }
}
main();
