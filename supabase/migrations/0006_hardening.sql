-- Security advisor: pin search_path on pipeline functions. Performance advisor: index foreign keys.
alter function run_claim_next(uuid) set search_path = public;
alter function run_mark_show(uuid, text, boolean, jsonb) set search_path = public;
alter function run_log_usage(uuid, jsonb) set search_path = public;
alter function run_try_finalize(uuid) set search_path = public;
create index if not exists episodes_show_id_idx on episodes (show_id);
create index if not exists entities_merged_into_idx on entities (merged_into);
