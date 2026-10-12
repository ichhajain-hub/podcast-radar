import type { GlobalItem, GuestItem, ScoreResult, Source, SponsorItem, TopicItem } from "@/lib/score";
import { TOP_N } from "@/lib/score";
import { formatDate, formatTimestamp } from "@/lib/format";
import { DEFAULT_WEIGHTS } from "@/lib/weights";

// Renders a radar (live score or stored brief) with the same sections as the email.
// Items can carry optional writer text (why_now / india_angle / action) and a New/Rising/Repeat tag.

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

export function RadarView({ content, full = false, earlyNote }: { content: RadarContent; full?: boolean; earlyNote?: string }) {
  const pick = <T,>(xs: T[], n: number) => (full ? xs : xs.slice(0, n));
  const guests = pick(content.guests, TOP_N.guests);
  const topics = pick(content.topics, TOP_N.topics);
  const sponsors = pick(content.sponsors, TOP_N.sponsors);
  const global = pick(content.global, TOP_N.global);
  const weights = { ...DEFAULT_WEIGHTS, ...(content.weights ?? {}) } as Record<string, number>;
  const rounds = content.media_rounds ?? content.guests.filter((g) => g.media_rounds ?? g.shows.length >= 2);

  return (
    <div className="space-y-14">
      <div>
        <p className="text-sm text-slate-500">
          {formatDate(content.from)} – {formatDate(new Date(Date.parse(content.to) - 1).toISOString())} · {content.stats.shows_scanned} shows · {content.stats.episodes_scanned} episodes scanned
        </p>
        {!!content.shows_failed?.length && (
          <p className="mt-2 inline-block rounded-md bg-red-50 px-3 py-1 text-sm text-red-700">Couldn&apos;t load this run: {content.shows_failed.join(", ")}</p>
        )}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Tile n={rounds.length} label="Guests on media rounds" hint="On 2+ monitored India shows within 30 days" />
          <Tile n={content.stats.brands_spending} label="Brands spending" hint="Paid podcast reads in the last 30 days" />
        </div>
      </div>

      <Section title="Book this week" kicker="Founders ahead of the curve, ranked by booking score" empty={!guests.length}>
        {guests.map((g, i) => (
          <Item key={g.entity_id} rank={i + 1} item={g} weights={weights} title={g.name}
            subtitle={[g.role, g.company].filter(Boolean).join(" · ")}
            chips={(g.media_rounds ?? g.shows.length >= 2) ? [<Chip key="mr" tone="amber">Media rounds</Chip>] : []}
            meta={`${g.shows.join(", ")} · ${g.appearances} appearance${g.appearances === 1 ? "" : "s"} in 30 days`}
            links={[
              g.linkedin_url ? { href: g.linkedin_url, label: g.linkedin_verified ? "LinkedIn" : "Search on LinkedIn" } : linkedinSearch(g),
              ...(g.website_url ? [{ href: g.website_url, label: "Company website" }] : []),
            ]}
          />
        ))}
        <MediaRounds list={rounds} />
      </Section>

      <Section title="Topics to ride or counter" kicker="Themes on 2+ India shows this week, relevant to founders" empty={!topics.length} emptyText={earlyNote}>
        {topics.map((t, i) => (
          <Item key={t.entity_id} rank={i + 1} item={t} weights={weights} title={capitalize(t.name)}
            chips={[<Chip key="l" tone={t.label === "counter" ? "amber" : "indigo"}>{t.label === "counter" ? "Counter" : "Ride"}</Chip>]}
            meta={`${t.show_count} India shows: ${t.shows.join(", ")}`} trend={t.trend}
          />
        ))}
      </Section>

      <Section title="Global signals" kicker="For inspiration: trending on global shows, not yet big in India" empty={!global.length}
        emptyText="Nothing crossed the threshold this week (needs 2+ global shows in 14 days).">
        {global.map((g, i) => (
          <Item key={g.entity_id} rank={i + 1} item={g} weights={weights} title={capitalize(g.name)}
            meta={`${g.global_count} global shows vs ${g.india_count} India shows`} extra={g.india_angle ? `India angle: ${g.india_angle}` : undefined}
          />
        ))}
      </Section>

      <Section title="Sponsors to pitch" kicker="Brands buying reads on shows like yours" empty={!sponsors.length}>
        {sponsors.map((s, i) => (
          <Item key={s.entity_id} rank={i + 1} item={s} weights={weights} title={s.name}
            chips={[<Chip key="p" tone={s.paid ? "emerald" : "slate"}>{s.paid ? "Paid read" : "Organic mention"}</Chip>]}
            meta={`${s.show_count} show${s.show_count === 1 ? "" : "s"}: ${s.shows.join(", ")}`} trend={s.trend}
          />
        ))}
      </Section>
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function linkedinSearch(g: GuestItem) {
  const q = encodeURIComponent([g.name, g.company].filter(Boolean).join(" "));
  return { href: `https://www.linkedin.com/search/results/people/?keywords=${q}`, label: "Search on LinkedIn" };
}

function MediaRounds({ list }: { list: GuestItem[] }) {
  return (
    <div className="bg-amber-50/40 px-5 py-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-800">Doing media rounds · 2+ India shows within 30 days</h3>
      {list.length ? (
        <ul className="mt-2 space-y-1.5 text-sm">
          {list.map((g) => (
            <li key={g.entity_id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-slate-900">{g.name}</span>
              {g.company && <span className="text-slate-500">{g.company}</span>}
              <span className="text-slate-600">· {g.shows.join(" + ")}</span>
              {g.sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{formatDate(s.published_at)}</a>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm text-slate-500">No guest appeared on two or more monitored India shows within 30 days.</p>
      )}
    </div>
  );
}

function Tile({ n, label, hint }: { n: number; label: string; hint: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-4xl font-semibold tabular-nums tracking-tight text-indigo-600">{n}</div>
      <div>
        <div className="font-medium text-slate-900">{label}</div>
        <div className="text-sm text-slate-500">{hint}</div>
      </div>
    </div>
  );
}

function Section({ title, kicker, empty, emptyText, children }: { title: string; kicker: string; empty: boolean; emptyText?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{kicker}</p>
      </div>
      {empty ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">{emptyText ?? "Nothing crossed the threshold this week."}</p>
      ) : (
        <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">{children}</div>
      )}
    </section>
  );
}

function Chip({ tone, children }: { tone: "indigo" | "amber" | "emerald" | "slate"; children: React.ReactNode }) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100", amber: "bg-amber-50 text-amber-800 ring-amber-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100", slate: "bg-slate-100 text-slate-600 ring-slate-200",
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

/** Score out of 100, drawn as a ring. */
function ScoreRing({ score }: { score: number }) {
  const r = 22, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, score));
  return (
    <div className="relative h-14 w-14 shrink-0" aria-label={`Score ${Math.round(v)} out of 100`} title={`Score ${Math.round(v)} / 100`}>
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="#ffffff" stroke="#e0e7ff" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke="#4f46e5" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-base font-semibold tabular-nums text-slate-900">{Math.round(v)}</span>
    </div>
  );
}

type AnyItem = { score: number; components: Record<string, number>; sources: Source[] } & Extra;

function Item({ rank, item, weights, title, subtitle, meta, chips = [], links = [], trend, extra }: {
  rank: number; item: AnyItem; weights: Record<string, number>; title: string; subtitle?: string; meta: string; chips?: React.ReactNode[];
  links?: { href: string; label: string }[]; trend?: number[]; extra?: string;
}) {
  const tag = item.tag ? <Chip key="tag" tone={item.tag === "New" ? "emerald" : item.tag === "Rising" ? "indigo" : "slate"}>{item.tag}</Chip> : null;
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none gap-4 p-5 transition hover:bg-slate-50/70 sm:gap-5">
        <span className="mt-1 w-5 shrink-0 text-sm font-semibold tabular-nums text-slate-400">{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-slate-900">{title}</span>
            {tag}
            {chips}
          </div>
          {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
          {item.why_now && <p className="mt-2 text-[15px] leading-relaxed text-slate-700">{item.why_now}</p>}
          {extra && <p className="mt-1.5 text-sm text-slate-700">{extra}</p>}
          <p className="mt-2 text-sm text-slate-500">{meta}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {links.map((l) => (
              <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:underline">{l.label}</a>
            ))}
            <span className="font-medium text-indigo-600">
              <span className="group-open:hidden">Why it ranked · Sources ({item.sources.length}) ▸</span>
              <span className="hidden group-open:inline">Hide details ▾</span>
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <ScoreRing score={item.score} />
          {trend && <Sparkline values={trend} />}
        </div>
      </summary>
      <div className="grid gap-6 border-t border-slate-100 bg-slate-50/60 px-5 py-5 sm:pl-14 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="min-w-0">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Why it ranked here</h4>
          <dl className="mt-3 space-y-2.5 text-sm">
            {Object.entries(item.components).map(([k, v]) => {
              const max = weights[k] || 1;
              return (
                <div key={k}>
                  <div className="flex justify-between gap-4"><dt className="text-slate-600">{LABELS[k] ?? k}</dt><dd className="tabular-nums text-slate-900">{v} / {max}</dd></div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-200"><div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /></div>
                </div>
              );
            })}
            <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 font-medium"><dt>Total</dt><dd className="tabular-nums">{item.score} / 100</dd></div>
          </dl>
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sources ({item.sources.length})</h4>
          <ul className="mt-3 space-y-3 text-sm">
            {item.sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:underline">{s.episode_title}</a>
                <div className="text-slate-500">
                  {s.show_name} · {formatDate(s.published_at)}
                  {s.timestamp_seconds != null && ` · at ${formatTimestamp(s.timestamp_seconds)}`}
                  {s.source === "video" && " · from the video"}
                </div>
                {s.evidence && <div className="mt-0.5 text-slate-600">“{s.evidence}”</div>}
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
      <polyline points={pts} fill="none" stroke="#a5b4fc" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
