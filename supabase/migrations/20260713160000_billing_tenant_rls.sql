-- Module 1 (Billing) — make bills/payments RLS tenant-aware and add patient
-- self-read. Extends the T0.2 per-role policies with same_hospital() tenant
-- isolation (admin/cmo/secretary bypass built into the helper), and lets a
-- patient read their own bill/payments via patients.auth_user_id.

-- bills — billing/reception write within their hospital
drop policy if exists bills_write on bills;
create policy bills_write on bills for all to authenticated
  using (has_role(array['billing','reception']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['billing','reception']::role_t[]) and same_hospital(hospital_id));

-- bills — clinical + discharge/insurance read within their hospital
drop policy if exists bills_read on bills;
create policy bills_read on bills for select to authenticated
  using (has_role(array['doctor','nurse','discharge','insurance']::role_t[]) and same_hospital(hospital_id));

-- bills — a patient reads their own bills (linked via patients.auth_user_id)
drop policy if exists bills_read_own on bills;
create policy bills_read_own on bills for select to authenticated
  using (exists (
    select 1 from patients p
    where p.id = bills.patient_id and p.auth_user_id = auth.uid()
  ));

-- payments — billing/reception write within their hospital
drop policy if exists payments_write on payments;
create policy payments_write on payments for all to authenticated
  using (has_role(array['billing','reception']::role_t[]) and same_hospital(hospital_id))
  with check (has_role(array['billing','reception']::role_t[]) and same_hospital(hospital_id));

-- payments — discharge/insurance read within their hospital
drop policy if exists payments_read on payments;
create policy payments_read on payments for select to authenticated
  using (has_role(array['discharge','insurance']::role_t[]) and same_hospital(hospital_id));

-- payments — a patient reads payments on their own bills
drop policy if exists payments_read_own on payments;
create policy payments_read_own on payments for select to authenticated
  using (exists (
    select 1 from bills b join patients p on p.id = b.patient_id
    where b.id = payments.bill_id and p.auth_user_id = auth.uid()
  ));

-- Tenant-scoped lookup indexes for the billing desk.
create index if not exists bills_hospital_patient_idx on bills (hospital_id, patient_id);
create index if not exists bills_status_idx on bills (hospital_id, status);
