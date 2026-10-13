import type { GlobalItem, GuestItem, ScoreResult, Source, SponsorItem, TopicItem } from "@/lib/score";
import { TOP_N } from "@/lib/score";
import { formatDate, formatTimestamp } from "@/lib/format";
import type { WeekCount } from "@/lib/history";
import { DEFAULT_WEIGHTS } from "@/lib/weights";

// Renders a radar (live score or stored brief): KPI cards, weekly chart, spotlight, then the four
// sections of the email. Every item expands to its score breakdown and source episodes.

type Extra = { why_now?: string; india_angle?: string; action?: string; tag?: "New" | "Rising" | "Repeat" };
export type RadarContent = Omit<ScoreResult, "guests" | "topics" | "sponsors" | "global" | "media_rounds"> & {
  media_rounds?: GuestItem[];
  guests: (GuestItem & Extra)[];
  topics: (TopicItem & Extra)[];
  sponsors: (SponsorItem & Extra)[];
  global: (GlobalItem & Extra)[];
  shows_failed?: string[];
  weights?: Record<string, number>;
};

const LABELS: Record<string, string> = {
  guest_spread: "Spread across shows", guest_recency: "Recent appearances", guest_ahead_of_curve: "Ahead of the curve", guest_fit: "Fit for founders (Gemini)",
  topic_spread: "Shows covering it", topic_acceleration: "Acceleration vs 4-week avg", topic_gap: "Gap on your show",
  sponsor_spend: "Paid vs organic", sponsor_breadth: "Breadth across shows", sponsor_recency: "Newly seen", sponsor_fit: "Founder fit (Gemini)",
  global_spread: "Global shows covering it", global_not_in_india: "Not yet in India", global_india_translation: "India translation (Gemini)",
};

type Prev = Pick<RadarContent, "stats" | "topics"> & { media_rounds?: GuestItem[]; guests: GuestItem[] };

