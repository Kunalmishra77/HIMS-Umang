-- Module 4 (Blood Bank): one table holding both blood units and cross-match
-- requests (kind discriminator + data jsonb), tenant-isolated. Issuing blood is
-- a controlled action, so only the blood_bank role writes; clinical/OT roles read.

create table if not exists blood_bank (
  id           text primary key,
  kind         text not null,                 -- 'unit' | 'request'
  hospital_id  text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id    text default 'UP-DEMO-01-B1',
  blood_group  text,                          -- mirror for inventory queries
  status       text,                          -- mirror
  patient_id   text,                          -- for requests
  data         jsonb not null,                -- full BloodUnit / CrossMatchRequest
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists blood_bank_hospital_kind_idx on blood_bank (hospital_id, kind, status);

alter table blood_bank enable row level security;

-- blood_bank role writes within its hospital (admin implicit via has_role)
drop policy if exists blood_bank_write on blood_bank;
create policy blood_bank_write on blood_bank for all to authenticated
  using (has_role(array['blood_bank']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['blood_bank']::role_t[]) and same_hospital(hospital_id));

-- clinical / OT read within their hospital (they order + transfuse)
drop policy if exists blood_bank_read on blood_bank;
create policy blood_bank_read on blood_bank for select to authenticated
  using (has_role(array['doctor','nurse','ot']::role_t[]) and same_hospital(hospital_id));

-- realtime for the live inventory / cross-match board (idempotent)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='blood_bank') then
    alter publication supabase_realtime add table blood_bank;
  end if;
end $$;
