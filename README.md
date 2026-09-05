# Umang Hospital HIMS

A standalone Next.js application that runs the complete OPD (outpatient) patient
journey for **Umang Hospital**, a single private hospital. It was extracted from
Agentix HIMS, a 29-portal system built for Uttar Pradesh's government health
infrastructure — everything outside the OPD journey (IPD, ER, OT, lab/
radiology fulfilment, blood bank, the district/CMO government cockpits, and 24
of the original 29 role portals) has been removed. Pharmacy fulfilment is the
one exception added back in — see "Doctor creates orders; only pharmacy
fulfils them" below. What remains is real, end-to-end, and backed by a live
Postgres database — not a mockup.

> Heads-up — this is a heavily modified Next.js 16. See [`AGENTS.md`](AGENTS.md)
> for project conventions before writing any Next.js code.

---

## The journey

```
Landing → Registration (voice or form) → Reception → Nurse/Vitals
        → Doctor Consultation → OPD completion
```

A patient lands on the (bilingual, en/hi) marketing page, registers either by
filling a form or talking to **Asha**, a voice registration agent (OpenAI +
ElevenLabs), is checked in and queued at Reception, has vitals taken by a
Nurse, is seen by a Doctor who writes prescriptions and lab/imaging orders,
and the visit is billed. Anyone can follow a visit's live status, without
logging in, at `/p/[uhid]`.

**Doctor creates orders; only pharmacy fulfils them.** The doctor portal
writes prescriptions and lab/radiology orders as part of the consultation.
Lab and radiology *fulfilment* portals were out of scope for the original
extraction and are still gone — those orders are created and visible on the
patient's record, but nothing downstream runs the test or reads the scan.
Pharmacy is the exception: it has a dispensing-counter pipeline (see
`docs/superpowers/specs/2026-09-04-pharmacy-portal-design.md`) that carries
prescriptions from queued through preparing, ready and collected. Both the
store-level pipeline and the dispensing-counter portal that drives it (`/pharmacy/*`)
have shipped. Teleconsult is cut on both sides (`/doctor/online`
and `/patient/teleconsult` were both removed) — a doctor-side video flow
with no patient screen to join it would have been a broken half-feature.

## Portals and roles

Six staff-facing portals ship, covering six of the seven roles the system
recognises:

| Role | Portal | Covers |
|---|---|---|
| `reception` | `/reception/*` | OPD queue, walk-in registration, appointments, check-in |
| `nurse` | `/nurse/*` | OPD vitals capture, patient worklist |
| `doctor` | `/doctor/*` | Consultation, prescriptions, lab/imaging orders |
| `billing` | `/billing/*` | Full billing: dashboard, patient ledger, packages, discounts, refunds |
| `pharmacy` | `/pharmacy/*` | Prescription queue, dispensing, inventory, drug master, narcotics log |
| `patient` | `/patient/*` | Registration status, records, downloads, family tracking |
| `admin` | *(none)* | Recognised by auth/RLS for seeding and ops scripts only — ships no UI in this build |

Public, no-login routes: `/` (landing), `/login`, `/claim` (patient record
claim), `/checkin` (kiosk), `/abha` (ABHA consent), `/discovery`, `/p/[uhid]`
(public visit tracking).

## Claiming a patient record

A patient who was registered at the hospital (by Reception, at a kiosk, or
via voice check-in) doesn't get portal credentials automatically — they
claim their own existing record at `/claim`, matching three factors against
an unclaimed row in `patients`: **UHID + phone number + full name**, all
three exactly. A match mints a real Supabase auth account and links it to
that patient row (`patients.auth_user_id`); the account can then sign in
normally. Identity resolution and `/patient/billing` are real from that
point on — they read that patient's own row and bills. **`/patient/dashboard`
is not**: its clinical cards are pre-existing front-end simulation, unkeyed
by identity — see Known-partial below for what that means in practice.

