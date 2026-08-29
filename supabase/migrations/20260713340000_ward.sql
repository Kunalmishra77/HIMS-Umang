-- Module 18 (Ward management): nursing-station bed/patient view (data jsonb),
-- tenant-isolated. nurse writes; doctor/bed_manager read.
create table if not exists ward (
  id text primary key,
  hospital_id text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id text default 'UP-DEMO-01-B1', status text, patient_id text,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists ward_hospital_idx on ward (hospital_id, status);
alter table ward enable row level security;
drop policy if exists ward_write on ward;
create policy ward_write on ward for all to authenticated
  using (has_role(array['nurse']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['nurse']::role_t[]) and same_hospital(hospital_id));
drop policy if exists ward_read on ward;
create policy ward_read on ward for select to authenticated
  using (has_role(array['doctor','bed_manager']::role_t[]) and same_hospital(hospital_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='ward') then
    alter publication supabase_realtime add table ward;
  end if;
end $$;
