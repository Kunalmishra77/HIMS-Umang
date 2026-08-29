-- Module 7 (Inventory): one table for assets + requisitions + repairs (kind
-- discriminator + data jsonb), tenant-isolated. inventory role writes; vendor
-- manager reads (procurement view).

create table if not exists inventory (
  id           text primary key,
  kind         text not null,                 -- 'asset' | 'requisition' | 'repair'
  hospital_id  text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id    text default 'UP-DEMO-01-B1',
  status       text,
  data         jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists inventory_hospital_kind_idx on inventory (hospital_id, kind, status);

alter table inventory enable row level security;

drop policy if exists inventory_write on inventory;
create policy inventory_write on inventory for all to authenticated
  using (has_role(array['inventory']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['inventory']::role_t[]) and same_hospital(hospital_id));

drop policy if exists inventory_read on inventory;
create policy inventory_read on inventory for select to authenticated
  using (has_role(array['vendor_manager']::role_t[]) and same_hospital(hospital_id));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='inventory') then
    alter publication supabase_realtime add table inventory;
  end if;
end $$;