**This is demo-grade assurance, not identity proofing.** UHID + phone + name
is enough to stop casual cross-patient snooping and to demonstrate the
pattern end to end, but none of the three factors is a secret a hospital
staff member, a printed prescription, or a chatty relative couldn't supply —
there is no OTP to the phone on file, no ABHA verification, nothing that
proves the claimant *is* the patient. Do not read `/claim` as a real
identity-verification flow; see Known-partial below for the specific gaps
(residual response-timing signal, rate-limiter bypass on malformed input).
Production-grade identity proofing — OTP to the phone on file, or ABHA
verification — is deliberately out of scope for this build.

## Setup

```bash
npm ci
cp .env.example .env.local   # fill in the values — see below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `.env.local` needs a
Supabase URL/anon key/service-role key, a `DATABASE_URL` (Supabase's session
pooler, used only by the CLI and seed scripts), and — optional but required
for the voice agent and AI copilots to do more than fall back to
non-AI behaviour — `OPENAI_API_KEY`, `ELEVENLABS_API_KEY` and
`ELEVENLABS_VOICE_ID`. `.env.local` is gitignored; `.env.example` lists every
key name with a blank value and is committed.

### Demo accounts

```bash
NEW_SUPABASE_URL=... NEW_SERVICE_ROLE_KEY=... node scripts/seed/provision-demo-accounts.mjs
```

Creates (or resets) one real Supabase auth account per role — idempotent, so
it's safe to re-run. Each account is `demo-<role>@example.test` with password
`Demo@HIMS2026!` (override with `DEMO_PASSWORD`). The script provisions
exactly the six roles this build ships — `doctor`, `nurse`, `reception`,
`billing`, `admin`, `patient` (see `src/types/roles.ts`) — and no others: it
used to provision all 29 Gov-HIMS roles, which meant every run rewrote demo
credentials for 23 accounts belonging to portals this build doesn't have.
Visiting
`/login?role=doctor` prefills the email field so a tester only has to type the
password. `scripts/seed/seed-bills.mjs`, `seed-drug-master.mjs` and
`seed-nurse-worklist.mjs` seed supporting demo data over `NEW_DB_SESSION`
(Supabase's session pooler); they carry over some Gov-HIMS-era IPD/ICU rows
from before the extraction, since the underlying data is common to both apps.

---

## This app shares its Supabase project with Gov-HIMS

**Read this before touching the schema, RLS policies, or seed data.** Umang
Hospital HIMS and Gov-HIMS point at the **same Supabase project** — one
Postgres instance, one RLS policy set, one auth user pool. This was a
deliberate, explicit decision to avoid a second migration effort, not an
oversight. The consequence: a schema change made for either app affects both,
and demo data is common to both. There is no tenant boundary between them at
the database level.

The patient-record claim flow (`/claim`, see "Claiming a patient record"
above) is the first feature in this build that creates real `auth.users`
rows of its own at runtime, rather than only reading/seeding them — every
successful claim mints a new Supabase auth account in the pool shared with
Gov-HIMS.

`supabase/migrations/` holds **Gov-HIMS's applied migration history, copied
verbatim — all 61 files**. This project adds none of its own. The files stay
exactly as applied so that `supabase db push` computes its diff against a
history that actually happened; deleting, renaming, or "tidying" any of them
would make that diff wrong. If a future project needs a smaller, OPD-only
migration set against a fresh Supabase project, that is a deliberate follow-up
this build does not attempt.

---

## Verification

```bash
rm -rf .next
npx tsc --noEmit
npm run build
node scripts/reachability.mjs   # (or: npm run reachability) — expect DEAD: 0
npx vitest run \
  src/__tests__/manifest.test.ts \
  src/__tests__/i18n-namespaces.test.ts \
  src/__tests__/order-boundary.test.ts \
  src/__tests__/branding.test.ts \
  src/lib/__tests__/opd-doctors.test.ts \
  src/lib/api/__tests__/core-fallback.test.ts \
  src/lib/intake/__tests__/register.test.ts \
  src/lib/supabase/__tests__/client.test.ts \
  src/store/__tests__/useLabOrdersStore.setRealIds.test.ts
