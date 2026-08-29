-- Module 5 (Operation Theatre): one table for OT procedures + rooms (kind
-- discriminator + data jsonb), tenant-isolated. The rich OTProcedure (WHO
-- checklist, anaesthesia record, counts, specimens, debrief, clearance pillars)
-- round-trips through `data`; scalar columns mirror the queryable fields.

create table if not exists ot (
  id           text primary key,
  kind         text not null,                 -- 'procedure' | 'room'
  hospital_id  text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id    text default 'UP-DEMO-01-B1',
  patient_id   text,
  status       text,
  ot_room      text,
  data         jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists ot_hospital_kind_idx on ot (hospital_id, kind, status);

alter table ot enable row level security;

-- OT role writes within its hospital (admin implicit via has_role)
drop policy if exists ot_write on ot;
create policy ot_write on ot for all to authenticated
  using (has_role(array['ot']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['ot']::role_t[]) and same_hospital(hospital_id));

-- surgeons / nurses read within their hospital
drop policy if exists ot_read on ot;
create policy ot_read on ot for select to authenticated
  using (has_role(array['doctor','nurse']::role_t[]) and same_hospital(hospital_id));

-- realtime for the live OT board (idempotent)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='ot') then
    alter publication supabase_realtime add table ot;
  end if;
end $$;
