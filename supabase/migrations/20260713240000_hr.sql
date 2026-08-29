-- Module 8 (HR/HRMS): one table for all 10 HR entities (staff, shifts, leave,
-- duty, swaps, sick-calls, overtime, shift-templates, payroll, dept-minimums)
-- via kind discriminator + data jsonb, tenant-isolated. HR role writes/reads
-- (staff records are sensitive); admin implicit.

create table if not exists hr (
  id           text primary key,
  kind         text not null,
  hospital_id  text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id    text default 'UP-DEMO-01-B1',
  status       text,
  data         jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists hr_hospital_kind_idx on hr (hospital_id, kind, status);

alter table hr enable row level security;

-- HR role only (staff/payroll are sensitive); admin implicit via has_role.
drop policy if exists hr_write on hr;
create policy hr_write on hr for all to authenticated
  using (has_role(array['hr']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['hr']::role_t[]) and same_hospital(hospital_id));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='hr') then
    alter publication supabase_realtime add table hr;
  end if;
end $$;