```

The suites above are hermetic — they touch nothing external and are the
binding gate. **`npm run test` (the full `vitest run`) is advisory only**: the
rest of the suite asserts against the live shared Supabase project and is
nondeterministic here — three consecutive full runs have produced three
different failure sets with no code change between them. `npm run lint` is a
no-regression gate against the inherited Gov-HIMS baseline, not a pass gate —
it has never returned zero problems on this codebase.

### Live-server / manual verification (Task 12's three layers)

The binding gate above is hermetic and doesn't touch a running server. Three
additional, non-hermetic layers close that gap — none of them are part of
the binding gate (they need a live server and, for Layer 1, the live shared
Supabase project), so run them separately when you want that extra
confidence, e.g. before a demo or a release:

- **Layer 1 — `node scripts/journey-walk.mjs`** drives the OPD backbone
  (register → queue → vitals → consult → orders → bill) against a *running*
  server and the live Supabase project via the real `/api/opd-*` routes (plus
  the same direct-Supabase-write path the app itself uses for vitals/billing,
  which have no dedicated route), asserting every row actually lands in
  Postgres. Start the app first (`npm run build && npm start`), then run the
  script from another terminal.
- **Layer 2 — `node scripts/route-smoke.mjs`** requests every shipped
  `src/app/**/page.tsx` route in both locales against a running server and
  asserts HTTP 200 with no `MISSING_MESSAGE`/`IntlError` in the body. Same
  prerequisite: start the app first, then run the script.
- **Layer 3 — [`docs/MANUAL-VERIFICATION.md`](docs/MANUAL-VERIFICATION.md)**
  is the human script for what only a browser can prove: the voice
  check-in's microphone flow, form validation, and that a button is actually
  wired to its handler.

## Known-partial

- Lab and radiology order **fulfilment** (running a test, reading a scan)
  doesn't exist in this build — see "Doctor creates orders; only pharmacy
  fulfils them" above. Pharmacy's dispensing pipeline has landed at the
  store level, and the dispensing-counter portal (`/pharmacy/*`) that drives
  it has shipped.
- The voice agent's premium ElevenLabs voice needs a paid ElevenLabs plan; on
  the free tier it returns HTTP 402 and falls back to the browser's built-in
  voice with no code change required.
- `npm run lint` and the full `vitest run` are not clean — see Verification.
- Some seeded demo data (IPD/ICU rows) predates this extraction and is
  Gov-HIMS-shaped, not OPD-shaped — a side effect of the shared database.
- **Appointments do not persist to Postgres.** `lib/api/appointments.ts` was
  found dead in Task 6 and removed; the reception, patient and discovery
  booking pages all run on `usePatientStore` local state instead. This is
  pre-existing Gov-HIMS behaviour, not a consequence of this extraction —
  the same dead-code path existed there too. User-visible symptom: an
  appointment booked in the UI looks booked in that browser tab, but does
  not survive a cross-device reload (another portal, or the same portal on
  another machine, will never see it).
- The patient identifier shown in the UI is **derived, not persisted**:
  `patients.uhid` is `NULL` for most rows, and `lib/uhid.ts`'s
  `deriveUhid()` computes a stable `PUH-YYYY-NNNNN` from the patient id
  wherever a canonical UHID was never captured. This is correct by design,
  not a bug — a `NULL` `uhid` on a freshly registered patient is expected.
- `src/rules-engine/` (allergy blocking, drug interactions, dosage bounds,
  critical values) was deleted — it was already dead in the source repo,
  reachable only from an out-of-scope lab panel and never wired into the
  consultation flow, so this extraction carries none of it forward.
- **`/api/patient/claim`'s response-time floor narrows the timing signal, it
  does not eliminate it.** A non-matching guess returns after one `select`
  plus an in-process scan; a matching guess also makes an Auth Admin API
  round trip (`createUser`) before it can fail later in the flow. Holding
  every response to a 500ms floor (`MIN_RESPONSE_MS` in the route) narrows
  that gap, but a `createUser` call slower than the floor still shows
  through, and it assumes a *warm* server — on a cold instance, a matching
  guess pays the SDK's warm-up cost that a non-matching guess never touches,
  so the observable gap can be *wider* during warm-up, not narrower. The
  real control is the per-UHID lockout in `src/lib/claimRateLimit.ts` (5
  failures/hour), which makes collecting enough samples to exploit the
  residual signal impractical. This is a narrowed leak, not a closed one.
- **Malformed-body requests to `/api/patient/claim` bypass both rate
  limiters by design.** Body validation runs before `checkAndRecord`,
  because there is no trustworthy UHID to key a limiter on until the body
  parses — so a flood of junk POSTs (bad JSON, missing fields) is rate-limited
  by neither the per-IP nor the per-UHID counter. If this endpoint is ever
  exposed publicly, an edge or WAF-level limiter is the right layer to stop
  that kind of generic flood; the in-app limiters are not it.
- **`/patient/dashboard`'s clinical cards are pre-existing front-end
  simulation, unkeyed by identity.** `usePatientLiveStore`/
  `usePatientOrdersStore` and the `PrescriptionsCard`/`DiagnosticsCard` they
  feed were never wired to the signed-in patient's own id — every claimed
  account that signs in sees the same fabricated prescriptions, diagnostics
  and financial summary on that page, regardless of who they are. This
  predates the claim flow and was a deliberate call, not a fix-round item —
  see "Claiming a patient record" above for what *is* real once an account
  claims a record: identity resolution and `/patient/billing`. Only those
  two read that patient's actual row and bills; the dashboard does not.
- **Staff who sign in through the landing page's demo role switcher see
  blank patient phone numbers, and doctor/records' phone search will not
  match.** `HeroSignIn.tsx`'s role switcher (`useAuthStore.setRole()`) is a
  client-side fake login — it sets `isRealSession: false` and creates no
  Supabase auth session, so to the server that browser is indistinguishable
  from an anonymous one. `GET /api/opd-queue` deliberately withholds `phone`
  (and `authUserId`) from unauthenticated callers — see that route's
  comments — because `phone` is the one factor `/api/patient/claim`
  matches on that isn't otherwise derivable from this same public response,
  so publishing it to an anonymous caller would hand out a complete claim
  on any queued patient. The demo switcher carries no credential a server
  could verify, so it cannot be granted an exception without reopening that
  hole. Signing in with real credentials at `/login` creates a genuine
  Supabase session, which restores phone numbers on the next queue
  hydration.

---

## Repository structure

```
src/
├── app/                # Next.js App Router — one folder per portal
│   ├── reception/       nurse/       doctor/       billing/       patient/
│   ├── login/  checkin/  abha/  discovery/  p/[uhid]/  journey/[patientId]/
│   └── api/             # Route handlers (voice-turn intake, session bridge, cross-device orders)
├── components/          # Shared UI + portal-specific components
├── store/               # Zustand stores, one per domain
├── lib/                 # Pure utilities, incl. the Supabase-backed API layer (lib/api/)
├── ai-services/         # OpenAI copilots + ElevenLabs voice integration
├── i18n/                # next-intl wiring for messages/{en,hi}/*.json
└── types/                # Shared type definitions (see types/roles.ts for the role model)

messages/{en,hi}/        # Bilingual UI strings, one namespace per module, key-for-key parity enforced
supabase/migrations/     # Gov-HIMS's applied migration history — verbatim, see above
scripts/                 # i18n tooling, reachability checker, seed/
scripts/journey-walk.mjs # Layer 1 live-server/live-DB OPD journey check — see Verification above
scripts/route-smoke.mjs  # Layer 2 live-server route/i18n smoke test — see Verification above
scripts/seed/            # provision-demo-accounts.mjs + bills/drug-master/nurse-worklist seeds
docs/superpowers/        # This extraction's own design spec and implementation plan
```

## Conventions

See [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md) for the full
conventions doc, and [`docs/DESIGN-LANGUAGE.md`](docs/DESIGN-LANGUAGE.md) for
the design system the shipped UI is built on.

## License

Private prototype. Not for production deployment.