export function RadarView({ content, earlyNote, weekly, prev }: { content: RadarContent; earlyNote?: string; weekly?: WeekCount[]; prev?: Prev | null }) {
  const guests = content.guests.slice(0, TOP_N.guests);
  const topics = content.topics.slice(0, TOP_N.topics);
  const sponsors = content.sponsors.slice(0, TOP_N.sponsors);
  const global = content.global.slice(0, TOP_N.global);
  const weights = { ...DEFAULT_WEIGHTS, ...(content.weights ?? {}) } as Record<string, number>;
  const rounds = content.media_rounds ?? content.guests.filter((g) => g.media_rounds ?? g.shows.length >= 2);
  const prevRounds = prev ? (prev.media_rounds ?? prev.guests.filter((g) => g.shows.length >= 2)).length : null;

  return (
    <div className="space-y-5">
      {!!content.shows_failed?.length && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">Couldn&apos;t load in the last run: {content.shows_failed.join(", ")}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Guests on media rounds" value={rounds.length} prev={prevRounds} hint="On 2+ India shows within 30 days" icon={<IconMic />} />
        <Kpi label="Brands spending" value={content.stats.brands_spending} prev={prev?.stats.brands_spending ?? null} hint="Paid podcast reads, 30 days" icon={<IconTag />} />
        <Kpi label="Topics trending" value={content.topics.length} prev={prev ? prev.topics.length : null} hint="On 2+ India shows this period" icon={<IconTrend />} />
        <Kpi label="Episodes scanned" value={content.stats.episodes_scanned} prev={prev?.stats.episodes_scanned ?? null} hint={`${content.stats.shows_scanned} shows · ${formatDate(content.from)} – ${formatDate(new Date(Date.parse(content.to) - 1).toISOString())}`} icon={<IconWave />} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Episodes per week" subtitle="Live feeds scanned · last 8 weeks"
          right={<div className="flex gap-4 text-xs text-muted"><Legend color="bg-violet" label="India" /><Legend color="bg-mint" label="Global" /></div>}>
          {weekly?.length ? <AreaChart data={weekly} /> : <p className="py-10 text-center text-sm text-dim">No episodes in this range yet.</p>}
        </Card>
        <Card title="Spotlight" subtitle="This week's strongest leads">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Spotlight tone="violet" icon={<IconMic />} kind="Guest to book" name={guests[0]?.name} detail={guests[0] && [guests[0].role, guests[0].company].filter(Boolean).join(" · ")} scoreLabel="Booking score" score={guests[0]?.score} />
            <Spotlight tone="mint" icon={<IconTag />} kind="Brand to pitch" name={sponsors[0]?.name} detail={sponsors[0] && `${sponsors[0].paid ? "Paid read" : "Organic"} · ${sponsors[0].shows.join(", ")}`} scoreLabel="Pitch score" score={sponsors[0]?.score} />
          </div>
        </Card>
      </div>

      <Card title="Book this week" subtitle="Founders ahead of the curve, ranked by booking score" flush>
        {guests.length ? guests.map((g, i) => (
          <Item key={g.entity_id} rank={i + 1} item={g} weights={weights} title={g.name}
            subtitle={[g.role, g.company].filter(Boolean).join(" · ")}
            chips={(g.media_rounds ?? g.shows.length >= 2) ? [<Chip key="mr" tone="amber">Media rounds</Chip>] : []}
            meta={`${g.shows.join(", ")} · ${g.appearances} appearance${g.appearances === 1 ? "" : "s"} in 30 days`}
            links={[
              g.linkedin_url ? { href: g.linkedin_url, label: g.linkedin_verified ? "LinkedIn" : "Search on LinkedIn" } : linkedinSearch(g),
              ...(g.website_url ? [{ href: g.website_url, label: "Company website" }] : []),
            ]}
          />
        )) : <Empty />}
        <MediaRounds list={rounds} />
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Topics to ride or counter" subtitle="Themes on 2+ India shows, relevant to founders" flush>
          {topics.length ? topics.map((t, i) => (
            <Item key={t.entity_id} rank={i + 1} item={t} weights={weights} title={capitalize(t.name)}
              chips={[<Chip key="l" tone={t.label === "counter" ? "amber" : "violet"}>{t.label === "counter" ? "Counter" : "Ride"}</Chip>]}
              meta={`${t.show_count} India shows: ${t.shows.join(", ")}`} trend={t.trend}
            />
          )) : <Empty text={earlyNote} />}
        </Card>
        <Card title="Global signals" subtitle="Trending abroad, not yet big in India" flush>
          {global.length ? global.map((g, i) => (
            <Item key={g.entity_id} rank={i + 1} item={g} weights={weights} title={capitalize(g.name)}
              meta={`${g.global_count} global shows vs ${g.india_count} India shows`} extra={g.india_angle ? `India angle: ${g.india_angle}` : undefined}
            />
          )) : <Empty text="Nothing crossed the threshold (needs 2+ global shows in 14 days)." />}
        </Card>
      </div>

      <Card title="Sponsors to pitch" subtitle="Brands buying reads on shows like yours" flush>
        {sponsors.length ? sponsors.map((s, i) => (
          <Item key={s.entity_id} rank={i + 1} item={s} weights={weights} title={s.name} bar
            chips={[<Chip key="p" tone={s.paid ? "mint" : "slate"}>{s.paid ? "Paid read" : "Organic mention"}</Chip>]}
            meta={`${s.show_count} show${s.show_count === 1 ? "" : "s"}: ${s.shows.join(", ")}`} trend={s.trend}
          />
        )) : <Empty />}
      </Card>
    </div>
  );
}

const ACRONYMS = new Set(["ai", "ipo", "ipos", "vc", "vcs", "b2b", "b2c", "d2c", "saas", "upi", "gpu", "gpus", "llm", "llms", "smb", "smbs", "fmcg", "ev", "evs", "us", "uk", "ceo", "cfo", "roi", "api", "agi", "pe", "f&o", "nbfc", "reit", "esop", "esops"]);
/** Sentence case for topic labels, keeping acronyms upper case ("ai bubble" → "AI bubble"). */
const capitalize = (s: string) =>
  s.split(" ").map((w, i) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");

function linkedinSearch(g: GuestItem) {
  const q = encodeURIComponent([g.name, g.company].filter(Boolean).join(" "));
  return { href: `https://www.linkedin.com/search/results/people/?keywords=${q}`, label: "Search on LinkedIn" };
}

export function Card({ title, subtitle, right, flush, className = "", children }: { title: string; subtitle?: string; right?: React.ReactNode; flush?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-panel ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className={flush ? "mt-3 divide-y divide-line border-t border-line" : "p-5"}>{children}</div>
    </section>
  );
}

function Empty({ text }: { text?: string }) {
  return <p className="px-5 py-8 text-sm text-dim">{text ?? "Nothing crossed the threshold this week."}</p>;
}

function Kpi({ label, value, prev, hint, icon }: { label: string; value: number; prev: number | null; hint: string; icon: React.ReactNode }) {
  const delta = prev == null ? null : value - prev;
  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-muted">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet/10 text-violet ring-1 ring-inset ring-violet/20">{icon}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2.5">
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-fg">{value.toLocaleString("en-IN")}</span>
        {delta != null && (
          <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ${delta > 0 ? "bg-mint/10 text-mint" : delta < 0 ? "bg-rose-500/10 text-rose-400" : "bg-white/5 text-muted"}`}>
            {delta > 0 ? "↑ +" : delta < 0 ? "↓ " : "± "}{delta === 0 ? "0" : delta} vs last week
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-dim">{hint}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${color}`} />{label}</span>;
}

function Spotlight({ tone, icon, kind, name, detail, scoreLabel, score }: { tone: "violet" | "mint"; icon: React.ReactNode; kind: string; name?: string; detail?: string; scoreLabel: string; score?: number }) {
  const t = tone === "violet" ? "accent-gradient" : "bg-mint/90";
  return (
    <div className="rounded-xl border border-line bg-panel2 p-4">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-white ${t}`}>{icon}</span>
        <span className="text-sm font-medium text-fg">{kind}</span>
      </div>
      {name ? (
        <>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-canvas/60 px-3 py-2 ring-1 ring-inset ring-line">
            <span className="text-xs text-muted">{scoreLabel}</span>
            <span className={`text-sm font-semibold tabular-nums ${tone === "violet" ? "text-violet" : "text-mint"}`}>{Math.round(score ?? 0)}</span>
          </div>
          <p className="mt-3 text-sm font-semibold text-fg">{name}</p>
          {detail && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{detail}</p>}
        </>
      ) : <p className="mt-3 text-xs text-dim">Nothing crossed the threshold.</p>}
    </div>
  );
}

function MediaRounds({ list }: { list: GuestItem[] }) {
  return (
    <div className="bg-amber-400/[0.04] px-5 py-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300/90">Doing media rounds · 2+ India shows within 30 days</h3>
      {list.length ? (
        <ul className="mt-2 space-y-1.5 text-sm">
          {list.map((g) => (
            <li key={g.entity_id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-fg">{g.name}</span>
              {g.company && <span className="text-muted">{g.company}</span>}
              <span className="text-muted">· {g.shows.join(" + ")}</span>
              {g.sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" className="text-violet hover:underline">{formatDate(s.published_at)}</a>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm text-dim">No guest appeared on two or more monitored India shows within 30 days.</p>
      )}
    </div>
  );
}

function Chip({ tone, children }: { tone: "violet" | "amber" | "mint" | "slate"; children: React.ReactNode }) {
  const tones = {
    violet: "bg-violet/10 text-violet ring-violet/25", amber: "bg-amber-400/10 text-amber-300 ring-amber-400/25",
    mint: "bg-mint/10 text-mint ring-mint/25", slate: "bg-white/5 text-muted ring-line",
  };
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

/** Score out of 100, drawn as a gradient ring. */
function ScoreRing({ score, id }: { score: number; id: string }) {
  const r = 21, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, score));
  return (
    <div className="relative h-14 w-14 shrink-0" aria-label={`Score ${Math.round(v)} out of 100`} title={`Score ${Math.round(v)} / 100`}>
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a855f7" /><stop offset="1" stopColor="#d946ef" /></linearGradient></defs>
        <circle cx="28" cy="28" r={r} fill="none" stroke="#24242d" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={`url(#${id})`} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums text-fg">{Math.round(v)}</span>
    </div>
  );
}

type AnyItem = { entity_id: string; score: number; components: Record<string, number>; sources: Source[] } & Extra;

function Item({ rank, item, weights, title, subtitle, meta, chips = [], links = [], trend, extra, bar }: {
  rank: number; item: AnyItem; weights: Record<string, number>; title: string; subtitle?: string; meta: string; chips?: React.ReactNode[];
  links?: { href: string; label: string }[]; trend?: number[]; extra?: string; bar?: boolean;
}) {
  const tag = item.tag ? <Chip key="tag" tone={item.tag === "New" ? "mint" : item.tag === "Rising" ? "violet" : "slate"}>{item.tag}</Chip> : null;
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none gap-4 px-5 py-4 transition hover:bg-white/[0.02]">
        <span className="mt-0.5 w-4 shrink-0 text-sm font-semibold tabular-nums text-dim">{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-fg">{title}</span>
            {tag}
            {chips}
          </div>
          {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
          {item.why_now && <p className="mt-2 text-sm leading-relaxed text-fg/85">{item.why_now}</p>}
          {extra && <p className="mt-1.5 text-sm text-fg/80">{extra}</p>}
          <p className="mt-2 text-xs text-dim">{meta}</p>
          {bar && (
            <div className="mt-2.5 flex items-center gap-3">
              <div className="h-1.5 flex-1 rounded-full bg-line"><div className="h-1.5 rounded-full accent-gradient" style={{ width: `${Math.min(100, item.score)}%` }} /></div>
            </div>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {links.map((l) => (
              <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="font-medium text-violet hover:underline">{l.label}</a>
            ))}
            <span className="font-medium text-muted group-hover:text-fg">
              <span className="group-open:hidden">Why it ranked · Sources ({item.sources.length}) ▸</span>
              <span className="hidden group-open:inline">Hide details ▾</span>
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <ScoreRing score={item.score} id={`ring-${item.entity_id}`} />
          {trend && <Sparkline values={trend} />}
        </div>
      </summary>
      <div className="grid gap-6 border-t border-line bg-canvas/40 px-5 py-5 sm:pl-13 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="min-w-0">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-dim">Why it ranked here</h4>
          <dl className="mt-3 space-y-2.5 text-sm">
            {Object.entries(item.components).map(([k, v]) => {
              const max = weights[k] || 1;
              return (
                <div key={k}>
                  <div className="flex justify-between gap-4"><dt className="text-muted">{LABELS[k] ?? k}</dt><dd className="tabular-nums text-fg">{v} / {max}</dd></div>
                  <div className="mt-1 h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full accent-gradient" style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /></div>
                </div>
              );
            })}
            <div className="flex justify-between gap-4 border-t border-line pt-2 font-medium text-fg"><dt>Total</dt><dd className="tabular-nums">{item.score} / 100</dd></div>
          </dl>
        </div>
        <div className="min-w-0">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-dim">Sources ({item.sources.length})</h4>
          <ul className="mt-3 space-y-3 text-sm">
            {item.sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-violet hover:underline">{s.episode_title}</a>
                <div className="text-xs text-dim">
                  {s.show_name} · {formatDate(s.published_at)}
                  {s.timestamp_seconds != null && ` · at ${formatTimestamp(s.timestamp_seconds)}`}
                  {s.source === "video" && " · from the video"}
                </div>
                {s.evidence && <div className="mt-0.5 text-muted">“{s.evidence}”</div>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 56 + 2},${18 - (v / max) * 14}`).join(" ");
  return (
    <svg width="60" height="20" viewBox="0 0 60 20" aria-label={`Shows per week, last 8 weeks: ${values.join(", ")}`}>
      <title>{`Shows per week (8 weeks): ${values.join(", ")}`}</title>
      <polyline points={pts} fill="none" stroke="#a855f7" strokeOpacity="0.7" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Two smoothed area series (India, Global) with gridlines, axis labels and a callout on the latest week. */
function AreaChart({ data }: { data: WeekCount[] }) {
  const W = 640, H = 220, L = 34, R = 12, T = 14, B = 26;
  const max = Math.max(4, ...data.flatMap((d) => [d.india, d.global]));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const x = (i: number) => L + (i / Math.max(1, data.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const smooth = (vals: number[]) => {
    const p = vals.map((v, i) => [x(i), y(v)] as const);
    let d = `M${p[0][0]},${p[0][1]}`;
    for (let i = 0; i < p.length - 1; i++) {
      const [x0, y0] = p[Math.max(0, i - 1)], [x1, y1] = p[i], [x2, y2] = p[i + 1], [x3, y3] = p[Math.min(p.length - 1, i + 2)];
      d += ` C${x1 + (x2 - x0) / 6},${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6},${y2 - (y3 - y1) / 6} ${x2},${y2}`;
    }
    return d;
  };
  const india = smooth(data.map((d) => d.india));
  const global = smooth(data.map((d) => d.global));
  const last = data.length - 1;
  const lx = x(last);
  const label = (w: string) => new Date(`${w}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[520px]" role="img" aria-label={`Episodes per week. Latest week: ${data[last].india} India, ${data[last].global} global.`}>
        <defs>
          <linearGradient id="fillIndia" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a855f7" stopOpacity="0.35" /><stop offset="1" stopColor="#a855f7" stopOpacity="0" /></linearGradient>
          <linearGradient id="fillGlobal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#34d399" stopOpacity="0.22" /><stop offset="1" stopColor="#34d399" stopOpacity="0" /></linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k}>
            <line x1={L} x2={W - R} y1={y(step * k)} y2={y(step * k)} stroke="#24242d" strokeDasharray={k ? "3 4" : undefined} />
            <text x={L - 8} y={y(step * k) + 4} textAnchor="end" fontSize="10" fill="#61616e">{step * k}</text>
          </g>
        ))}
        {data.map((d, i) => (
          <text key={d.week} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill={i === last ? "#ededf3" : "#61616e"} fontWeight={i === last ? 600 : 400}>{label(d.week)}</text>
        ))}
        <path d={`${global} L${x(last)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#fillGlobal)" />
        <path d={global} fill="none" stroke="#34d399" strokeWidth="2" />
        <path d={`${india} L${x(last)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#fillIndia)" />
        <path d={india} fill="none" stroke="#a855f7" strokeWidth="2.2" />
        <line x1={lx} x2={lx} y1={T} y2={y(0)} stroke="#ededf3" strokeOpacity="0.25" strokeDasharray="2 3" />
        <circle cx={lx} cy={y(data[last].india)} r="4" fill="#a855f7" stroke="#111116" strokeWidth="2" />
        <circle cx={lx} cy={y(data[last].global)} r="4" fill="#34d399" stroke="#111116" strokeWidth="2" />
        <g transform={`translate(${lx - 116},${T + 4})`}>
          <rect width="104" height="52" rx="8" fill="#17171d" stroke="#24242d" />
          <text x="10" y="17" fontSize="10" fill="#9a9aa8">Week of {label(data[last].week)}</text>
          <circle cx="13" cy="29" r="3" fill="#a855f7" /><text x="21" y="32" fontSize="10.5" fill="#ededf3">India {data[last].india}</text>
          <circle cx="13" cy="42" r="3" fill="#34d399" /><text x="21" y="45" fontSize="10.5" fill="#ededf3">Global {data[last].global}</text>
        </g>
      </svg>
    </div>
  );
}

const ic = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function IconMic() { return <svg {...ic}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>; }
function IconTag() { return <svg {...ic}><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" /></svg>; }
function IconTrend() { return <svg {...ic}><path d="m3 17 6-6 4 4 8-8M15 7h6v6" /></svg>; }
function IconWave() { return <svg {...ic}><path d="M2 12h2M6 8v8M10 5v14M14 8v8M18 10v4M22 12h0" /></svg>; }
