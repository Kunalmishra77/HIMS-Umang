-- Module 3 (ER triage): tenant-harden er_cases RLS, publish realtime, and add a
-- `data jsonb` column to carry the ER board's rich ERPatient model (vitals
-- history, MLC record, phase, treatment area, disposition orchestration) that
-- doesn't fit the flat scalar columns. Scalar columns remain the queryable/RLS
-- mirror; `data` is the faithful full record the /emergency UI round-trips.

alter table er_cases add column if not exists data jsonb;

-- Tenant-aware write (emergency + clinical + reception within their hospital;
-- admin implicit via has_role, cross-tenant via same_hospital bypass).
drop policy if exists er_cases_write on er_cases;
create policy er_cases_write on er_cases for all to authenticated
  using (has_role(array['emergency','doctor','nurse','reception']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['emergency','doctor','nurse','reception']::role_t[]) and same_hospital(hospital_id));

-- realtime for the live ER board (idempotent)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='er_cases') then
    alter publication supabase_realtime add table er_cases;
  end if;
end $$;

create index if not exists er_cases_hospital_disp_idx on er_cases (hospital_id, disposition);
