import { RoleGuard } from "@/components/layout/RoleGuard"

// Bed assignment/admission-request transitions are RLS-authorized for
// 'reception', 'admin', and 'bed_manager' — the dedicated Admission/Beds portal
// role advertised by PortalLauncher. bed_manager is a real role_t value; its
// admission_requests + beds access is granted in
// 20260729120000_admission_bed_manager_role.sql (which also documents why the
// earlier reception/admin-only gating broke the bed_manager login).
export default function AdmissionLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard allowedRole={['reception', 'admin', 'bed_manager']}>{children}</RoleGuard>
}
