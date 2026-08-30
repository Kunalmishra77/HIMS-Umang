// Umang Hospital HIMS ships five portals. `admin` carries no portal of its own —
// it is the account type used to run seeds and ops scripts, and it stays in the
// enum because the shared Supabase project's profiles.role column and RLS
// policies already recognise it.
export const ALL_ROLES = [
  'doctor',
  'nurse',
  'reception',
  'billing',
  'admin',
  'patient',
] as const

export type Role = (typeof ALL_ROLES)[number]

// The HR directory and internal messaging model the whole hospital's
// workforce, not just the five portals this build ships — a lab technician
// is a real staff record even though `lab` carries no login/portal in this
// cut. `StaffRole` is that broader vocabulary; `Role` (above) stays the
// narrow, exhaustive set used for routing/nav/auth. Limited to roles live
// code actually references — `cmo`/`secretary` (UP government cockpit
// roles), `vendor_manager`, `feedback_analyst` and `hr` have no referent
// left in a private hospital's OPD build and are deliberately excluded.
export type StaffRole =
  | Role
  | 'pharmacy' | 'lab' | 'radiology' | 'emergency' | 'ot' | 'insurance'
  | 'bed_manager' | 'discharge' | 'quality'
  | 'housekeeping' | 'inventory' | 'blood_bank' | 'cssd'
  | 'dietary' | 'bmw' | 'mortuary' | 'ambulance' | 'audit_officer'
