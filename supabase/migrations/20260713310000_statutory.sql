-- Module 15 (Statutory compliance): statutory returns (data jsonb), tenant-
-- isolated. audit_officer role handles compliance filings; admin implicit.
create table if not exists statutory (
  id text primary key,
  hospital_id text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id text default 'UP-DEMO-01-B1', status text,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists statutory_hospital_status_idx on statutory (hospital_id, status);
alter table statutory enable row level security;
drop policy if exists statutory_write on statutory;
create policy statutory_write on statutory for all to authenticated
  using (has_role(array['audit_officer']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['audit_officer']::role_t[]) and same_hospital(hospital_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='statutory') then
    alter publication supabase_realtime add table statutory;
  end if;
end $$;
