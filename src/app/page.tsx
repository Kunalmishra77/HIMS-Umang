"use client"

import { LandingNav } from "@/components/landing/LandingNav"
import { LandingHero } from "@/components/landing/LandingHero"
import { PortalLauncher } from "@/components/landing/PortalLauncher"
import { ModulesBento } from "@/components/landing/ModulesBento"
import { FinalCta } from "@/components/landing/FinalCta"
import { LandingFooter } from "@/components/landing/LandingFooter"

// Umang Hospital HIMS — OPD-only landing page for a single private hospital.
// Hero (sign-in) → Launch Console (five portals) → Modules (what ships) → CTA.
// The role-selection gateway lives in <PortalLauncher/>.
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-[#0B1220]">
      <LandingNav />
      <main>
        <LandingHero />
        <PortalLauncher />
        <ModulesBento />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  )
}
