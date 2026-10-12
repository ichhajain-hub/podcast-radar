-- YouTube sponsor deep-read bookkeeping and LinkedIn/website lookup tracking.
alter table episodes add column if not exists deep_read_status text;          -- running | ok | failed | skipped
alter table episodes add column if not exists deep_read_attempts int default 0;
alter table episodes add column if not exists deep_read_started_at timestamptz;
alter table episodes add column if not exists deep_read_note text;
alter table entities add column if not exists lookup_at timestamptz;          -- last LinkedIn/website lookup
create index if not exists episodes_deep_read_idx on episodes (deep_read_at) where youtube_url is not null;
