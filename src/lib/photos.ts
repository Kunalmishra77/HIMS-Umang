/* Umang Hospital's own photography, vendored from the Umang website
 * (Umang2.0/frontend/public) into /public/umang.
 *
 * Used ONLY on landing + patient-facing pages — never clinical worklists.
 * Served through next/image; local assets need no remotePatterns allowlist.
 *
 * Alt text describes the real photograph, so it must be re-checked if a file
 * is ever swapped. */

export const PHOTOS = {
  // Reception desk — the first thing a patient meets (check-in).
  doctorPatient: {
    src: "/umang/reception.webp",
    alt: "The reception desk at Umang Hospital",
  },
  // Consultant at work — collaborative, calm.
  consult: {
    src: "/umang/consultant.webp",
    alt: "A consultant at Umang Hospital reviewing a patient's case",
  },
  // Approachable clinician portrait.
  clinician: {
    src: "/umang/consultant.webp",
    alt: "A consultant at Umang Hospital",
  },
  // Modular operating theatre — capability/expertise (landing CTA).
  careTeam: {
    src: "/umang/modular-ot.webp",
    alt: "Umang Hospital's modular operating theatre",
  },
  // Calm, modern inpatient room.
  ward: {
    src: "/umang/deluxe-room.webp",
    alt: "A patient room at Umang Hospital",
  },
} as const

export type PhotoKey = keyof typeof PHOTOS
