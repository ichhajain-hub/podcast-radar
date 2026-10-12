import type { GlobalItem, GuestItem, ScoreResult, Source, SponsorItem, TopicItem } from "@/lib/score";
import { TOP_N } from "@/lib/score";
import { formatDate, formatTimestamp } from "@/lib/format";

// Renders a radar (live score or stored brief) with the same sections as the email.
// Items can carry optional writer text (why_now / india_angle / action) and a New/Rising/Repeat tag.

type Extra = { why_now?: string; india_angle?: string; action?: string; tag?: "New" | "Rising" | "Repeat" };
export type RadarContent = Omit<ScoreResult, "guests" | "topics" | "sponsors" | "global"> & {
  guests: (GuestItem & Extra)[];
  topics: (TopicItem & Extra)[];
  sponsors: (SponsorItem & Extra)[];
  global: (GlobalItem & Extra)[];
  shows_failed?: string[];
};

const LABELS: Record<string, string> = {
  guest_spread: "Spread across shows", guest_recency: "Recency (last 14 days)", guest_ahead_of_curve: "Ahead of the curve", guest_fit: "Audience fit (Gemini)",
  topic_spread: "Shows covering it", topic_acceleration: "Acceleration vs 4-week avg", topic_gap: "Gap on your show",
  sponsor_spend: "Paid vs organic", sponsor_breadth: "Breadth (shows, 30 days)", sponsor_recency: "Newly seen", sponsor_fit: "Founder-audience fit (Gemini)",
  global_spread: "Global shows covering it", global_not_in_india: "Not yet in India", global_india_translation: "India translation (Gemini)",
};

