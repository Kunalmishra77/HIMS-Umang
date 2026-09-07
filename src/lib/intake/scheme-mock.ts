// src/lib/intake/scheme-mock.ts
//
// Government health-scheme eligibility, checked from an Ayushman card number.
// Split out of the former abha-mock.ts when ABHA was removed: ABHA is a health
// *identity* and this hospital does not use it, but AB-PMJAY / CMHIS-UP are
// insurance schemes that still determine what a patient pays.

export interface SchemeEligibilityResult {
  eligible: boolean
  schemeName: 'AB-PMJAY' | 'CMHIS-UP' | ''
  coverage: string
  preAuthRef: string
}

const NOT_ELIGIBLE: SchemeEligibilityResult = { eligible: false, schemeName: '', coverage: '', preAuthRef: '' }

export async function checkSchemeEligibility(ayushmanCardNo: string): Promise<SchemeEligibilityResult> {
  await new Promise(r => setTimeout(r, 1200))

  if (ayushmanCardNo.trim().length < 6) return NOT_ELIGIBLE

  // A `UP-` prefix routes to the state scheme; everything else to the national one.
  const schemeName = ayushmanCardNo.toUpperCase().startsWith('UP-') ? 'CMHIS-UP' : 'AB-PMJAY'
  const preAuthRef = schemeName === 'CMHIS-UP'
    ? `CMHIS-PRE-${Math.floor(1000000 + Math.random() * 9000000)}`
    : `PMJAY-PRE-${Math.floor(1000000 + Math.random() * 9000000)}`

  return {
    eligible: true,
    schemeName,
    coverage: `Covered up to ₹5,00,000/year (${schemeName})`,
    preAuthRef,
  }
}
