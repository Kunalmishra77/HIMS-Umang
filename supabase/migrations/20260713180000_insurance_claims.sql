-- Module 2 (Insurance / TPA): real insurance_claims table + tenant-aware RLS.
-- Greenfield — the /insurance UI runs on a dummy store today. Scalar columns for
-- the queryable fields; jsonb for the nested document/timeline/AI structures.
-- hospital_id/branch_id added here (this table postdates the tenant-foundation
-- migration) with the same NOT NULL DEFAULT pattern for safe inserts.

create table if not exists insurance_claims (
  id                 text primary key,
  hospital_id        text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id          text default 'UP-DEMO-01-B1',
  patient_id         text,                          -- nullable: some claims pre-link
  patient_name       text not null,
  policy_number      text,
  policy_holder      text,
  sum_insured        numeric,
  available          numeric,
  provider           text not null,
  amount             numeric not null default 0,
  approved_amount    numeric,
  status             text not null default 'Pending Pre-Auth',
  approval_stage     text,
  tpa_query          text,
  ai_probability     numeric,
  ai_denial_risk     jsonb,
  submission_status  text not null default 'not_submitted',
  ai_validation      jsonb,
  documents          jsonb not null default '[]'::jsonb,
  timeline           jsonb not null default '[]'::jsonb,
  submitted_at       timestamptz,
  tpa_reference_id   text,
  diagnosis          text,
  treatment_summary  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists insurance_claims_hospital_patient_idx on insurance_claims (hospital_id, patient_id);
create index if not exists insurance_claims_stage_idx on insurance_claims (hospital_id, approval_stage);

alter table insurance_claims enable row level security;

-- insurance / billing write within their hospital (admin implicit via has_role)
drop policy if exists insurance_claims_write on insurance_claims;
create policy insurance_claims_write on insurance_claims for all to authenticated
  using (has_role(array['insurance','billing']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['insurance','billing']::role_t[]) and same_hospital(hospital_id));

-- clinical / discharge read within their hospital
drop policy if exists insurance_claims_read on insurance_claims;
create policy insurance_claims_read on insurance_claims for select to authenticated
  using (has_role(array['doctor','nurse','discharge']::role_t[]) and same_hospital(hospital_id));

-- a patient reads their own claims (via patients.auth_user_id)
drop policy if exists insurance_claims_read_own on insurance_claims;
create policy insurance_claims_read_own on insurance_claims for select to authenticated
  using (exists (
    select 1 from patients p
    where p.id = insurance_claims.patient_id and p.auth_user_id = auth.uid()
  ));

-- realtime for the TPA desk / pipeline board (idempotent)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='insurance_claims') then
    alter publication supabase_realtime add table insurance_claims;
  end if;
end $$;
