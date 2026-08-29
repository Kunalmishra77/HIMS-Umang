-- Module 6 (Ambulance): one table for vehicles + trips (kind discriminator +
-- data jsonb), tenant-isolated. ambulance role writes; emergency/reception read.

create table if not exists ambulance (
  id           text primary key,
  kind         text not null,                 -- 'vehicle' | 'trip'
  hospital_id  text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id    text default 'UP-DEMO-01-B1',
  status       text,
  patient_id   text,
  data         jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists ambulance_hospital_kind_idx on ambulance (hospital_id, kind, status);

alter table ambulance enable row level security;

drop policy if exists ambulance_write on ambulance;
create policy ambulance_write on ambulance for all to authenticated
  using (has_role(array['ambulance']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['ambulance']::role_t[]) and same_hospital(hospital_id));

drop policy if exists ambulance_read on ambulance;
create policy ambulance_read on ambulance for select to authenticated
  using (has_role(array['emergency','reception']::role_t[]) and same_hospital(hospital_id));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='ambulance') then
    alter publication supabase_realtime add table ambulance;
  end if;
end $$;