export function RadarView({ content, full = false }: { content: RadarContent; full?: boolean }) {
  const pick = <T,>(xs: T[], n: number) => (full ? xs : xs.slice(0, n));
  const guests = pick(content.guests, TOP_N.guests);
  const topics = pick(content.topics, TOP_N.topics);
  const sponsors = pick(content.sponsors, TOP_N.sponsors);
  const global = pick(content.global, TOP_N.global);

  return (
    <div className="space-y-12">
      <div className="text-sm text-slate-600">
        {formatDate(content.from)} – {formatDate(new Date(Date.parse(content.to) - 1).toISOString())} · {content.stats.shows_scanned} shows scanned ·{" "}
        {content.stats.episodes_scanned} episodes scanned
        {!!content.shows_failed?.length && (
          <span className="ml-2 rounded bg-red-50 px-2 py-0.5 text-red-700">Failed to load: {content.shows_failed.join(", ")}</span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Tile n={content.stats.guests_on_media_rounds} label="Guests on media rounds" hint={`On ${content.rules?.guest_min_shows ?? 2}+ India show${(content.rules?.guest_min_shows ?? 2) === 1 ? "" : "s"} in 30 days`} />
        <Tile n={content.stats.brands_spending} label="Brands spending" hint="Paid reads in the last 30 days" />
      </div>

      <Section title="Book this week" empty={!guests.length}>
        {guests.map((g, i) => (
          <Item key={g.entity_id} rank={i + 1} item={g} title={g.name}
            subtitle={[g.role, g.company].filter(Boolean).join(", ")}
            meta={`${g.shows.length} show${g.shows.length === 1 ? "" : "s"} (${g.shows.join(", ")}) · ${g.appearances} appearance${g.appearances === 1 ? "" : "s"}`}
            links={[
              g.linkedin_url ? { href: g.linkedin_url, label: g.linkedin_verified ? "LinkedIn" : "Search on LinkedIn" } : linkedinSearch(g),
              ...(g.website_url ? [{ href: g.website_url, label: "Company website" }] : []),
            ]}
          />
        ))}
      </Section>

      <Section title="Topics to ride or counter" empty={!topics.length}>
        {topics.map((t, i) => (
          <Item key={t.entity_id} rank={i + 1} item={t} title={t.name}
            badge={<Badge tone={t.label === "counter" ? "amber" : "indigo"}>{t.label}</Badge>}
            meta={`${t.show_count} India shows this period`} trend={t.trend}
          />
        ))}
        <div className="pt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Global signals · for inspiration</h3>
          {global.length ? (
            <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {global.map((g, i) => (
                <Item key={g.entity_id} rank={i + 1} item={g} title={g.name}
                  meta={`${g.global_count} global shows vs ${g.india_count} India shows`} extra={g.india_angle ? `India angle: ${g.india_angle}` : undefined}
                />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Nothing crossed the threshold this week (needs 2+ global shows in 14 days).</p>
          )}
        </div>
      </Section>

      <Section title="Sponsors to pitch" empty={!sponsors.length}>
        {sponsors.map((s, i) => (
          <Item key={s.entity_id} rank={i + 1} item={s} title={s.name}
            badge={<Badge tone={s.paid ? "emerald" : "slate"}>{s.paid ? "Paid" : "Organic"}</Badge>}
            meta={`${s.show_count} shows`} trend={s.trend}
          />
        ))}
      </Section>
    </div>
  );
}

function linkedinSearch(g: GuestItem) {
  const q = encodeURIComponent([g.name, g.company].filter(Boolean).join(" "));
  return { href: `https://www.linkedin.com/search/results/people/?keywords=${q}`, label: "Search on LinkedIn" };
}

function Tile({ n, label, hint }: { n: number; label: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-6">
      <div className="text-4xl font-semibold tracking-tight text-indigo-600">{n}</div>
      <div className="mt-1 font-medium">{label}</div>
      <div className="text-sm text-slate-500">{hint}</div>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {empty ? (
        <p className="mt-3 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">Nothing crossed the threshold this week.</p>
      ) : (
        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">{children}</div>
      )}
    </section>
  );
}

function Badge({ tone, children }: { tone: "indigo" | "amber" | "emerald" | "slate"; children: React.ReactNode }) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-700", amber: "bg-amber-50 text-amber-800",
    emerald: "bg-emerald-50 text-emerald-700", slate: "bg-slate-100 text-slate-600",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${tones[tone]}`}>{children}</span>;
}

type AnyItem = { score: number; components: Record<string, number>; sources: Source[] } & Extra;

function Item({ rank, item, title, subtitle, meta, badge, links = [], trend, extra }: {
  rank: number; item: AnyItem; title: string; subtitle?: string; meta: string; badge?: React.ReactNode;
  links?: { href: string; label: string }[]; trend?: number[]; extra?: string;
}) {
  return (
    <details className="group p-5">
      <summary className="flex cursor-pointer list-none items-start gap-4">
        <span className="mt-0.5 w-5 text-sm font-semibold text-slate-400">{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{title}</span>
            {subtitle && <span className="text-slate-500">· {subtitle}</span>}
            {badge}
            {item.tag && <Badge tone={item.tag === "New" ? "emerald" : item.tag === "Rising" ? "indigo" : "slate"}>{item.tag}</Badge>}
          </div>
          <div className="mt-1 text-sm text-slate-600">
            {meta}
            {item.why_now && <> · {item.why_now}</>}
          </div>
          {extra && <div className="mt-1 text-sm text-slate-700">{extra}</div>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {links.map((l) => (
              <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{l.label}</a>
            ))}
            <span className="text-indigo-600 group-open:hidden">Sources ({item.sources.length}) ▸</span>
            <span className="hidden text-indigo-600 group-open:inline">Sources ({item.sources.length}) ▾</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-lg font-semibold tabular-nums">{Math.round(item.score)}</span>
          {trend && <Sparkline values={trend} />}
        </div>
      </summary>
      <div className="mt-4 grid gap-6 pl-9 md:grid-cols-[1fr_2fr]">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why it ranked here</h4>
          <dl className="mt-2 space-y-1 text-sm">
            {Object.entries(item.components).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="text-slate-600">{LABELS[k] ?? k}</dt><dd className="tabular-nums">{v}</dd></div>
            ))}
            <div className="flex justify-between gap-4 border-t border-slate-200 pt-1 font-medium"><dt>Total</dt><dd className="tabular-nums">{item.score}</dd></div>
          </dl>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sources ({item.sources.length})</h4>
          <ul className="mt-2 space-y-2 text-sm">
            {item.sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{s.episode_title}</a>
                <span className="text-slate-500"> — {s.show_name}, {formatDate(s.published_at)}{s.timestamp_seconds != null && ` @ ${formatTimestamp(s.timestamp_seconds)}`}{s.source === "video" && " (video)"}</span>
                {s.evidence && <div className="text-slate-500">“{s.evidence}”</div>}
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
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 60},${18 - (v / max) * 16}`).join(" ");
  return (
    <svg width="60" height="20" viewBox="0 0 60 20" aria-label={`Weekly show count, last 8 weeks: ${values.join(", ")}`}>
      <title>{`Shows per week (8 weeks): ${values.join(", ")}`}</title>
      <polyline points={pts} fill="none" stroke="#4f46e5" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
