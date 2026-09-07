import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// The old product name must not survive anywhere a user or a maintainer
// reads. Case-insensitive: "Agentix", "agentix" and "AGENTIX" must all be
// caught — a plain-word check alone previously missed lowercase survivors
// (e.g. "agentix.in" email domains, "agentix-ai-v1" model names).
const FORBIDDEN = ['agentix']

// Internal identifiers that are never rendered to a user or read by a
// maintainer as prose — localStorage keys, BroadcastChannel names, zustand
// persist store names, and the family-token DEMO_SALT. Renaming any of these
// would silently discard every persisted browser session/localStorage value
// on upgrade (a zustand persist name change drops the old storage key; a
// BroadcastChannel name change desyncs any tab still on the old build), so
// they are deliberately left alone and allowlisted here instead. Each entry
// is the exact lowercased token as it appears in source — add a new one only
// for a genuine persisted-storage identifier, never to silence a real
// wording survivor.
const ALLOWED_IDENTIFIERS = new Set([
  // zustand persist `name:` values (src/store/use*.ts)
  'agentix-admissionstore', 'agentix-authstore', 'agentix-billingstore',
  'agentix-consultationstore', 'agentix-dischargestore', 'agentix-doctor-assistant',
  'agentix-doctor-profile', 'agentix-doctorstatsstore', 'agentix-drugmasterstore',
  'agentix-emergencystore',
  'agentix-erstore', 'agentix-family-token-store', 'agentix-feedbackstore',
  'agentix-followupstore', 'agentix-hr', 'agentix-insurancestore',
  'agentix-ipd', 'agentix-journeystore',
  'agentix-labordersstore', 'agentix-messaging', 'agentix-mortuarystore',
  'agentix-narcoticsstore',
  'agentix-notifications', 'agentix-nurse-shift', 'agentix-nursing-tasks',
  'agentix-otstore', 'agentix-patient-feedback', 'agentix-patient-profiles',
  'agentix-patientdiagnosticsstore', 'agentix-patientfinancestore',
  'agentix-patientlivestore', 'agentix-patientordersstore', 'agentix-patientstore',
  'agentix-pharmacyinventorystore', 'agentix-pharmacystore',
  'agentix-radiologystudiesstore', 'agentix-wardstore', 'agentix-whatsappstore',
  // BroadcastChannel name prefix (src/lib/cross-tab-sync.ts)
  'agentix-sync:',
  // localStorage key / namespace prefixes (src/lib/api/_core.ts,
  // src/app/billing/packages/page.tsx, src/app/doctor/consultation/page.tsx,
  // src/components/clinical/CriticalValueBanner.tsx,
  // src/components/patient/dashboard/FamilyInviteCard.tsx,
  // src/app/patient/settings/page.tsx, src/lib/seed-legacy-stores.ts)
  'agentix.api.v1', 'agentix.billing.packages', 'agentix.cv-ack.',
  'agentix.doctor.soap.', 'agentix.legacy-seed.anil-v5',
  'agentix.patient.familyinvites', 'agentix.patient.prefs',
  // family-token DEMO_SALT (src/lib/familyToken.ts)
  'agentix.family.v1',
])

// Matches an identifier-shaped run of characters containing the forbidden
// term — e.g. "agentix-patientstore", "agentix.api.v1", "HIU-AGENTIX-HIMS-01",
// "agentix-ai-v1" — so a match can be checked against ALLOWED_IDENTIFIERS
// token-for-token instead of just string-containment (which would let a
// merely-adjacent allowed token mask a real, separate violation on the same
// line).
const IDENTIFIER_RE = /[\w.:@/<>-]*agentix[\w.:@/<>-]*/gi

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|json)$/.test(e.name)) out.push(p)
  }
  return out
}

describe('branding', () => {
  it('no file under src/ or messages/ mentions the old product name (case-insensitive), outside the documented internal-identifier allowlist', () => {
    const roots = ['src', 'messages'].map((d) => path.join(process.cwd(), d))
    // This file itself must name the forbidden term literally to check for it —
    // skip it so the guard doesn't perpetually flag its own definition.
    const self = path.join(process.cwd(), 'src', '__tests__', 'branding.test.ts')
    const offenders: string[] = []
    for (const root of roots) {
      for (const file of walk(root)) {
        if (file === self) continue
        const text = fs.readFileSync(file, 'utf8')
        for (const term of FORBIDDEN) {
          if (!text.toLowerCase().includes(term)) continue
          const matches = text.match(IDENTIFIER_RE) ?? []
          for (const m of matches) {
            if (!ALLOWED_IDENTIFIERS.has(m.toLowerCase())) {
              offenders.push(`${path.relative(process.cwd(), file)} -> ${m}`)
            }
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
