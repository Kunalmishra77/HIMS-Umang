-- Tier 0 (T0.5): admission_requests and ipd_stays had realtime listeners wired
-- in StoreHydrator, but the tables were never added to the supabase_realtime
-- publication, so those listeners never fired. Add them so bed/admission and
-- in-stay changes propagate live across devices (idempotent).
alter publication supabase_realtime add table admission_requests;
alter publication supabase_realtime add table ipd_stays;
