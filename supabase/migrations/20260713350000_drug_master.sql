-- Module 19 (Drug master): formulary reference data (data jsonb), tenant-scoped.
-- Read-only for all clinical roles; pharmacy/admin maintain it.
create table if not exists drug_master (
  id text primary key,
  hospital_id text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id text default 'UP-DEMO-01-B1',
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists drug_master_hospital_idx on drug_master (hospital_id);
alter table drug_master enable row level security;
-- Formulary is reference data every clinical role reads.
drop policy if exists drug_master_read on drug_master;
create policy drug_master_read on drug_master for select to authenticated using (same_hospital(hospital_id));
-- pharmacy/admin maintain it.
drop policy if exists drug_master_write on drug_master;
create policy drug_master_write on drug_master for all to authenticated
  using (has_role(array['pharmacy']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['pharmacy']::role_t[]) and same_hospital(hospital_id));
