# Umang Hospital HIMS

A standalone Next.js application that runs the complete OPD (outpatient) patient
journey for **Umang Hospital**, a single private hospital. It was extracted from
Agentix HIMS, a 29-portal system built for Uttar Pradesh's government health
infrastructure — everything outside the OPD journey (IPD, ER, OT, pharmacy/lab/
radiology fulfilment, blood bank, the district/CMO government cockpits, and 24
of the original 29 role portals) has been removed. What remains is real,
end-to-end, and backed by a live Postgres database — not a mockup.

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

**Doctor creates orders; nothing fulfils them.** The doctor portal writes
prescriptions and lab/radiology orders as part of the consultation, but the
pharmacy, lab and radiology *fulfilment* portals were out of scope for this
extraction and are gone. Orders are created and visible on the patient's
record; nothing downstream dispenses or resolves them. Teleconsult is cut on
both sides (`/doctor/online` and `/patient/teleconsult` were both removed) —
a doctor-side video flow with no patient screen to join it would have been a
broken half-feature.

## Portals and roles

Five staff-facing portals ship, covering five of the six roles the system
recognises:

| Role | Portal | Covers |
|---|---|---|
| `reception` | `/reception/*` | OPD queue, walk-in registration, appointments, check-in |
| `nurse` | `/nurse/*` | OPD vitals capture, patient worklist |
| `doctor` | `/doctor/*` | Consultation, prescriptions, lab/imaging orders |
| `billing` | `/billing/*` | Full billing: dashboard, patient ledger, packages, discounts, refunds |
| `patient` | `/patient/*` | Registration status, records, downloads, family tracking |
| `admin` | *(none)* | Recognised by auth/RLS for seeding and ops scripts only — ships no UI in this build |

Public, no-login routes: `/` (landing), `/login`, `/checkin` (kiosk), `/abha`
(ABHA consent), `/discovery`, `/p/[uhid]` (public visit tracking).

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
`Demo@HIMS2026!` (override with `DEMO_PASSWORD`). For this build, the roles
that matter are `doctor`, `nurse`, `reception`, `billing`, `admin`, `patient`.
Note the script provisions accounts for every role in the shared Gov-HIMS
system, not just Umang's six — the rest are simply unused here. Visiting
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

## Known-partial

- Order **fulfilment** (dispensing a prescription, running a lab test,
  reading a scan) doesn't exist in this build — see "Doctor creates orders;
  nothing fulfils them" above.
- The voice agent's premium ElevenLabs voice needs a paid ElevenLabs plan; on
  the free tier it returns HTTP 402 and falls back to the browser's built-in
  voice with no code change required.
- `npm run lint` and the full `vitest run` are not clean — see Verification.
- Some seeded demo data (IPD/ICU rows) predates this extraction and is
  Gov-HIMS-shaped, not OPD-shaped — a side effect of the shared database.
- **A settled bill is not patient-visible from Postgres.**
  `patients.auth_user_id` is never set anywhere in `src/`, so patient-owned
  RLS policies such as `bills_read_own` can never fire for a real signed-in
  patient, and `/patient/billing` reads `usePatientOrdersStore` (local
  state) rather than the `bills` table. This is pre-existing Gov-HIMS
  behaviour, not a consequence of this extraction — `auth_user_id` is unused
  the same way in the source repo. User-visible symptom: a patient can pay
  their OPD bill at the billing desk and it will settle correctly in
  Postgres, but that patient's own `/patient/billing` page will never show
  it — it shows fixed local demo data instead.
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
scripts/seed/            # provision-demo-accounts.mjs + bills/drug-master/nurse-worklist seeds
docs/superpowers/        # This extraction's own design spec and implementation plan
```

## Conventions

See [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md) for the full
conventions doc, and [`docs/DESIGN-LANGUAGE.md`](docs/DESIGN-LANGUAGE.md) for
the design system the shipped UI is built on.

## License

Private prototype. Not for production deployment.
