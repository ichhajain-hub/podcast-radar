-- Pipeline support: host names, Gemini fit ratings, and an atomic run queue
-- so each show is ingested in its own function call (concurrency 3).

alter table shows add column if not exists hosts text[] default '{}';
alter table entities add column if not exists fit real;        -- 1-5 audience fit (guests, brands)
alter table entities add column if not exists india_fit real;  -- 1-5 India translation (global topics)

alter table runs add column if not exists mode text;
alter table runs add column if not exists total int default 0;
alter table runs add column if not exists pending uuid[] default '{}';

-- Pops the next show id off a run's queue (null when empty).
create or replace function run_claim_next(p_run uuid) returns uuid
language plpgsql as $$
declare v uuid;
begin
  select pending[1] into v from runs where id = p_run for update;
  if v is null then return null; end if;
  update runs set pending = pending[2:] where id = p_run;
  return v;
end $$;

-- Records one show's result; returns how many shows are still unfinished.
create or replace function run_mark_show(p_run uuid, p_name text, p_ok boolean, p_entry jsonb) returns int
language plpgsql as $$
declare v int;
begin
  update runs set
    shows_ok = case when p_ok then array_append(shows_ok, p_name) else shows_ok end,
    shows_failed = case when p_ok then shows_failed else array_append(shows_failed, p_name) end,
    log = jsonb_set(coalesce(log, '{}'::jsonb), '{shows}', coalesce(log->'shows', '[]'::jsonb) || jsonb_build_array(p_entry))
  where id = p_run
  returning total - cardinality(shows_ok) - cardinality(shows_failed) into v;
  return v;
end $$;

-- Appends one Gemini usage record (token counts) to a run's log.
create or replace function run_log_usage(p_run uuid, p_entry jsonb) returns void
language sql as $$
  update runs set log = jsonb_set(coalesce(log, '{}'::jsonb), '{usage}', coalesce(log->'usage', '[]'::jsonb) || jsonb_build_array(p_entry))
  where id = p_run;
$$;

-- Exactly one caller wins the right to finalize a run.
create or replace function run_try_finalize(p_run uuid) returns boolean
language plpgsql as $$
begin
  update runs set status = 'finalizing' where id = p_run and status = 'running';
  return found;
end $$;

revoke execute on function run_claim_next(uuid), run_mark_show(uuid, text, boolean, jsonb),
  run_log_usage(uuid, jsonb), run_try_finalize(uuid) from public, anon, authenticated;
