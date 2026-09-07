import { useAuthStore } from "@/store/useAuthStore"
import { usePatientStore, type Patient } from "@/store/usePatientStore"
import { usePatientProfileStore, type PatientProfile } from "@/store/usePatientProfileStore"

// The single source of "who is the signed-in patient".
//
// This used to compare currentUser.id — a Supabase auth uuid — against
// patients.id, which is text like PT-20394. That can never match, so every
// patient silently saw the demo record. Resolution now goes through
// patients.auth_user_id, which the claim flow populates.
export function usePatientMe(): { me: Patient | undefined; profile: PatientProfile | undefined } {
  const currentUser = useAuthStore((s) => s.currentUser)
  const patients = usePatientStore((s) => s.patients)
  const me = currentUser ? patients.find((p) => p.authUserId === currentUser.id) : undefined
  const profile = usePatientProfileStore((s) => (me ? s.profiles[me.id] : undefined))
  return { me, profile }
}
