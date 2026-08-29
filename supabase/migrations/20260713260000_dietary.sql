-- Module 10 (Dietary): diet plans + meal orders (kind + data jsonb), tenant-
-- isolated. dietary role writes; nurse reads (ward meal coordination).
create table if not exists dietary (
  id text primary key, kind text not null,
  hospital_id text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id text default 'UP-DEMO-01-B1', status text, patient_id text,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists dietary_hospital_kind_idx on dietary (hospital_id, kind, status);
alter table dietary enable row level security;
drop policy if exists dietary_write on dietary;
create policy dietary_write on dietary for all to authenticated
  using (has_role(array['dietary']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['dietary']::role_t[]) and same_hospital(hospital_id));
drop policy if exists dietary_read on dietary;
create policy dietary_read on dietary for select to authenticated
  using (has_role(array['nurse','doctor']::role_t[]) and same_hospital(hospital_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='dietary') then
    alter publication supabase_realtime add table dietary;
  end if;
end $$;
