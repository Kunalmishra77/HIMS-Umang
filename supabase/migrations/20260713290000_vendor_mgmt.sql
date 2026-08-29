-- Module 13 (Vendor Management): vendors + contracts + purchase orders + payments
-- (kind + data jsonb), tenant-isolated. vendor_manager role writes; admin implicit.
create table if not exists vendor_mgmt (
  id text primary key, kind text not null,
  hospital_id text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id text default 'UP-DEMO-01-B1', status text,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists vendor_mgmt_hospital_kind_idx on vendor_mgmt (hospital_id, kind, status);
alter table vendor_mgmt enable row level security;
drop policy if exists vendor_mgmt_write on vendor_mgmt;
create policy vendor_mgmt_write on vendor_mgmt for all to authenticated
  using (has_role(array['vendor_manager']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['vendor_manager']::role_t[]) and same_hospital(hospital_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='vendor_mgmt') then
    alter publication supabase_realtime add table vendor_mgmt;
  end if;
end $$;
