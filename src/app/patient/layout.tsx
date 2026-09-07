"use client"

import { useEffect } from "react"
import { RoleGuard } from "@/components/layout/RoleGuard"
import { usePatientStore } from "@/store/usePatientStore"

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  // Every patient page lives under this layout, so this is the one place that
  // reliably loads the signed-in patient's own record independent of whether
  // they currently have an active visit (hydrateReal alone can't — see its
  // hydrateMe doc comment in usePatientStore).
  useEffect(() => {
    void usePatientStore.getState().hydrateMe()
  }, [])

  return <RoleGuard allowedRole="patient">{children}</RoleGuard>
}
