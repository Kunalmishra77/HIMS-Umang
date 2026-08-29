-- QA fix: the PortalLauncher advertises a dedicated "Admission / Beds" portal
-- backed by the real `bed_manager` role (present in role_t and assigned to
-- demo-bed_manager@example.test), but the admission_requests + beds RLS policies
-- and the /admission RoleGuard predate that role and grant only reception/admin.
-- Result: the bed_manager login lands on /admission/dashboard, the RoleGuard
-- rejects it and redirects to bed_manager's own home (= the same page) → an
-- infinite "Redirecting…" spinner, and RLS would deny the data anyway.
--
-- This grants bed_manager the same admission/bed access reception has. The
-- RoleGuard allow-list is fixed in the same change (src/app/admission/layout.tsx).

-- admission_requests: staff read
drop policy if exists admission_requests_select_staff on admission_requests;
create policy admission_requests_select_staff on admission_requests for select
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role = any (array['reception','admin','bed_manager']::role_t[])));

-- admission_requests: reception/bed_manager progress the request status
drop policy if exists admission_requests_update_reception on admission_requests;
create policy admission_requests_update_reception on admission_requests for update
  using (
    status = any (array['requested','bed_assigned']::admission_status_t[])
    and exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = any (array['reception','admin','bed_manager']::role_t[])))
  with check (
    status = any (array['bed_assigned','admitted','cancelled']::admission_status_t[])
    and exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = any (array['reception','admin','bed_manager']::role_t[])));

-- beds: full bed management for reception/bed_manager
drop policy if exists beds_all_reception on beds;
create policy beds_all_reception on beds for all
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role = any (array['reception','admin','bed_manager']::role_t[])))
  with check (exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role = any (array['reception','admin','bed_manager']::role_t[])));

notify pgrst, 'reload schema';
