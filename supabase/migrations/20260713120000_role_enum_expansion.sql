-- Tier 0 (T0.1): expand role_t from the original 7 clinical/ops roles to the
-- full 29-role set the app defines in src/types/roles.ts (ALL_ROLES), so that
-- a real Supabase login for ANY portal can carry its true role in profiles.role.
-- ADD VALUE IF NOT EXISTS is idempotent and safe to re-run.
alter type role_t add value if not exists 'emergency';
alter type role_t add value if not exists 'bed_manager';
alter type role_t add value if not exists 'discharge';
alter type role_t add value if not exists 'ot';
alter type role_t add value if not exists 'billing';
alter type role_t add value if not exists 'insurance';
alter type role_t add value if not exists 'hr';
alter type role_t add value if not exists 'quality';
alter type role_t add value if not exists 'feedback_analyst';
alter type role_t add value if not exists 'housekeeping';
alter type role_t add value if not exists 'inventory';
alter type role_t add value if not exists 'vendor_manager';
alter type role_t add value if not exists 'blood_bank';
alter type role_t add value if not exists 'cssd';
alter type role_t add value if not exists 'dietary';
alter type role_t add value if not exists 'bmw';
alter type role_t add value if not exists 'mortuary';
alter type role_t add value if not exists 'ambulance';
alter type role_t add value if not exists 'audit_officer';
alter type role_t add value if not exists 'patient';
alter type role_t add value if not exists 'cmo';
alter type role_t add value if not exists 'secretary';
