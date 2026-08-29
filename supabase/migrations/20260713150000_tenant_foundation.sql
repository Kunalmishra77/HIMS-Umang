-- Enterprise foundation: multi-tenant key on every table (the expensive-to-
-- retrofit decision, done before the module build-out). Shared-schema, row-level
-- tenancy: every domain row carries hospital_id (+ branch_id), isolated by RLS
-- going forward. Adding the column with a NOT NULL DEFAULT backfills existing
-- rows and keeps every existing INSERT path working (they get the default) while
-- tenant-aware code sets it explicitly later. Metadata-only on PG 17 — fast.

-- 1. Tenancy tables + a default demo tenant (must exist before FKs validate).
create table if not exists hospitals (
  id          text primary key,
  code        text not null,
  name        text not null,
  district    text,
  state       text,
  created_at  timestamptz not null default now()
);
create table if not exists branches (
  id          text primary key,
  hospital_id text not null references hospitals(id),
  code        text not null,
  name        text not null,
  created_at  timestamptz not null default now()
);
alter table hospitals enable row level security;
alter table branches  enable row level security;
-- Reference data: any authenticated user may read the tenant directory.
drop policy if exists hospitals_read on hospitals;
create policy hospitals_read on hospitals for select to authenticated using (true);
drop policy if exists branches_read on branches;
create policy branches_read on branches for select to authenticated using (true);

insert into hospitals (id, code, name, district, state)
  values ('UP-DEMO-01', 'UPDH-01', 'Demo District Hospital', 'Lucknow', 'Uttar Pradesh')
  on conflict (id) do nothing;
insert into branches (id, hospital_id, code, name)
  values ('UP-DEMO-01-B1', 'UP-DEMO-01', 'MAIN', 'Main Campus')
  on conflict (id) do nothing;

-- 2. Add hospital_id (+ branch_id) to every domain table, backfilled via DEFAULT.
do $$
declare r record;
begin
  for r in
    select table_name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'
      and table_name not in ('hospitals','branches')
  loop
    execute format('alter table public.%I add column if not exists hospital_id text not null default %L', r.table_name, 'UP-DEMO-01');
    execute format('alter table public.%I add column if not exists branch_id text default %L', r.table_name, 'UP-DEMO-01-B1');
  end loop;
end $$;

-- 3. FK integrity to hospitals (guarded for idempotency).
do $$
declare r record;
begin
  for r in
    select table_name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'
      and table_name not in ('hospitals','branches')
  loop
    if not exists (select 1 from pg_constraint where conname = r.table_name||'_hospital_fk') then
      execute format('alter table public.%I add constraint %I foreign key (hospital_id) references hospitals(id)', r.table_name, r.table_name||'_hospital_fk');
    end if;
  end loop;
end $$;

-- 4. Tenant-scoping helpers for RLS (used by module policies from here on).
-- current_hospital(): the caller's home hospital from their profile.
create or replace function public.current_hospital()
returns text language sql stable security definer set search_path = public as $$
  select hospital_id from profiles where id = auth.uid();
$$;

-- same_hospital(hid): true when the row's hospital matches the caller's — with a
-- cross-tenant bypass for platform-level oversight roles (admin sees all; the
-- district/state cockpits read aggregates). Clinical/ops roles are tenant-bound.
create or replace function public.same_hospital(hid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (p.hospital_id = hid or p.role in ('admin','cmo','secretary'))
  );
$$;

-- 5. Helpful index for tenant-scoped queries on the hottest tables.
create index if not exists patients_hospital_idx on patients (hospital_id);
create index if not exists visits_hospital_idx on visits (hospital_id);
create index if not exists audit_entries_hospital_ts_idx on audit_entries (hospital_id, "timestamp" desc);
