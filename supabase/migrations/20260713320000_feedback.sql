-- Module 16 (Feedback): patient feedback requests + submitted records (kind +
-- data jsonb), tenant-isolated. feedback_analyst/reception create requests;
-- patients submit records; feedback_analyst reads analytics.
create table if not exists feedback (
  id text primary key, kind text not null,
  hospital_id text not null default 'UP-DEMO-01' references hospitals(id),
  branch_id text default 'UP-DEMO-01-B1', status text, patient_id text,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists feedback_hospital_kind_idx on feedback (hospital_id, kind, status);
alter table feedback enable row level security;
drop policy if exists feedback_write on feedback;
create policy feedback_write on feedback for all to authenticated
  using (has_role(array['feedback_analyst','reception','patient']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['feedback_analyst','reception','patient']::role_t[]) and same_hospital(hospital_id));
drop policy if exists feedback_read on feedback;
create policy feedback_read on feedback for select to authenticated
  using (has_role(array['admin']::role_t[]) and same_hospital(hospital_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='feedback') then
    alter publication supabase_realtime add table feedback;
  end if;
end $$;
