import type { BriefContent } from "./brief";
import { addDays } from "./dates";
import type { Source } from "./score";

// Email HTML for the Monday brief: white background, one accent colour, inline styles only
// (email clients ignore stylesheets). Sections follow spec section 9.

const ACCENT = "#4f46e5";
const MUTED = "#64748b";
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const fmtTs = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};

function link(href: string, label: string) {
  return `<a href="${esc(href)}" style="color:${ACCENT};text-decoration:none">${esc(label)}</a>`;
}

function tag(label: string | undefined, bg = "#eef2ff", fg = ACCENT) {
  return label ? ` <span style="display:inline-block;padding:1px 8px;border-radius:999px;background:${bg};color:${fg};font-size:11px;font-weight:600">${esc(label)}</span>` : "";
}

function sources(list: Source[]) {
  const items = list
    .map((s) => `<li style="margin:2px 0">${link(s.url, s.episode_title)} <span style="color:${MUTED}">— ${esc(s.show_name)}, ${fmtDay(s.published_at)}${s.timestamp_seconds != null ? ` @ ${fmtTs(s.timestamp_seconds)}` : ""}</span></li>`)
    .join("");
  return `<div style="margin-top:6px;font-size:13px"><span style="color:${MUTED}">Sources (${list.length})</span><ul style="margin:4px 0 0;padding-left:18px">${items}</ul></div>`;
}

function section(title: string, body: string) {
  return `<tr><td style="padding:28px 0 0"><h2 style="margin:0 0 12px;font-size:18px;color:#0f172a">${esc(title)}</h2>${body}</td></tr>`;
}

function item(inner: string, score?: number) {
  const ring = score == null ? "" : `<td width="52" valign="top" align="right"><div style="width:40px;height:40px;border-radius:50%;border:3px solid ${ACCENT};text-align:center;line-height:40px;font-weight:700;font-size:14px;color:#0f172a">${Math.round(score)}</div></td>`;
  return `<div style="padding:14px 0;border-top:1px solid #e2e8f0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="top">${inner}</td>${ring}</tr></table></div>`;
}

const empty = (what: string) => `<p style="color:${MUTED};font-size:14px;margin:0">Nothing crossed the threshold this week${what}.</p>`;

