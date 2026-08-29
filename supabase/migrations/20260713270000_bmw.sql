-- Module 11 (BMW / Bio-Medical Waste): waste logs + compliance reports (kind +
-- data jsonb), tenant-isolated. bmw role writes; audit_officer reads (CPCB/NABH).
create table if not exists bmw (
  id text primary key, kind text not null,
  hospital_id text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id text default 'UP-DEMO-01-B1', status text,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists bmw_hospital_kind_idx on bmw (hospital_id, kind, status);
alter table bmw enable row level security;
drop policy if exists bmw_write on bmw;
create policy bmw_write on bmw for all to authenticated
  using (has_role(array['bmw']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['bmw']::role_t[]) and same_hospital(hospital_id));
drop policy if exists bmw_read on bmw;
create policy bmw_read on bmw for select to authenticated
  using (has_role(array['audit_officer','nurse']::role_t[]) and same_hospital(hospital_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='bmw') then
    alter publication supabase_realtime add table bmw;
  end if;
end $$;
