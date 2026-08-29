-- Module 17 (Consent management): informed-consent records (data jsonb), tenant-
-- isolated. reception/doctor create requests; patients sign; clinical + audit read.
create table if not exists consent (
  id text primary key,
  hospital_id text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id text default 'UP-DEMO-01-B1', status text, patient_id text,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists consent_hospital_patient_idx on consent (hospital_id, patient_id, status);
alter table consent enable row level security;
drop policy if exists consent_write on consent;
create policy consent_write on consent for all to authenticated
  using (has_role(array['reception','doctor','nurse','patient']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['reception','doctor','nurse','patient']::role_t[]) and same_hospital(hospital_id));
drop policy if exists consent_read on consent;
create policy consent_read on consent for select to authenticated
  using (has_role(array['audit_officer','ot']::role_t[]) and same_hospital(hospital_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='consent') then
    alter publication supabase_realtime add table consent;
  end if;
end $$;
