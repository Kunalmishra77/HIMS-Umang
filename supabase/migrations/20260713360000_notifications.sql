-- Module 20 (Notifications): cross-role notification bus (data jsonb), tenant-
-- scoped. Any authenticated user in the hospital may write (fire a notification
-- for any target role) and read (client filters by targetRole) — like the audit
-- bus, role-open but tenant-isolated.
create table if not exists notifications (
  id text primary key,
  hospital_id text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id text default 'UP-DEMO-01-B1', target_role text, read boolean default false,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists notifications_hospital_role_idx on notifications (hospital_id, target_role, read);
alter table notifications enable row level security;
drop policy if exists notifications_rw on notifications;
create policy notifications_rw on notifications for all to authenticated
  using (same_hospital(hospital_id)) with check (same_hospital(hospital_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='notifications') then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;
