-- Entity resolution keeps history permanent: duplicates are never deleted, they point
-- at their canonical entity via merged_into, and scoring follows that pointer.
alter table entities add column if not exists merged_into uuid references entities(id);
alter table entities add column if not exists created_at timestamptz default now();
create index if not exists entities_type_root_idx on entities (type) where merged_into is null;
create index if not exists briefs_week_start_idx on briefs (week_start);
