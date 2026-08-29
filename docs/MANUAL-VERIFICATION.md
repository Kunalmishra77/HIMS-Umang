# Manual Verification — OPD Journey (Task 12, Layer 3)

This is the human half of Task 12. Layer 1 (`scripts/journey-walk.mjs`) and
Layer 2 (`scripts/route-smoke.mjs`) prove the data journey and every route's
HTTP/i18n health without a browser. They **cannot** prove: that a button is
wired to its handler, that a form actually validates, or that the voice
assistant's microphone flow works — those require a human in a real browser.
Follow this script to close that gap.

Sign-in is at `/login`. Every account below uses the password
`Demo@HIMS2026!` unless your own provisioning run used a different
`DEMO_PASSWORD`. Visiting `/login?role=<role>` (e.g. `/login?role=nurse`)
pre-fills the email field.

Run the six steps below in order — each one hands off the same patient to the
next. Use a fresh patient name per run (e.g. include today's date) so you can
tell your own walk-through data apart from seeded demo data.

---

## Step 0 — Voice check-in (`/checkin/intake`) — proves what Layers 1–2 cannot

**Account:** none (anonymous kiosk flow — this is the self-check-in screen a
patient uses at the front door, no sign-in).

**URL:** `http://localhost:3000/checkin/intake`

1. Open the page. Choose the **voice assistant** path (not the typed wizard).
2. Grant microphone permission when the browser prompts. Speak your name,
   phone number, and a symptom when Asha (the voice assistant) asks.
   - **What only a browser proves:** `getUserMedia` permission handling, the
     Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition` — see
     `src/lib/voiceScribe.ts`, `src/components/intake/VoiceAssistantFlow.tsx`),
     and the mic → transcript → `extractIntakeFromVoice` pipeline
     (`src/ai-services/voice-intake.ts`) all actually firing in sequence.
3. Listen to Asha's spoken responses.
   - **Expected on this environment's ElevenLabs plan:** the TTS call
     (`/api/voice/tts`) returns HTTP 402 because the configured voice needs a
     paid plan (see `src/app/api/voice/tts/route.ts`'s comment). `speak()`
     must fall back to the browser's built-in speech synthesis — you should
     still hear a voice, just not the ElevenLabs one. **This fallback,
     followed by a completed registration, is a PASS** — do not treat the 402
     itself as a failure.
4. Complete the flow through to the success screen. Confirm a token number
   and (if applicable) a UHID are shown.
5. **What to observe:** registration completes end-to-end via voice with no
   dead-end, no unhandled error toast, and no stuck loading state.

---

## Step 1 — Register (reception, typed path)

**Account:** `demo-reception@example.test`
**URL:** `http://localhost:3000/reception/register`

1. Sign in. Fill the registration form for a new patient (name, phone, age,
   gender, department, chief complaint).
2. Submit. Confirm a toast/success state and that the patient now appears in
   `/reception/queue` with a token number.
3. **What only a browser proves:** client-side form validation (required
   fields, phone format), the submit button actually invoking the register
   action, and the queue re-rendering without a manual refresh.

## Step 2 — Queue (reception → nurse handoff)

**Account:** `demo-reception@example.test`, then `demo-nurse@example.test`
**URL:** `http://localhost:3000/reception/queue`, then
`http://localhost:3000/nurse/vitals-requests`

1. From `/reception/queue`, use the action that sends the patient for vitals.
2. Sign out, sign in as `demo-nurse@example.test`, open
   `/nurse/vitals-requests`. Confirm the same patient appears in the "New"
   tab within a few seconds (cross-device polling — see
   `StoreHydrator.tsx`'s 4s poll — so allow up to ~5s).

## Step 3 — Vitals (nurse)

**Account:** `demo-nurse@example.test`
**URL:** `http://localhost:3000/nurse/vitals-requests`

1. Open the patient's vitals form. Enter BP, temperature, SpO2, pulse,
   weight. Submit.
2. Confirm the patient moves to the "Done" tab, and a NEWS2-derived triage
   toast appears (routine/prioritise/fast-track).
3. **What to observe:** this is the step Layer 1 could not exercise through a
   dedicated route (there is no `/api/opd-*` route for vitals — see the Task
   12 report) — it validates the actual write path
   (`usePatientStore.recordOpdVitals`), gated on your real signed-in session.

## Step 4 — Consultation (doctor)

**Account:** `demo-doctor@example.test`
**URL:** `http://localhost:3000/doctor/dashboard` → open the patient →
`http://localhost:3000/doctor/consultation`

1. Confirm the patient appears in the doctor's queue after vitals (same
   cross-device propagation as Step 2).
2. Open the consultation screen. Confirm vitals recorded in Step 3 are
   visible.
3. Enter a diagnosis/notes.

## Step 5 — Orders (prescription + lab)

**Account:** `demo-doctor@example.test` (same consultation screen)

1. Add a prescription (at least one medicine) and dispatch it.
2. Order at least one lab test and dispatch it.
3. Click **Complete Consultation**.
4. **What to observe:** both orders leave the doctor's screen but **no
   portal in this build ever advances them past dispatch** — there is no
   pharmacy or lab portal shipped (confirmed 404 in the Task 12 report's
   Step 5). If you can find any UI control anywhere in the five shipped
   portals that moves either order to a "dispensed"/"resulted" state, **that
   is a Critical finding** per the task brief — report it.

## Step 6 — Bill (billing desk)

**Account:** `demo-billing@example.test`
**URL:** `http://localhost:3000/billing/dashboard`, then
`http://localhost:3000/billing/patient/<id>`

1. Find the patient (routed to billing after consultation). Confirm an OPD
   consultation-fee line item is present (or add one).
2. Record a payment for the full amount, mode "Cash".
3. Confirm the bill's status becomes "Settled"/"Paid" and the balance shows
   ₹0.
4. **Known gap — verify it yourself:** sign out, sign in as
   `demo-patient@example.test`, and open `/patient/billing`. Per the Task 12
   report, this page currently renders from a local mock store
   (`usePatientOrdersStore`, hardcoded to a fixed demo patient "Kiran
   Patil"/"PT-20394"), **not** the real `bills` table you just wrote to — so
   the payment you just captured is **not expected to appear there**. Confirm
   this is still the case (i.e. confirm the gap, don't be surprised by it),
   and flag it if the behavior has changed.

---

## Cross-cutting things only a browser can confirm

- **Every button reaches its handler.** Layers 1–2 only prove routes render
  and the four `/api/opd-*` endpoints have correct contracts — they say
  nothing about whether a specific `<button onClick=...>` in the UI is wired
  correctly. Click through the primary action on each of the ~58 shipped
  pages at least once during the steps above.
- **Form validation.** Try submitting the registration and vitals forms with
  a required field blank; confirm inline validation blocks submission rather
  than a 500 or a silent no-op.
- **Locale toggle.** Switch language (en ⇄ hi) via the in-app toggle (not by
  editing the cookie by hand, which is what `route-smoke.mjs` does) on at
  least two pages, and confirm the UI actually re-renders in the new
  language without a full reload glitch.
- **The `ENVIRONMENT_FALLBACK` server log line.** During Task 12's route
  smoke, the running server logged one `Error: ENVIRONMENT_FALLBACK` at the
  very first request after cold start, then never again across the following
  116 requests (58 routes × 2 locales) — including repeat hits on `/`. The
  page itself returned HTTP 200 with a full, correct body both times. The
  cause wasn't identified within Task 12's scope (see the report). If you
  see it recur under real interactive use, that's worth a closer look;
  if it's cold-start-only noise, it isn't blocking.
