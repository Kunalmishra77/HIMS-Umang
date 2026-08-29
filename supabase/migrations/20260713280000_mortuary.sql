-- Module 12 (Mortuary): deceased records (data jsonb), tenant-isolated. mortuary
-- role writes; audit_officer reads (MLC/legal); admin implicit.
create table if not exists mortuary (
  id text primary key,
  hospital_id text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id text default 'UP-DEMO-01-B1', status text, patient_id text,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists mortuary_hospital_status_idx on mortuary (hospital_id, status);
alter table mortuary enable row level security;
drop policy if exists mortuary_write on mortuary;
create policy mortuary_write on mortuary for all to authenticated
  using (has_role(array['mortuary']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['mortuary']::role_t[]) and same_hospital(hospital_id));
drop policy if exists mortuary_read on mortuary;
create policy mortuary_read on mortuary for select to authenticated
  using (has_role(array['audit_officer','emergency','doctor']::role_t[]) and same_hospital(hospital_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='mortuary') then
    alter publication supabase_realtime add table mortuary;
  end if;
end $$;
