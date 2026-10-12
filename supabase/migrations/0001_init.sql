-- Podcast Ecosystem Radar: initial schema (spec section 4).
-- History is permanent: never delete from episodes, mentions, entities or briefs.

create table if not exists shows (
  id uuid primary key default gen_random_uuid(),
  name text not null, rss_url text unique not null,
  youtube_channel_url text, region text not null check (region in ('india','global','own')),
  active boolean default true, last_fetch_status text, updated_at timestamptz default now()
);
create table if not exists weights (
  key text primary key, value real not null, updated_at timestamptz default now()
);
create table if not exists episodes (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references shows(id), title text not null, description text,
  published_at timestamptz not null, url text unique not null, youtube_url text,
  extracted_at timestamptz, deep_read_at timestamptz
);
create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('guest','topic','brand')),
  canonical_name text not null, aliases text[] default '{}',
  company text, role text, website_url text,
  linkedin_url text, linkedin_verified boolean default false,
  unique (type, canonical_name)
);
create table if not exists mentions (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid references episodes(id), entity_id uuid references entities(id),
  kind text not null check (kind in ('guest','topic','paid','organic')),
  source text not null check (source in ('notes','video')),
  confidence real, evidence text, timestamp_seconds int, stance text,
  unique (episode_id, entity_id, kind)
);
create table if not exists briefs (
  id uuid primary key default gen_random_uuid(),
  week_start date unique not null, content_json jsonb not null, html text not null, sent_at timestamptz
);
create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz default now(), finished_at timestamptz, status text,
  shows_ok text[] default '{}', shows_failed text[] default '{}', log jsonb
);
-- Non-weight settings (deep-read minute cap, Gemini price per 1M tokens, etc.)
create table if not exists settings (
  key text primary key, value jsonb not null, updated_at timestamptz default now()
);

create index if not exists episodes_published_at_idx on episodes (published_at);
create index if not exists mentions_episode_id_idx on mentions (episode_id);
create index if not exists mentions_entity_id_idx on mentions (entity_id);

-- Server uses the service role key only; lock tables to anonymous clients.
alter table shows enable row level security;
alter table weights enable row level security;
alter table episodes enable row level security;
alter table entities enable row level security;
alter table mentions enable row level security;
alter table briefs enable row level security;
alter table runs enable row level security;
alter table settings enable row level security;

-- Default weights (spec section 6)
insert into weights (key, value) values
  ('guest_spread',40),('guest_recency',25),('guest_ahead_of_curve',20),('guest_fit',15),
  ('topic_spread',40),('topic_acceleration',30),('topic_gap',30),
  ('sponsor_spend',40),('sponsor_breadth',25),('sponsor_recency',20),('sponsor_fit',15),
  ('global_spread',35),('global_not_in_india',35),('global_india_translation',30)
on conflict (key) do nothing;

insert into settings (key, value) values
  ('deep_read_max_minutes', '170'),
  ('price_input_per_1m', '0.75'),
  ('price_output_per_1m', '3.75')
on conflict (key) do nothing;
