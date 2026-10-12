// Dev helper: prints a line whenever a run's progress changes; exits when it finishes.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const id = process.argv[2];
let last = "";
for (let i = 0; i < 200; i++) {
  const { data: r } = await sb.from("runs").select("status, total, shows_ok, shows_failed, log").eq("id", id).single();
  const line = `${r.status} ok=${r.shows_ok.length} failed=${r.shows_failed.length}/${r.total} [${r.shows_failed.join(", ")}] gemini_calls=${(r.log?.usage ?? []).length}`;
  if (line !== last) { console.log(line); last = line; }
  if (!["running", "finalizing"].includes(r.status)) {
    for (const s of r.log?.shows ?? []) console.log(`  ${s.show}: ${s.ok ? "ok" : "FAIL " + s.error} eps=${s.in_window} extracted=${s.extracted} pending=${s.pending_extraction} ${Math.round(s.ms / 1000)}s`);
    console.log("finalize:", JSON.stringify({ fit: r.log?.fit_rated, err: r.log?.finalize_error }));
    process.exit(0);
  }
  await new Promise((res) => setTimeout(res, 10000));
}
