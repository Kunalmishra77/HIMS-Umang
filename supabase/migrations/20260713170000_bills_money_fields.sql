-- Module 1 (Billing): carry the billing desk's money adjustments on the bill so
-- the real backend is the source of truth for the /billing UI (which today runs
-- on a dummy store with these fields). balance is redefined by the app layer as
-- total - discount - non_payable - insurance_covered - paid; patient-due is
-- derived (total - discount - non_payable - insurance_covered), not stored.
alter table bills add column if not exists discount           numeric not null default 0;
alter table bills add column if not exists non_payable        numeric not null default 0;
alter table bills add column if not exists insurance_covered  numeric not null default 0;
