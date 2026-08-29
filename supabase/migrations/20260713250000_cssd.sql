-- Module 9 (CSSD): sterilization cycles + instruments (kind + data jsonb),
-- tenant-isolated. cssd role writes; OT reads (needs sterile-status).
create table if not exists cssd (
  id text primary key,
  kind text not null,
  hospital_id text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id text default 'UP-DEMO-01-B1',
  status text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cssd_hospital_kind_idx on cssd (hospital_id, kind, status);
alter table cssd enable row level security;
drop policy if exists cssd_write on cssd;
create policy cssd_write on cssd for all to authenticated
  using (has_role(array['cssd']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['cssd']::role_t[]) and same_hospital(hospital_id));
drop policy if exists cssd_read on cssd;
create policy cssd_read on cssd for select to authenticated
  using (has_role(array['ot','nurse']::role_t[]) and same_hospital(hospital_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='cssd') then
    alter publication supabase_realtime add table cssd;
  end if;
end $$;
