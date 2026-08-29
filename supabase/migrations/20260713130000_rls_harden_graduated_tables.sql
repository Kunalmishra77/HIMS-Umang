-- Tier 0 (T0.2): replace the blanket `for all to authenticated using(true)`
-- policies on the graduated tables with per-role read/write policies, now that
-- real logins make RLS load-bearing. Financial (bills/payments), controlled
-- (pharmacy_narcotics), and reference (staff/drugs) records are no longer
-- writable by any authenticated user of any role.

-- Role check helper. Admin is implicitly allowed everywhere. SECURITY DEFINER so
-- the policy can read profiles regardless of the caller's own row-level grants.
create or replace function public.has_role(roles role_t[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and (role = any(roles) or role = 'admin')
  );
$$;

-- bills — billing/reception write; clinical + discharge/insurance read
drop policy if exists bills_all_authenticated on bills;
create policy bills_write on bills for all to authenticated
  using (has_role(array['billing','reception']::role_t[]))
  with check (has_role(array['billing','reception']::role_t[]));
create policy bills_read on bills for select to authenticated
  using (has_role(array['doctor','nurse','discharge','insurance']::role_t[]));

-- payments — billing/reception write; discharge/insurance read
drop policy if exists payments_all_authenticated on payments;
create policy payments_write on payments for all to authenticated
  using (has_role(array['billing','reception']::role_t[]))
  with check (has_role(array['billing','reception']::role_t[]));
create policy payments_read on payments for select to authenticated
  using (has_role(array['discharge','insurance']::role_t[]));

-- pharmacy_narcotics — controlled register: pharmacy write; audit_officer read
drop policy if exists pharmacy_narcotics_all_authenticated on pharmacy_narcotics;
create policy pharmacy_narcotics_write on pharmacy_narcotics for all to authenticated
  using (has_role(array['pharmacy']::role_t[]))
  with check (has_role(array['pharmacy']::role_t[]));
create policy pharmacy_narcotics_read on pharmacy_narcotics for select to authenticated
  using (has_role(array['audit_officer']::role_t[]));

-- staff — HR writes the directory; every authenticated user may read it
drop policy if exists staff_all_authenticated on staff;
create policy staff_write on staff for all to authenticated
  using (has_role(array['hr']::role_t[]))
  with check (has_role(array['hr']::role_t[]));
create policy staff_read on staff for select to authenticated using (true);

-- drugs — pharmacy maintains the drug master; everyone reads it (prescribing)
drop policy if exists drugs_all_authenticated on drugs;
create policy drugs_write on drugs for all to authenticated
  using (has_role(array['pharmacy']::role_t[]))
  with check (has_role(array['pharmacy']::role_t[]));
create policy drugs_read on drugs for select to authenticated using (true);

-- discharges — cross-functional clearance; reception may read
drop policy if exists discharges_all_authenticated on discharges;
create policy discharges_write on discharges for all to authenticated
  using (has_role(array['discharge','doctor','nurse','pharmacy','billing','insurance']::role_t[]))
  with check (has_role(array['discharge','doctor','nurse','pharmacy','billing','insurance']::role_t[]));
create policy discharges_read on discharges for select to authenticated
  using (has_role(array['reception']::role_t[]));

-- er_cases — emergency + clinical + reception
drop policy if exists er_cases_all_authenticated on er_cases;
create policy er_cases_write on er_cases for all to authenticated
  using (has_role(array['emergency','doctor','nurse','reception']::role_t[]))
  with check (has_role(array['emergency','doctor','nurse','reception']::role_t[]));

-- lab_results (legacy) — lab write; doctor read
drop policy if exists lab_results_all_authenticated on lab_results;
create policy lab_results_write on lab_results for all to authenticated
  using (has_role(array['lab']::role_t[]))
  with check (has_role(array['lab']::role_t[]));
create policy lab_results_read on lab_results for select to authenticated
  using (has_role(array['doctor']::role_t[]));

-- opd_orders — shared cross-device board: clinical roles write; all read (realtime)
drop policy if exists opd_orders_all_staff on opd_orders;
create policy opd_orders_write on opd_orders for all to authenticated
  using (has_role(array['doctor','lab','radiology','pharmacy','nurse','reception']::role_t[]))
  with check (has_role(array['doctor','lab','radiology','pharmacy','nurse','reception']::role_t[]));
create policy opd_orders_read on opd_orders for select to authenticated using (true);
