import { RoleGuard } from "@/components/layout/RoleGuard"

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRole="doctor">
      {children}
    </RoleGuard>
  )
}