export function renderBriefHtml(c: BriefContent, appUrl = process.env.APP_URL ?? ""): string {
  const end = new Date(Date.parse(c.to) - 1).toISOString();
  const tagColors = (t?: string) => (t === "New" ? ["#ecfdf5", "#047857"] : t === "Rising" ? ["#eef2ff", ACCENT] : ["#f1f5f9", MUTED]);

  const guests = c.guests.length
    ? c.guests.map((g) => {
        const li = g.linkedin_url
          ? link(g.linkedin_url, g.linkedin_verified ? "LinkedIn" : "Search on LinkedIn")
          : link(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([g.name, g.company].filter(Boolean).join(" "))}`, "Search on LinkedIn");
        return item(`<div style="font-size:15px"><b>${esc(g.name)}</b>${g.role || g.company ? ` · ${esc([g.role, g.company].filter(Boolean).join(", "))}` : ""}${tag(g.tag, ...tagColors(g.tag))}${tag(g.action ? g.action : "book")}</div>
<div style="color:#334155;font-size:14px;margin-top:4px">On ${g.shows.length} show${g.shows.length === 1 ? "" : "s"} (${esc(g.shows.join(", "))})${g.why_now ? ` · ${esc(g.why_now)}` : ""}</div>
<div style="font-size:13px;margin-top:6px">${li}${g.website_url ? ` &nbsp;·&nbsp; ${link(g.website_url, "Company website")}` : ""}</div>${sources(g.sources)}`, g.score);
      }).join("")
    : empty("");

  const rounds = c.media_rounds ?? c.guests.filter((g) => g.media_rounds ?? g.shows.length >= 2);
  const roundsBlock = `<h3 style="margin:22px 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED}">Doing media rounds · 2+ India shows in 30 days</h3>` + (rounds.length
    ? rounds.map((g) => `<div style="font-size:14px;margin:4px 0"><b>${esc(g.name)}</b>${g.company ? ` · ${esc(g.company)}` : ""} — ${esc(g.shows.join(" + "))} ${g.sources.map((s) => link(s.url, `[${fmtDay(s.published_at)}]`)).join(" ")}</div>`).join("")
    : `<p style="color:${MUTED};font-size:14px;margin:0">No guest appeared on two or more monitored India shows in the last 30 days.</p>`);

  const topics = c.topics.length
    ? c.topics.map((t) => item(`<div style="font-size:15px"><b>${esc(t.name)}</b>${tag(t.label === "counter" ? "counter" : "ride", t.label === "counter" ? "#fffbeb" : "#eef2ff", t.label === "counter" ? "#b45309" : ACCENT)}${tag(t.tag, ...tagColors(t.tag))}</div>
<div style="color:#334155;font-size:14px;margin-top:4px">${t.show_count} India shows${t.why_now ? ` · ${esc(t.why_now)}` : ""}</div>${sources(t.sources)}`, t.score)).join("")
    : empty("");

  const global = c.global.length
    ? c.global.map((g) => item(`<div style="font-size:15px"><b>${esc(g.name)}</b>${tag(g.tag, ...tagColors(g.tag))}</div>
<div style="color:#334155;font-size:14px;margin-top:4px">${g.global_count} global shows vs ${g.india_count} India shows${g.india_angle ? `<br>India angle: ${esc(g.india_angle)}` : ""}</div>${sources(g.sources)}`, g.score)).join("")
    : empty(" (needs 2+ global shows in 14 days)");

  const sponsors = c.sponsors.length
    ? c.sponsors.map((s) => item(`<div style="font-size:15px"><b>${esc(s.name)}</b>${tag(s.paid ? "Paid" : "Organic", s.paid ? "#ecfdf5" : "#f1f5f9", s.paid ? "#047857" : MUTED)}${tag(s.tag, ...tagColors(s.tag))}</div>
<div style="color:#334155;font-size:14px;margin-top:4px">${s.show_count} shows${s.why_now ? ` · ${esc(s.why_now)}` : ""}</div>${sources(s.sources)}`, s.score)).join("")
    : empty("");

  const failed = c.shows_failed?.length
    ? `<div style="margin-top:8px;font-size:13px;color:#b91c1c">Missing this week (feed failed): ${esc(c.shows_failed.join(", "))}</div>`
    : "";

  const tile = (n: number, label: string) =>
    `<td width="50%" style="padding:16px;border:1px solid #e2e8f0;border-radius:12px"><div style="font-size:30px;font-weight:700;color:${ACCENT}">${n}</div><div style="font-size:13px;color:#334155">${esc(label)}</div></td>`;

  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px">
<tr><td>
<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${ACCENT};font-weight:600">Podcast Ecosystem Radar</div>
<h1 style="margin:6px 0 4px;font-size:24px">Your Monday radar</h1>
<div style="font-size:14px;color:${MUTED}">${fmtDay(c.from)} – ${fmtDay(end)} · ${c.stats.shows_scanned} shows scanned · ${c.stats.episodes_scanned} episodes scanned</div>${failed}
</td></tr>
<tr><td style="padding-top:20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="8"><tr>${tile(rounds.length, "Guests on media rounds (2+ India shows, 30 days)")}${tile(c.stats.brands_spending, "Brands spending")}</tr></table></td></tr>
${section("Book this week", guests + roundsBlock)}
${section("Topics to ride or counter", topics + `<h3 style="margin:22px 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED}">Global signals · for inspiration</h3>${global}`)}
${section("Sponsors to pitch", sponsors)}
<tr><td style="padding:36px 0 0;border-top:1px solid #e2e8f0;margin-top:24px;font-size:13px;color:${MUTED}">
Built with Gemini Flash · Edit your shows in ${link(`${appUrl}/settings`, "Settings")} · ${link(`${appUrl}/?preset=custom&from=${c.week_start}&to=${addDays(c.week_start, 7)}`, "Open dashboard")}
</td></tr>
</table></td></tr></table></body></html>`;
}
