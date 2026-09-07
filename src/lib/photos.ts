/* Umang Hospital's own photography, vendored from the Umang website
 * (Umang2.0/frontend/public) into /public/umang.
 *
 * Used ONLY on landing + patient-facing pages — never clinical worklists.
 * Served through next/image; local assets need no remotePatterns allowlist.
 *
 * Alt text describes the real photograph, so it must be re-checked if a file
 * is ever swapped. */

export const PHOTOS = {
  // The reception desk — the first thing a patient meets (check-in).
  reception: {
    src: "/umang/reception.webp",
    alt: "The reception desk at Umang Hospital",
  },
  // Modular operating theatre — capability/expertise (landing CTA).
  operatingTheatre: {
    src: "/umang/modular-ot.webp",
    alt: "Umang Hospital's modular operating theatre",
  },
} as const

export type PhotoKey = keyof typeof PHOTOS
