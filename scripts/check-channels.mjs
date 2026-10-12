// Dev helper: resolve each India show's YouTube channel URL to a channel id + recent uploads.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await sb.from("shows").select("name, youtube_channel_url").eq("region", "india").eq("active", true);
for (const s of data) {
  if (!s.youtube_channel_url) { console.log(`- ${s.name}: no channel`); continue; }
  try {
    const html = await fetch(s.youtube_channel_url, { headers: { "accept-language": "en", "user-agent": "Mozilla/5.0" } }).then((r) => r.text());
    const id = html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ?? html.match(/channel\/(UC[\w-]{22})/)?.[1];
    const title = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
    const feed = id ? await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`).then((r) => r.text()) : "";
    const vids = [...feed.matchAll(/<title>([^<]+)<\/title>/g)].slice(1, 4).map((m) => m[1].slice(0, 50));
    console.log(`- ${s.name}: ${id} "${title}" | ${vids.join(" || ")}`);
  } catch (e) { console.log(`- ${s.name}: ERR ${e.message}`); }
}
