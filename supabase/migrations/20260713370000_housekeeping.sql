-- Module 21 (Housekeeping): cleaning tasks + staff (kind + data jsonb), tenant-
-- isolated. housekeeping role writes; nurse/bed_manager read (bed turnover).
create table if not exists housekeeping (
  id text primary key, kind text not null,
  hospital_id text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id text default 'UP-DEMO-01-B1', status text,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists housekeeping_hospital_kind_idx on housekeeping (hospital_id, kind, status);
alter table housekeeping enable row level security;
drop policy if exists housekeeping_write on housekeeping;
create policy housekeeping_write on housekeeping for all to authenticated
  using (has_role(array['housekeeping']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['housekeeping']::role_t[]) and same_hospital(hospital_id));
drop policy if exists housekeeping_read on housekeeping;
create policy housekeeping_read on housekeeping for select to authenticated
  using (has_role(array['nurse','bed_manager']::role_t[]) and same_hospital(hospital_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='housekeeping') then
    alter publication supabase_realtime add table housekeeping;
  end if;
end $$;
