-- Module 14 (Quality/NABH): incidents + audit tasks + metrics + NABH indicators
-- (kind + data jsonb; metrics/nabh are singletons), tenant-isolated. quality role
-- writes; admin implicit.
create table if not exists quality (
  id text primary key, kind text not null,
  hospital_id text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id text default 'UP-DEMO-01-B1', status text,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists quality_hospital_kind_idx on quality (hospital_id, kind, status);
alter table quality enable row level security;
drop policy if exists quality_write on quality;
create policy quality_write on quality for all to authenticated
  using (has_role(array['quality']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['quality']::role_t[]) and same_hospital(hospital_id));
drop policy if exists quality_read on quality;
create policy quality_read on quality for select to authenticated
  using (has_role(array['audit_officer','nurse','doctor']::role_t[]) and same_hospital(hospital_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='quality') then
    alter publication supabase_realtime add table quality;
  end if;
end $$;
