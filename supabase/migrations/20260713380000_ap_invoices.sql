-- Module 22 (Vendor invoices / accounts payable): finance vendors + invoices
-- (kind + data jsonb), tenant-isolated. vendor_manager writes; admin reads.
create table if not exists ap_invoices (
  id text primary key, kind text not null,
  hospital_id text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id text default 'UP-DEMO-01-B1', status text,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists ap_invoices_hospital_kind_idx on ap_invoices (hospital_id, kind, status);
alter table ap_invoices enable row level security;
drop policy if exists ap_invoices_write on ap_invoices;
create policy ap_invoices_write on ap_invoices for all to authenticated
  using (has_role(array['vendor_manager']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['vendor_manager']::role_t[]) and same_hospital(hospital_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='ap_invoices') then
    alter publication supabase_realtime add table ap_invoices;
  end if;
end $$;
