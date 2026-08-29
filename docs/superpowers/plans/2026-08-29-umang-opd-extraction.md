# Umang Hospital HIMS — OPD Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a standalone Next.js application at `E:\Umang Hospital HIMS` containing only the modules needed to run a complete OPD patient journey — landing, registration (form + voice), reception, nurse/vitals, doctor consultation, patient portal, billing — extracted subtractively from the 29-portal Gov-HIMS system.

**Architecture:** Mirror the source repo to the target, then prune to a fixpoint. Out-of-scope routes are deleted per an explicit manifest; three system-wide barrel files (`StoreHydrator`, `lib/api/index.ts`, `messages/{en,hi}/index.ts`) are hand-pruned because they otherwise make every module look reachable; then an import-graph reachability script is run repeatedly, deleting newly-orphaned files each pass, until the dead set is empty. Verification is the six-step patient journey plus `tsc`/`build`/`lint`/`vitest`.

**Tech Stack:** Next.js 16.2.4 (App Router), React 19.2.4, TypeScript 5 (strict), Tailwind CSS 4, Supabase (`@supabase/ssr` + `supabase-js`, Postgres + RLS + Realtime), Zustand 5 (persist middleware, `skipHydration: true`), next-intl 4 (en + hi), Zod 4, react-hook-form 7, Vitest 4, OpenAI + ElevenLabs (server-side only).

**Spec:** [`docs/superpowers/specs/2026-08-29-umang-opd-extraction-design.md`](../specs/2026-08-29-umang-opd-extraction-design.md)

## Global Constraints

- **Target path:** `E:\Umang Hospital HIMS` (POSIX form for the Bash tool: `/e/Umang Hospital HIMS`). The path contains a space — quote it in every command.
- **Source path:** `d:\Agentix Project\Gov-HIMS` (POSIX: `/d/Agentix Project/Gov-HIMS`). **The source repo is never modified by this plan.** All edits happen in the target.
- **Shared database:** the target reuses the source's Supabase project verbatim — same `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`. No new migrations are written. `supabase/migrations/` is copied complete and unmodified (all 61 files) because they are the applied history of a live database.
- **Roles — exactly these six:** `doctor`, `nurse`, `reception`, `billing`, `admin`, `patient`. `admin` ships **no routes and no nav entry**; it exists only because the shared `profiles.role` column and RLS policies already recognise it.
- **Portals — exactly these five:** Patient, Reception, Nurse, Doctor, Billing.
- **Order boundary:** the doctor **creates** prescriptions and lab/imaging orders. No fulfilment: no dispensing, specimen handling, result entry, verification, QC, reflex, scheduling, reading, or reporting. No `/lab`, `/pharmacy`, `/radiology` routes or roles.
- **Teleconsult is cut on both sides:** neither `/doctor/online` nor `/patient/teleconsult` ships.
- **TypeScript always.** No `any` unless truly unavoidable. Functional components only. Tailwind classes, no inline style objects for reused styles. No comments unless the WHY is non-obvious.
- **Next.js is not the version you know.** Read `node_modules/next/dist/docs/` before writing any Next.js code (per `AGENTS.md`).
- **Every task ends green:** `npx tsc --noEmit` and `npm run build` must both exit 0 before the task's commit, and from Task 4 onward `node scripts/reachability.mjs` must report `DEAD: 0`.
- **`npm run lint` and `npm run test` are NO-REGRESSION gates, not pass gates.** Neither passes on the Gov-HIMS source and neither ever did — measured on the untouched source repo:
  - **lint baseline: 602 problems (294 errors, 308 warnings).** The target must not exceed this, nor introduce a violation of a rule the source did not already violate. (After Task 4 the target sits at 281 problems / 194 errors — lower, because half the tree is gone.)
  - **vitest: gate on the 6 hermetic suites only.** The suite splits in two. Six suites touch nothing external and pass deterministically — measured green 3 runs out of 3, 24/24 tests:

    ```
    src/__tests__/manifest.test.ts
    src/lib/__tests__/opd-doctors.test.ts
    src/lib/api/__tests__/core-fallback.test.ts
    src/lib/intake/__tests__/register.test.ts
    src/lib/supabase/__tests__/client.test.ts
    src/store/__tests__/useLabOrdersStore.setRealIds.test.ts
    ```

    **These six are the binding gate and must be green.** Run them explicitly rather than running the whole suite.

    The other 17 assert against the **live shared Supabase project** and are **advisory only** — they are nondeterministic here, not merely failing: three consecutive full runs produced three different failure sets (7, then 10, then 11 failing files) with no code change between them, which is connection/timeout racing under parallel execution against a shared remote database. Several also encode schema expectations that predate the `tenant_foundation` migration's `branch_id`/`hospital_id` columns and fail identically on the untouched source. Do not gate on them and do not chase them; note new failures, but only a hermetic-suite failure blocks.
  - Treating either as a pass gate would make Task 12 unsatisfiable. Repairing them is pre-existing Gov-HIMS debt and is out of scope, recorded as follow-up.
- **Commit after every task.** Conventional Commits (`chore:`, `feat:`, `refactor:`, `docs:`). Work happens on branch `chore/opd-extraction` in the target repo; `main` receives it at the end.

---

## File Structure

New files created in the target repo:

| File | Responsibility |
|---|---|
| `scripts/reachability.mjs` | Single source of truth for the route manifest; walks the import graph from route entry points and reports reachable / dead files. Used by Tasks 3–12 and by the final "no dead code" gate. |
| `src/__tests__/manifest.test.ts` | Asserts the shipped role set, that every nav href resolves to a real route directory, and that no route outside the manifest exists on disk. |
| `src/__tests__/i18n-namespaces.test.ts` | Asserts every namespace passed to `useTranslations` exists in both the `en` and `hi` message barrels, and that no orphan namespace files remain. |
| `src/__tests__/order-boundary.test.ts` | Pins the order boundary: the pharmacy, lab and radiology stores expose a create action and no fulfilment action, so a later edit cannot quietly reintroduce dispensing or result entry. |
| `.env.example` | Key names with blank values, committed; `.env.local` stays gitignored. |
| `README.md` | Rewritten: Umang setup, the six-step journey, role/demo accounts, and the shared-database caveat. |

Files heavily rewritten (each enumerates the whole system and cannot survive deletion alone):

| File | Change |
|---|---|
| `src/types/roles.ts` | 29 roles → 6 |
| `src/components/layout/AppShell.tsx` | 847 lines; 7 `*_SECTIONS` tables and a 29-key `navByRole` → 5 nav'd roles |
| `src/app/login/page.tsx` | `ROLE_DASHBOARD` 29 → 5 entries |
| `src/components/StoreHydrator.tsx` | ~55 store hydrations → in-scope only |
| `src/lib/seed-legacy-stores.ts` | Matching prune |
| `src/lib/api/index.ts` | `export *` over 49 modules → in-scope only |
| `messages/{en,hi}/index.ts` | Regenerated by `scripts/i18n-barrel.mjs` after namespace deletion |
| `src/components/landing/PortalLauncher.tsx`, `ModulesBento.tsx` | Umang branding; tiles → 5 portals |

---

### Task 1: Bootstrap the target project

Mirror the source, install dependencies, and prove the **unpruned** copy builds. This is the baseline: every later task is judged against "still builds".

**Files:**
- Create: `E:\Umang Hospital HIMS\` (entire tree)
- Create: `/e/Umang Hospital HIMS/.gitignore` (copied), git repo

**Interfaces:**
- Produces: a target repo on branch `chore/opd-extraction` whose `npm run build` succeeds — the baseline all later tasks preserve.

- [ ] **Step 1: Mirror the source tree, excluding build and VCS artifacts**

Run in PowerShell (robocopy is the reliable Windows mirror; exit codes 0–7 are success, 8+ are failure):

```powershell
$src = "d:\Agentix Project\Gov-HIMS"
$dst = "E:\Umang Hospital HIMS"
robocopy $src $dst /E `
  /XD ".git" ".next" "node_modules" ".vercel" ".playwright-mcp" "design-preview" ".superpowers" ".claude" `
  /XF "tsconfig.tsbuildinfo" "tsconfig.verify.tmp.tsbuildinfo" "Agentix-HIMS-Dossier.docx" `
      "CMO_COCKPIT_BUILD_SPEC.md" "HEALTH_SECRETARY_BUILD_SPEC.md" "PROJECT-OVERVIEW.md" "PRD.md"
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with $LASTEXITCODE" }
Write-Output "robocopy ok ($LASTEXITCODE)"
```

- [ ] **Step 2: Verify the mirror landed and secrets came across**

```bash
cd "/e/Umang Hospital HIMS"
ls -1 && echo "---" && test -f .env.local && echo ".env.local present" && ls supabase/migrations | wc -l
```

Expected: project files listed; `.env.local present`; migration count `61`.

- [ ] **Step 3: Initialise a fresh git repo and branch**

```bash
cd "/e/Umang Hospital HIMS"
git init -q
git add -A
git commit -q -m "chore: seed Umang Hospital HIMS from Gov-HIMS snapshot

Unpruned mirror of the Gov-HIMS source tree, excluding build artifacts,
VCS metadata and Gov-HIMS-specific specification documents. Baseline
commit for the OPD extraction; nothing has been removed yet."
git checkout -q -b chore/opd-extraction
git log --oneline -1
```

- [ ] **Step 4: Install dependencies**

```bash
cd "/e/Umang Hospital HIMS"
npm ci
```

Expected: completes with no `ERESOLVE`. If `npm ci` errors because `package-lock.json` is out of sync, use `npm install` and commit the updated lockfile.

- [ ] **Step 5: Prove the unpruned baseline compiles and builds**

```bash
cd "/e/Umang Hospital HIMS"
npx tsc --noEmit && npm run build
```

Expected: both succeed. **If the build fails here, stop** — the failure is inherited from the source snapshot, not caused by extraction, and must be understood before pruning begins. Do not proceed to Task 2 with a red baseline.

- [ ] **Step 6: Commit**

```bash
cd "/e/Umang Hospital HIMS"
git add -A
git commit -q -m "chore: install dependencies and verify baseline build" --allow-empty
```

---

### Task 2: Port the reachability tool

Everything downstream depends on a repeatable answer to "what is still reachable?". Build that first, encode the approved manifest in it, and make its output the gate.

**Files:**
- Create: `/e/Umang Hospital HIMS/scripts/reachability.mjs`

**Interfaces:**
- Produces: `node scripts/reachability.mjs` prints `REACHABLE`, `DEAD`, per-area breakdowns and unresolved imports; writes `scripts/.reach-keep.txt` and `scripts/.reach-dead.txt`. Exits `0` always (it is a report, not an assertion) except on an unresolved import, where it exits `1`. Tasks 3–12 read its `DEAD` count.
- Consumes: nothing.

- [ ] **Step 1: Create the reachability script**

Create `scripts/reachability.mjs`. `KEEP_ROUTES` **is** the approved manifest — later tasks change this list and nothing else to change scope.

```js
// Walks the '@/' and relative import graph from every kept route entry point and
// reports which files under src/ are reachable. Out-of-scope code that is still
// reachable means a barrel is dragging it in; unreachable code is safe to delete.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')
const slash = (p) => p.split(path.sep).join('/')

const KEEP_ROUTES = [
  'src/app/page.tsx', 'src/app/layout.tsx', 'src/app/globals.css',
  'src/app/actions', 'src/middleware.ts', 'src/i18n',
  'src/app/login', 'src/app/checkin', 'src/app/p', 'src/app/discovery', 'src/app/abha',
  'src/app/billing',
  'src/app/reception/layout.tsx',
  ...['dashboard', 'register', 'opd', 'queue', 'appointments', 'patients', 'journey',
      'billing', 'messages', 'downloads', 'reports', 'setup'].map((s) => `src/app/reception/${s}`),
  'src/app/nurse/layout.tsx',
  ...['dashboard', 'vitals-requests', 'patients', 'tasks', 'messages',
      'ai-assistant'].map((s) => `src/app/nurse/${s}`),
  'src/app/doctor/layout.tsx',
  ...['dashboard', 'consultation', 'records', 'schedule', 'inbox', 'analytics', 'settings',
      'ai-assistant'].map((s) => `src/app/doctor/${s}`),
  'src/app/patient/layout.tsx',
  ...['dashboard', 'appointments', 'queue', 'waiting', 'consultations', 'records',
      'medications', 'orders', 'downloads', 'billing', 'profile', 'settings', 'feedback',
      'followup', 'health-story', 'help', 'ai-care', 'assistant'].map((s) => `src/app/patient/${s}`),
  ...['auth/session', 'ai/complete', 'intake/turn', 'voice/tts', 'opd-register', 'opd-queue',
      'opd-advance', 'opd-order', 'whatsapp/send', 'whatsapp/webhook'].map((s) => `src/app/api/${s}`),
]

const EXT = ['.ts', '.tsx', '.mjs', '.js', '.json', '.css']
const TESTRE = new RegExp('__tests__|[.]test[.]|[.]spec[.]')
const IMPORTRE = new RegExp('(?:from|import|require)\\s*\\(?\\s*[\'"]([^\'"]+)[\'"]', 'g')

const all = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else all.push(slash(p))
  }
})(SRC)

const rel = (f) => slash(f).replace(slash(ROOT) + '/', '')
const isTest = (f) => TESTRE.test(f)

const seeds = all.filter((f) => {
  if (isTest(f)) return false
  const r = rel(f)
  return KEEP_ROUTES.some((k) => r === k || r.startsWith(k + '/'))
})

function resolve(spec, fromFile) {
  let base
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
  else return null
  base = slash(base)
  for (const e of EXT) if (fs.existsSync(base + e)) return base + e
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    for (const e of EXT) if (fs.existsSync(base + '/index' + e)) return base + '/index' + e
    return null
  }
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base
  return null
}

const seen = new Set()
const missing = new Set()
const queue = [...seeds]
while (queue.length) {
  const f = queue.pop()
  if (seen.has(f) || !fs.existsSync(f)) continue
  seen.add(f)
  if (!new RegExp('[.](ts|tsx|mjs|js)$').test(f)) continue
  for (const m of fs.readFileSync(f, 'utf8').matchAll(IMPORTRE)) {
    const s = m[1]
    if (!s.startsWith('@/') && !s.startsWith('.')) continue
    const r = resolve(s, f)
    if (r) queue.push(r)
    else missing.add(rel(f) + '  ->  ' + s)
  }
}

const reached = new Set([...seen].map(rel))
const dead = all.map(rel).filter((r) => !reached.has(r) && !isTest(r))

const bucket = (list) => {
  const m = {}
  for (const r of list) {
    const parts = r.split('/')
    m[parts.length > 3 ? parts.slice(1, 3).join('/') : parts.slice(1).join('/')] =
      (m[parts.length > 3 ? parts.slice(1, 3).join('/') : parts.slice(1).join('/')] || 0) + 1
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1])
}

console.log('SEEDS:    ', seeds.length)
console.log('REACHABLE:', reached.size)
console.log('DEAD:     ', dead.length)
console.log('\n=== DEAD by area ===')
if (dead.length === 0) console.log('  (none)')
for (const [k, v] of bucket(dead)) console.log(String(v).padStart(4), k)
console.log('\n=== UNRESOLVED imports ===')
if (missing.size === 0) console.log('  (none)')
for (const m of missing) console.log('  ' + m)

fs.writeFileSync(path.join(ROOT, 'scripts/.reach-keep.txt'), [...reached].sort().join('\n'))
fs.writeFileSync(path.join(ROOT, 'scripts/.reach-dead.txt'), dead.sort().join('\n'))

if (missing.size > 0) process.exit(1)
```

- [ ] **Step 2: Run it and confirm it reproduces the spec's measured numbers**

```bash
cd "/e/Umang Hospital HIMS"
node scripts/reachability.mjs
```

Expected: `REACHABLE: 456`, `DEAD: 405`, `UNRESOLVED imports: (none)`. The `DEAD by area` list is led by `app/secretary` (30), `app/admin` (26), `app/cmo` (25), `lib/mocks` (19).

If `UNRESOLVED` is non-empty the script exits 1 — fix the resolver before continuing; a false "unreachable" would delete a live file.

- [ ] **Step 3: Ignore the generated report files**

```bash
cd "/e/Umang Hospital HIMS"
printf '\n# reachability report output\nscripts/.reach-keep.txt\nscripts/.reach-dead.txt\n' >> .gitignore
```

- [ ] **Step 4: Commit**

```bash
cd "/e/Umang Hospital HIMS"
git add scripts/reachability.mjs .gitignore
git commit -q -m "chore: add import-graph reachability tool

Encodes the approved OPD route manifest as KEEP_ROUTES and reports which
files under src/ are reachable from it. Baseline on the unpruned tree:
456 reachable, 405 dead, no unresolved imports."
```

---

### Task 3: Delete out-of-scope routes

Remove the 24 excluded portals and the excluded sub-pages of the five kept ones. The build **will** break here — `AppShell` and `login` still reference deleted routes. That is expected and is repaired in Task 4; the two tasks are split because a reviewer can meaningfully reject the route manifest without rejecting the nav rewrite.

**Files:**
- Delete: 27 top-level directories under `src/app/` (24 excluded portals + the consent, journey and family-track utility routes), `src/app/api/admin/`, and named sub-pages of reception / nurse / doctor / patient

**Interfaces:**
- Consumes: nothing.
- Produces: an `src/app/` tree containing only manifest routes.

**Note on the build state.** This task was originally written expecting `tsc --noEmit` to fail here, with Task 4 restoring green. That premise was wrong and is corrected: routes in this codebase are referenced only as **plain string literals** (no `typedRoutes`, no static imports of page modules), so deleting a route produces no type error at all. `tsc` stays green through this task. What deletion actually produces is links that 404 at runtime, which TypeScript cannot see — Task 4's `manifest.test.ts` is the guard for those.

- [ ] **Step 1: Delete the excluded top-level portals**

```bash
cd "/e/Umang Hospital HIMS/src/app"
rm -rf admin admission ambulance audit bloodbank bmw cmo consent cssd dietary \
       discharge emergency family-track feedback housekeeping hr insurance \
       inventory journey lab mortuary ot pharmacy quality radiology secretary \
       vendor-manager api/admin
ls -1
```

Expected remaining: `abha  actions  api  billing  checkin  discovery  doctor  globals.css  layout.tsx  login  nurse  p  page.tsx  patient  reception`.

- [ ] **Step 2: Delete the excluded sub-pages**

```bash
cd "/e/Umang Hospital HIMS/src/app"
rm -rf reception/{beds,tpa,diagnostics,ambulance,referrals}
rm -rf nurse/{fluid-balance,handover,medication,orders,rounds}
rm -rf doctor/{ipd,beds,emergencies,registries,online}
rm -rf patient/{ambulance,blood-bank,discharge,emergency,insurance,ipd,pathology,pharmacy,radiology,teleconsult,family-track}
echo "reception:" && ls -1 reception && echo "nurse:" && ls -1 nurse && echo "doctor:" && ls -1 doctor && echo "patient:" && ls -1 patient
```

Expected — reception: `appointments billing dashboard downloads journey layout.tsx messages opd patients queue register reports setup`; nurse: `ai-assistant dashboard layout.tsx messages patients tasks vitals-requests`; doctor: `ai-assistant analytics consultation dashboard inbox layout.tsx records schedule settings`; patient: 18 entries plus `layout.tsx`, with none of the eleven deleted names.

- [ ] **Step 3: Delete the test suites belonging to deleted modules**

`src/app/api/admin/staff/__tests__/` went with its route in Step 1. Remove the suites that test modules this project no longer ships:

```bash
cd "/e/Umang Hospital HIMS/src"
rm -f lib/api/__tests__/{beds,ipd-stays,ipd-vitals,lab-reflex-suggestions,lab-specimens,lab-tests,narcotics,pharmacy-dispenses,pharmacy-inventory,radiology-studies,shift-handovers,admission-requests}.test.ts
rm -f lib/supabase/__tests__/{ipd-schema,laboratory-schema,pharmacy-schema,radiology-schema}.test.ts
ls lib/api/__tests__ lib/supabase/__tests__ store/__tests__
```

Expected — `lib/api/__tests__`: `appointments core core-fallback nurse-tasks patients profiles visits vitals-readings` (`.test.ts`); `lib/supabase/__tests__`: `admin client doctor-consultation-schema rls schema vitals-readings-schema` (`.test.ts`); `store/__tests__`: `useAuthStore`, `useLabOrdersStore.setRealIds`, and the four `usePatientStore.*` suites.

`useLabOrdersStore.setRealIds.test.ts` is **kept** — order *creation* survives per the order boundary.

- [ ] **Step 4: Confirm the breakage is exactly the expected registry files**

```bash
cd "/e/Umang Hospital HIMS"
npx tsc --noEmit 2>&1 | head -40
```

Expected: **exit 0.** Nothing imports a page module statically, so route deletion breaks no types.

First delete the stale `.next/` build artifact — it holds generated route validators from Task 1's pre-deletion build and will emit hundreds of phantom errors otherwise:

```bash
cd "/e/Umang Hospital HIMS"
rm -rf .next && npx tsc --noEmit; echo "tsc exit: $?"
```

**If any error appears, read it carefully.** An error in a file you expected to keep — a kept page importing a deleted component — means the route manifest is wrong. Record it and raise it rather than fixing it; Task 8's sweep handles genuinely-orphaned files, but a broken kept *page* is a manifest defect.

- [ ] **Step 5: Commit**

```bash
cd "/e/Umang Hospital HIMS"
git add -A
git commit -q -m "refactor: delete out-of-scope routes and their test suites

Removes the 24 excluded portals plus 3 non-portal utility routes (admin, secretary, cmo, lab, radiology,
pharmacy, hr, vendor-manager, insurance, bloodbank, ambulance, audit, bmw,
cssd, dietary, emergency, feedback, inventory, mortuary, ot, quality,
discharge, housekeeping, admission, consent, journey, family-track) and the
excluded sub-pages of the five kept portals, including teleconsult on both
the doctor and patient sides.

tsc stays green: routes are referenced as plain string literals, so deletion
breaks no types. It instead leaves dangling links that 404 at runtime, in
AppShell, CommandPalette, login and several kept pages. Task 4 repairs them
and adds the test that catches them, since TypeScript cannot."
```

---

### Task 4: Shrink the role system to six roles

Rewrite the three files that enumerate every role, and restore a green build.

**Files:**
- Modify: `src/types/roles.ts` (whole file)
- Modify: `src/components/layout/AppShell.tsx` (delete `PHARMACY_SECTIONS`, `RADIOLOGY_SECTIONS`, `CMO_SECTIONS`, `SECRETARY_SECTIONS`; rewrite `navByRole`, `ROLE_LABELS`, `sectionsByRole`; prune `PATIENT_SECTIONS`, `RECEPTION_SECTIONS`, `DOCTOR_SECTIONS` entries pointing at deleted routes)
- Modify: `src/app/login/page.tsx:12-42` (`ROLE_DASHBOARD`)
- Modify: `src/components/layout/CommandPalette.tsx` — 24 of its 29 route entries point at deleted portals
- Modify: `src/app/doctor/consultation/page.tsx`, `src/app/doctor/dashboard/page.tsx` (→ `/doctor/beds`), `src/app/reception/dashboard/page.tsx` (→ `/reception/beds`), `src/app/patient/consultations/page.tsx` (→ `/patient/teleconsult`), `src/app/patient/followup/page.tsx` (→ `/patient/pharmacy`), `src/components/clinical/CriticalValueBanner.tsx` (→ `/audit/log`), `src/components/patient/dashboard/LiveVisitStatusCard.tsx`, `src/components/patient/dashboard/QuickActionsDrawer.tsx` (→ `/patient/teleconsult`)
- Create: `src/__tests__/manifest.test.ts`

**Why this task covers more than the two registry files.** Task 3 was expected to leave the build red, and it did not: `tsc --noEmit` exits 0 after the route deletions, because **routes are referenced as plain string literals everywhere** — no `typedRoutes`, no static imports of page modules. Deleting a route therefore produces no compile error at all; it produces a link that 404s at runtime. TypeScript cannot catch any of this, so `manifest.test.ts` is the only guard, and it must scan every kept file rather than just `AppShell` and `login`.

**Interfaces:**
- Consumes: the pruned `src/app/` tree from Task 3.
- Produces: `ALL_ROLES` as a 6-element `readonly` tuple exported from `@/src/types/roles`, with `type Role = (typeof ALL_ROLES)[number]`. `useAuthStore` re-exports `Role`; `RoleGuard` accepts `Role | Role[]` — neither signature changes.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ALL_ROLES } from '@/types/roles'

const APP = path.join(process.cwd(), 'src/app')

const EXPECTED_ROLES = ['doctor', 'nurse', 'reception', 'billing', 'admin', 'patient']

// Every route this project actually ships, as segment arrays. A '[param]'
// segment matches any single literal segment; '(group)' segments are routing-
// only and do not appear in URLs.
const shippedRoutes = (): string[][] => {
  const out: string[][] = []
  const walk = (dir: string, segs: string[]) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const next = e.name.startsWith('(') ? segs : [...segs, e.name]
      const d = path.join(dir, e.name)
      if (fs.existsSync(path.join(d, 'page.tsx')) || fs.existsSync(path.join(d, 'route.ts'))) {
        out.push(next)
      }
      walk(d, next)
    }
  }
  if (fs.existsSync(path.join(APP, 'page.tsx'))) out.push([])
  walk(APP, [])
  return out
}

const routeMatches = (route: string[], link: string): boolean => {
  const segs = link.split('/').filter(Boolean)
  if (segs.length !== route.length) return false
  return route.every((r, i) => (r.startsWith('[') ? true : r === segs[i]))
}

// Internal links, read only from contexts that actually navigate. Narrow on
// purpose: a broad scan for any '/foo' string produces false positives from
// class names, asset paths and API URLs.
const internalLinks = (src: string): string[] => {
  const pats = [
    /href=["'](\/[a-z0-9/[\]-]*)["']/g,
    /href:\s*["'](\/[a-z0-9/[\]-]*)["']/g,
    /router\.(?:push|replace|prefetch)\(\s*["'](\/[a-z0-9/[\]-]*)["']/g,
    /redirect\(\s*["'](\/[a-z0-9/[\]-]*)["']/g,
  ]
  const found = new Set<string>()
  for (const p of pats) for (const m of src.matchAll(p)) found.add(m[1])
  return [...found].filter((l) => l !== '/' && !l.startsWith('/api/'))
}

const sourceFiles = (dir = path.join(process.cwd(), 'src'), out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) sourceFiles(p, out)
    else if (/\.tsx?$/.test(e.name) && !p.includes('__tests__')) out.push(p)
  }
  return out
}
const REMOVED_PORTALS = [
  'admin', 'admission', 'ambulance', 'audit', 'bloodbank', 'bmw', 'cmo', 'consent',
  'cssd', 'dietary', 'discharge', 'emergency', 'family-track', 'feedback',
  'housekeeping', 'hr', 'insurance', 'inventory', 'lab', 'mortuary',
  'ot', 'pharmacy', 'quality', 'radiology', 'secretary', 'vendor-manager',
]

describe('role manifest', () => {
  it('ships exactly the six approved roles', () => {
    expect([...ALL_ROLES].sort()).toEqual([...EXPECTED_ROLES].sort())
  })
})

describe('route manifest', () => {
  it('has no directory for any removed portal', () => {
    const present = REMOVED_PORTALS.filter((p) => fs.existsSync(path.join(APP, p)))
    expect(present).toEqual([])
  })

  it('ships no teleconsult route on either side', () => {
    expect(fs.existsSync(path.join(APP, 'doctor/online'))).toBe(false)
    expect(fs.existsSync(path.join(APP, 'patient/teleconsult'))).toBe(false)
  })

  it('has no internal link anywhere that points at a route this project does not ship', () => {
    const routes = shippedRoutes()
    expect(routes.length).toBeGreaterThan(10)

    const broken: string[] = []
    for (const file of sourceFiles()) {
      const src = fs.readFileSync(file, 'utf8')
      for (const link of internalLinks(src)) {
        if (!routes.some((r) => routeMatches(r, link))) {
          broken.push(`${path.relative(process.cwd(), file)} -> ${link}`)
        }
      }
    }
    expect(broken).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "/e/Umang Hospital HIMS"
npx vitest run src/__tests__/manifest.test.ts
```

Expected: FAIL — `ships exactly the six approved roles` reports 29 received, and both href tests list deleted routes.

- [ ] **Step 3: Rewrite the role list**

Replace the entire contents of `src/types/roles.ts`:

```ts
// Umang Hospital HIMS ships five portals. `admin` carries no portal of its own —
// it is the account type used to run seeds and ops scripts, and it stays in the
// enum because the shared Supabase project's profiles.role column and RLS
// policies already recognise it.
export const ALL_ROLES = [
  'doctor',
  'nurse',
  'reception',
  'billing',
  'admin',
  'patient',
] as const

export type Role = (typeof ALL_ROLES)[number]
```

- [ ] **Step 4: Rewrite the login redirect map**

In `src/app/login/page.tsx`, replace the whole `ROLE_DASHBOARD` object (currently lines 12–42) with:

```ts
// Every portal's post-login landing route, keyed by the account's real role
// (profiles.role). Mirrors the hrefs advertised in PortalLauncher. `admin` has
// no portal and is deliberately absent — an admin sign-in falls through to the
// default below.
const ROLE_DASHBOARD: Record<string, string> = {
  doctor: "/doctor/dashboard",
  nurse: "/nurse/dashboard",
  reception: "/reception/dashboard",
  billing: "/billing/dashboard",
  patient: "/patient/dashboard",
}
```

- [ ] **Step 5: Rewrite the AppShell nav tables**

In `src/components/layout/AppShell.tsx`:

1. Delete the constants `PHARMACY_SECTIONS` (line ~118), `RADIOLOGY_SECTIONS` (~134), `CMO_SECTIONS` (~159) and `SECRETARY_SECTIONS` (~204) entirely.
2. From `PATIENT_SECTIONS`, remove the items whose `href` is `/patient/emergency`, `/patient/ipd`, `/patient/discharge`, `/patient/pharmacy`, `/patient/pathology`, `/patient/radiology`, `/patient/blood-bank`, `/patient/ambulance`, `/patient/insurance`. Delete any `{ header, items: [] }` group left empty.
3. From `RECEPTION_SECTIONS`, remove the items for `/reception/beds`, `/reception/tpa`, `/reception/diagnostics`, `/reception/ambulance`, `/reception/referrals`. Delete any group left empty.
4. From `DOCTOR_SECTIONS`, remove the items for `/doctor/online`, `/doctor/ipd`, `/doctor/emergencies`, `/doctor/beds`, `/doctor/registries`. Delete any group left empty.
5. Replace the whole `navByRole` object (lines ~257–421) with:

```ts
const navByRole: Record<Role, NavItem[]> = {
  patient: PATIENT_SECTIONS.flatMap(s => s.items),
  doctor: DOCTOR_SECTIONS.flatMap(s => s.items),
  reception: RECEPTION_SECTIONS.flatMap(s => s.items),
  nurse: [
    { href: '/nurse/dashboard',       label: 'item.nurse_dashboard',       icon: LayoutDashboard },
    { href: '/nurse/vitals-requests', label: 'item.nurse_vitals_requests', icon: HeartPulse },
    { href: '/nurse/patients',        label: 'item.nurse_patients',        icon: Users },
    { href: '/nurse/tasks',           label: 'item.nurse_tasks',           icon: ClipboardList },
    { href: '/nurse/ai-assistant',    label: 'item.nurse_ai_assistant',    icon: Sparkles },
    { href: '/nurse/messages',        label: 'item.nurse_messages',        icon: MessageSquare },
  ],
  billing: [
    { href: '/billing/dashboard', label: 'item.billing_dashboard', icon: CreditCard },
    { href: '/billing/packages',  label: 'item.billing_packages',  icon: Package },
    { href: '/billing/refunds',   label: 'item.billing_refunds',   icon: Receipt },
    { href: '/billing/discounts', label: 'item.billing_discounts', icon: Heart },
  ],
  // `admin` ships no portal — see src/types/roles.ts.
  admin: [],
}
```

6. Replace `ROLE_LABELS` (lines ~425–438) with:

```ts
const ROLE_LABELS: Record<Role, string> = {
  patient:   'role.patient',
  doctor:    'role.doctor',
  reception: 'role.reception',
  nurse:     'role.nurse',
  billing:   'role.billing',
  admin:     'role.admin',
}
```

7. Replace `sectionsByRole` (lines ~440–449) with:

```ts
// Roles whose sidebar is rendered as grouped sections (with headers) instead of a flat list.
const sectionsByRole: Partial<Record<Role, { header: string; items: NavItem[] }[]>> = {
  patient: PATIENT_SECTIONS,
  reception: RECEPTION_SECTIONS,
  doctor: DOCTOR_SECTIONS,
}
```

8. Remove now-unused `lucide-react` icon imports from the import block ending at line ~17. Do not guess — let `npm run lint` in Step 7 name them.

- [ ] **Step 5b: Repair every other dangling internal link**

`tsc` cannot help here — routes are string literals — so the test from Step 1 is your worklist. Run it and fix what it names.

`src/components/layout/CommandPalette.tsx` is the largest: 24 of its 29 route entries point at deleted portals. Delete those command entries; keep the five that still resolve (`/billing/refunds`, `/checkin`, `/doctor/dashboard`, `/reception/appointments`, `/reception/opd`) and add entries for the shipped routes a user would want to jump to.

The rest are individual links in kept files. For each, the fix is to **remove the link and the UI affordance that offers it** — a button that navigates nowhere is worse than no button:

| File | Dangling target |
|---|---|
| `src/app/doctor/consultation/page.tsx` | `/doctor/beds` |
| `src/app/doctor/dashboard/page.tsx` | `/doctor/beds` |
| `src/app/reception/dashboard/page.tsx` | `/reception/beds` |
| `src/app/patient/consultations/page.tsx` | `/patient/teleconsult` |
| `src/app/patient/followup/page.tsx` | `/patient/pharmacy` |
| `src/components/clinical/CriticalValueBanner.tsx` | `/audit/log` |
| `src/components/patient/dashboard/LiveVisitStatusCard.tsx` | `/patient/teleconsult` |
| `src/components/patient/dashboard/QuickActionsDrawer.tsx` | `/patient/teleconsult` |

Files the reachability report already lists as dead (`components/admin/*`, `components/insurance/LiveCashlessMonitor.tsx`, `components/clinical/EarlyWarningBanner.tsx`, `components/patient/dashboard/{LiveJourneyCard,QuickActions}.tsx`) are **not** your problem — Task 8 deletes them wholesale. Do not edit them.

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd "/e/Umang Hospital HIMS"
npx vitest run src/__tests__/manifest.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 7: Restore a green build**

```bash
cd "/e/Umang Hospital HIMS"
npx tsc --noEmit; echo "tsc: $?"
npm run lint 2>&1 | tail -3   # <= 602 problems, no new rule violated
```

Fix each remaining error. Expect two shapes: unused icon imports in `AppShell.tsx` (delete them), and files importing modules deleted in Task 3 — for a **kept page**, that import must be removed and its UI adjusted; for an out-of-scope component, leave it, Task 8 deletes the file wholesale.

- [ ] **Step 8: Commit**

```bash
cd "/e/Umang Hospital HIMS"
git add -A
git commit -q -m "refactor: reduce the role system from 29 roles to 6

ALL_ROLES becomes doctor/nurse/reception/billing/admin/patient. AppShell
drops the pharmacy, radiology, cmo and secretary section tables and its
29-key navByRole; login's ROLE_DASHBOARD keeps five portal targets. admin
ships no nav and no route — it stays in the enum only because the shared
Supabase profiles.role column and RLS policies recognise it.

Adds src/__tests__/manifest.test.ts, which fails if any nav href or login
redirect points at a route this project no longer ships."
```

---

### Task 5: Prune the StoreHydrator barrel

`StoreHydrator` mounts in the **root layout** and hydrates ~55 stores. Until it is cut, every store in the system is reachable from every page, and Task 8's sweep would delete almost nothing.

**Files:**
- Modify: `src/components/StoreHydrator.tsx`
- Modify: `src/lib/seed-legacy-stores.ts`

**Interfaces:**
- Consumes: the six-role system from Task 4.
- Produces: `StoreHydrator` hydrating only in-scope stores. Its export signature (`export function StoreHydrator(): null`) and its mount site in `src/app/layout.tsx` are unchanged.

- [ ] **Step 1: Record the baseline dead count**

```bash
cd "/e/Umang Hospital HIMS"
node scripts/reachability.mjs | head -3
```

Note the `DEAD` number — it must rise after this task. If it does not, the barrel was not actually cut.

- [ ] **Step 2: Derive the keep-list from real importers**

**Do not use a hand-written keep-list.** `StoreHydrator` mounts in the root layout, so any store named in it is reachable *by definition* — a guessed list would silently immunise dead stores against Task 8's sweep, defeating the point of this task.

Derive it instead. For each store the hydrator currently imports, ask whether anything **other than the hydrator and `seed-legacy-stores`** imports it:

```bash
cd "/e/Umang Hospital HIMS"
for f in src/store/use*.ts; do
  s=$(basename "$f" .ts)
  n=$(grep -rl "$s" src --include=*.tsx --include=*.ts \
        | grep -vE "store/$s\.ts|StoreHydrator\.tsx|seed-legacy-stores\.ts|__tests__" | wc -l)
  printf '%3d  %s\n' "$n" "$s"
done | sort -n
```

Stores reporting `0` have no consumer left after Task 3 — delete their imports and calls from the hydrator. Stores reporting `1` or more stay.

**`useAuthStore` stays regardless of what the count says** — `RoleGuard` gates on `useAuthStore.persist.hasHydrated()`, so it must be hydrated even if the grep undercounts it.

- [ ] **Step 3: Prune the hydrator to the derived list**

Delete each zero-count store's `import` and its corresponding `.persist.rehydrate()` / `syncStoreAcrossTabs(...)` / realtime-subscription call. Expect roughly 26 stores to go — the operational ones with no portal left: `useBMWStore`, `useCSSDStore`, `useDietaryStore`, `useMortuaryStore`, `useBloodBankStore`, `useAmbulanceStore`, `useOTStore`, `useHousekeepingStore`, `useInventoryStore`, `useNarcoticsStore`, `useLabQCStore`, `useVendorStore`, `useVendorManagerStore`, `useStatutoryStore`, `useQualityStore`, `useHRStore`, `useHrmsStore`, `useWardStore`, `usePharmacyInventoryStore` and the rest of the zero-count set. **The grep is authoritative — if one of these reports a non-zero count, keep it and note which kept file imports it.**

**Do not delete the hydration mechanism itself.** The `skipHydration: true` + explicit `rehydrate()` pattern is load-bearing: `RoleGuard` gates on `useAuthStore.persist.hasHydrated()`, and removing the rehydrate call would leave every role-gated page spinning forever.

- [ ] **Step 4: Apply the identical prune to the seed module**

Apply the same keep/delete lists to `src/lib/seed-legacy-stores.ts`, removing each deleted store's import and its seeding block. Keep the module's exported function name and signature unchanged so `StoreHydrator`'s call site does not move.

- [ ] **Step 5: Verify the build is still green and the dead set grew**

```bash
cd "/e/Umang Hospital HIMS"
npx tsc --noEmit && node scripts/reachability.mjs | head -3
```

Expected: `tsc` passes; `DEAD` is materially higher than Step 1 — the ~26 unhydrated stores and their dependencies are now orphaned.

- [ ] **Step 6: Commit**

```bash
cd "/e/Umang Hospital HIMS"
git add src/components/StoreHydrator.tsx src/lib/seed-legacy-stores.ts
git commit -q -m "refactor: prune StoreHydrator to in-scope stores

StoreHydrator mounts in the root layout and hydrated ~55 stores, which made
every module in the system reachable from every page. Cuts it to the 26
stores the OPD journey actually uses, and applies the same prune to
seed-legacy-stores.

Keeps the skipHydration + explicit rehydrate() mechanism intact: RoleGuard
gates on useAuthStore.persist.hasHydrated(), so dropping it would leave every
role-gated page spinning forever."
```

---

### Task 6: Prune the lib/api barrel

`src/lib/api/index.ts` re-exports all 49 API modules with `export *`, so importing one pulls all.

**Files:**
- Modify: `src/lib/api/index.ts`

**Interfaces:**
- Consumes: Task 5's pruned hydrator.
- Produces: `@/lib/api` exporting only in-scope namespaces. Every retained export keeps its exact current name — `Patients`, `Visits`, `Appointments`, `VitalsReadings`, `Encounters`, `Prescriptions`, `Orders`, `Bills`, `Audit`, `Notifications`, `Profiles`, `Staff`, `Consent`, `Feedback`, `DrugMaster`, `NurseTasks`, `LabTests`, `RadiologyStudies` — so no consumer import changes.

- [ ] **Step 1: List what the kept code actually imports from the barrel**

```bash
cd "/e/Umang Hospital HIMS"
grep -rhoE "from ['\"]@/lib/api['\"]" src --include=*.ts --include=*.tsx | wc -l
grep -rhB2 "from ['\"]@/lib/api['\"]" src --include=*.ts --include=*.tsx \
  | grep -oE "\{[^}]*\}" | tr -d '{}' | tr ',' '\n' | sed 's/ //g' | grep -v '^$' | sort -u
```

Record this list — it is the ground truth for what the barrel must still export.

- [ ] **Step 2: Rewrite the barrel**

Edit `src/lib/api/index.ts`. Keep the file header comment and `export * from './_core'`. Keep only the named `export { ... } from './<module>'` lines whose symbols appear in Step 1's list, plus the Zod schemas exported alongside them. Delete the rest.

Delete outright the re-exports for: `ap-invoices`, `ambulance`, `beds`, `bloodbank`, `bmw`, `cssd`, `dietary`, `discharge`, `emergency`, `housekeeping`, `hr`, `insurance`, `inventory`, `ipd-stays`, `ipd-vitals`, `lab-reflex-suggestions`, `lab-specimens`, `mortuary`, `narcotics`, `ot`, `pharmacy-dispenses`, `pharmacy-inventory`, `quality`, `shift-handovers`, `statutory`, `vendor`, `ward`, `admission-requests`.

If Step 1's list contains a symbol from a module named for deletion, **keep that module** and note it in the commit message — the manifest missed a real dependency.

- [ ] **Step 3: Verify**

```bash
cd "/e/Umang Hospital HIMS"
npx tsc --noEmit; echo "tsc: $?"
npx vitest run src/__tests__/manifest.test.ts src/lib/__tests__/opd-doctors.test.ts src/lib/api/__tests__/core-fallback.test.ts src/lib/intake/__tests__/register.test.ts src/lib/supabase/__tests__/client.test.ts src/store/__tests__/useLabOrdersStore.setRealIds.test.ts   # the 6 hermetic suites: must be green
node scripts/reachability.mjs | head -3
```

Expected: `tsc` passes, tests pass, `DEAD` rises again.

- [ ] **Step 4: Commit**

```bash
cd "/e/Umang Hospital HIMS"
git add src/lib/api/index.ts
git commit -q -m "refactor: prune the lib/api barrel to in-scope modules

The barrel re-exported all 49 lib/api modules with 'export *', so importing
one pulled the whole data layer. Reduced to the namespaces the OPD journey
imports; every retained export keeps its current name, so no consumer changes."
```

---

### Task 7: Prune i18n namespaces and regenerate the barrels

`messages/{en,hi}/index.ts` import all 46 locale namespaces. They are auto-generated, so the fix is delete-then-regenerate.

**Files:**
- Delete: 30 namespace JSON files from each of `messages/en/` and `messages/hi/`
- Regenerate: `messages/en/index.ts`, `messages/hi/index.ts` (via `scripts/i18n-barrel.mjs`)
- Create: `src/__tests__/i18n-namespaces.test.ts`

**Interfaces:**
- Consumes: Task 6's pruned data layer.
- Produces: both locale barrels exporting the same 16 namespaces — `abha`, `checkin`, `discovery`, `doctor`, `intake`, `journey`, `labs`, `landing`, `nav`, `notify`, `nurse`, `orderSets`, `p`, `patient`, `reception`, `ui`. `src/i18n/request.ts` is unchanged.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/i18n-namespaces.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const KEPT = [
  'abha', 'checkin', 'discovery', 'doctor', 'intake', 'journey', 'labs', 'landing',
  'nav', 'notify', 'nurse', 'orderSets', 'p', 'patient', 'reception', 'ui',
]

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e.name) && !p.includes('__tests__')) out.push(p)
  }
  return out
}

const usedNamespaces = () => {
  const found = new Set<string>()
  for (const f of walk(path.join(ROOT, 'src'))) {
    const src = fs.readFileSync(f, 'utf8')
    for (const m of src.matchAll(/(?:useTranslations|getTranslations)\(\s*['"]([^'".]+)/g)) {
      found.add(m[1])
    }
  }
  return [...found].sort()
}

describe('i18n namespaces', () => {
  for (const locale of ['en', 'hi']) {
    it(`${locale} ships exactly the kept namespaces as JSON files`, () => {
      const files = fs.readdirSync(path.join(ROOT, 'messages', locale))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''))
        .sort()
      expect(files).toEqual([...KEPT].sort())
    })
  }

  it('every namespace the code asks for exists in both locales', () => {
    const used = usedNamespaces()
    expect(used.length).toBeGreaterThan(0)
    for (const locale of ['en', 'hi']) {
      const missing = used.filter(
        (ns) => !fs.existsSync(path.join(ROOT, 'messages', locale, `${ns}.json`)))
      expect({ locale, missing }).toEqual({ locale, missing: [] })
    }
  })

  it('ships no namespace the code never asks for', () => {
    const used = new Set(usedNamespaces())
    expect(KEPT.filter((ns) => !used.has(ns))).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "/e/Umang Hospital HIMS"
npx vitest run src/__tests__/i18n-namespaces.test.ts
```

Expected: FAIL — 46 namespace files found where 16 were expected.

- [ ] **Step 3: Delete the out-of-scope namespaces from both locales**

```bash
cd "/e/Umang Hospital HIMS/messages"
for loc in en hi; do
  (cd "$loc" && rm -f admin.json admission.json ai.json ambulance.json audit.json \
    billing.json bloodbank.json bmw.json cmo.json common.json consent.json cssd.json \
    dietary.json discharge.json emergency.json family-track.json feedback.json \
    housekeeping.json hr.json insurance.json inventory.json lab.json \
    mortuary.json ot.json pharmacy.json quality.json radiology.json roles.json \
    secretary.json vendor-manager.json)
done
ls -1 en/*.json | wc -l && ls -1 hi/*.json | wc -l
```

Expected: `16` and `16`.

Note `nav.json` is **kept** — it holds the `item.*`, `section.*` **and** `role.*` keys `AppShell` reads via `useTranslations('nav')`. `roles.json` is a separate, unreferenced namespace and is deleted.

- [ ] **Step 4: Regenerate both barrels**

```bash
cd "/e/Umang Hospital HIMS"
node scripts/i18n-barrel.mjs
head -5 messages/en/index.ts && grep -c "^  \"" messages/en/index.ts
```

Expected: the `AUTO-GENERATED` header, and `16` keys.

If `scripts/i18n-barrel.mjs` hardcodes a namespace list rather than reading the directory, update that list to the 16 kept names before rerunning.

- [ ] **Step 5: Verify**

```bash
cd "/e/Umang Hospital HIMS"
npx vitest run src/__tests__/i18n-namespaces.test.ts
npx tsc --noEmit; echo "tsc: $?"
npm run build; echo "build: $?"
```

Expected: 4 tests pass; `tsc` and `build` succeed.

A `MISSING_MESSAGE` error at runtime means a kept page reads a deleted namespace — restore that namespace file, add it to `KEPT`, and rerun.

- [ ] **Step 6: Commit**

```bash
cd "/e/Umang Hospital HIMS"
git add -A
git commit -q -m "refactor: prune i18n to the 16 in-scope namespaces

Deletes 30 out-of-scope namespace files from both en and hi and regenerates
the auto-generated barrels, which previously imported all 46 and so made the
whole message catalogue reachable.

nav.json is kept — it carries the role.* keys AppShell reads alongside item.*
and section.*; the separate roles.json namespace had no readers and is gone.

Adds a test that fails if the code asks for a namespace neither locale ships,
or ships one nothing asks for."
```

---

### Task 8: Sweep to a reachability fixpoint

With all three barrels cut, orphaned files can finally be identified. Delete them, re-run, repeat until nothing is dead.

**Files:**
- Delete: every file listed in `scripts/.reach-dead.txt`, iteratively

**Interfaces:**
- Consumes: Tasks 5–7's barrel prunes.
- Produces: `node scripts/reachability.mjs` reporting `DEAD: 0`.

- [ ] **Step 1: Review the dead list before deleting anything**

```bash
cd "/e/Umang Hospital HIMS"
node scripts/reachability.mjs
cat scripts/.reach-dead.txt
```

Read the list. Expect `src/rules-engine/` (all 7 modules), `src/lib/mocks/`, `src/ai-services/index.ts`, `src/lib/permissions.ts`, `src/services/notification-dispatcher.ts`, `src/types/{index,cmo,secretary}.ts`, `src/data/cooKpis.ts`, the cmo/secretary stores, and the out-of-scope component directories.

**If a file you believe the OPD journey needs appears here, stop and investigate** before deleting — an over-aggressive barrel prune in Task 5 or 6 is the likely cause.

- [ ] **Step 2: Delete one pass**

```bash
cd "/e/Umang Hospital HIMS"
xargs -a scripts/.reach-dead.txt -d '\n' rm -f
node scripts/reachability.mjs | head -3
```

- [ ] **Step 3: Repeat until the dead set is empty**

Re-run Steps 1–2 until `DEAD: 0`. Each pass orphans the previous pass's dependencies, so expect three to five passes. Remove directories left empty:

```bash
cd "/e/Umang Hospital HIMS"
find src -type d -empty -delete
node scripts/reachability.mjs | head -3
```

Expected final: `DEAD: 0`, `UNRESOLVED imports: (none)`.

- [ ] **Step 4: Verify the application still compiles, builds, lints and tests**

```bash
cd "/e/Umang Hospital HIMS"
rm -rf .next
npx tsc --noEmit; echo "tsc: $?"
npm run build; echo "build: $?"
node scripts/reachability.mjs | head -3
npm run lint 2>&1 | tail -3      # <= 602 problems, no new rule violated
npx vitest run src/__tests__/manifest.test.ts src/lib/__tests__/opd-doctors.test.ts src/lib/api/__tests__/core-fallback.test.ts src/lib/intake/__tests__/register.test.ts src/lib/supabase/__tests__/client.test.ts src/store/__tests__/useLabOrdersStore.setRealIds.test.ts   # the 6 hermetic suites: must be green
```

Expected: all four pass.

- [ ] **Step 5: Commit**

```bash
cd "/e/Umang Hospital HIMS"
git add -A
git commit -q -m "refactor: delete orphaned modules to a reachability fixpoint

Iteratively removes every file unreachable from a manifest route entry point
until the dead set is empty. Only possible after the three barrels were cut;
before that, every module looked reachable from every page.

Includes src/rules-engine/ in full — allergy-block, drug-interactions,
dosage-bounds, critical-values, triage-thresholds, billing-math and ot-gate
were reachable in Gov-HIMS only from components/lab/LabAnomalyPanel.tsx and
were never wired into the doctor's consultation. Re-wiring allergy and
interaction checking into the Umang prescription pad is recommended follow-up,
tracked in the spec, deliberately outside this extraction."
```

---

### Task 9: Trim the order stores to write-side only

The order boundary decision, applied in code: creation survives, fulfilment does not.

**Files:**
- Modify: `src/store/usePharmacyStore.ts`, `src/store/useLabOrdersStore.ts`, `src/store/useRadiologyStudiesStore.ts`
- Modify: `src/lib/orders.ts`, `src/lib/cross-device-orders.ts` (only if they expose fulfilment transitions)
- Create: `src/__tests__/order-boundary.test.ts`

**Interfaces:**
- Consumes: Task 8's pruned tree.
- Produces: each store retaining its create action and its read selectors, with fulfilment actions removed. Every action name the doctor's consultation and the patient/reception read paths already call is unchanged.

- [ ] **Step 1: Inventory what each store still exposes and who calls it**

```bash
cd "/e/Umang Hospital HIMS"
for s in usePharmacyStore useLabOrdersStore useRadiologyStudiesStore; do
  echo "===== $s ====="
  grep -nE "^\s{2}[a-zA-Z][a-zA-Z0-9]*\s*:" "src/store/$s.ts"
  echo "--- callers ---"
  grep -rln "$s" src --include=*.tsx --include=*.ts | grep -v "store/$s.ts"
done
```

**Write the resulting keep/delete decision down per store before editing anything.** The caller list is authoritative: if a kept page invokes an action, it stays regardless of what its name suggests. Anything with no kept caller and a fulfilment purpose goes.

- [ ] **Step 2: Write the failing test**

Create `src/__tests__/order-boundary.test.ts`. It pins the decision so a later edit cannot quietly reintroduce fulfilment:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const STORES = ['usePharmacyStore', 'useLabOrdersStore', 'useRadiologyStudiesStore']

// Action-name stems that advance an order past 'ordered'. This project creates
// orders and never fulfils them — no portal here could act on these.
const FULFILMENT = [
  'dispense', 'collectSpecimen', 'accession', 'enterResult', 'recordResult',
  'verifyResult', 'approveResult', 'runQC', 'recordQC', 'triggerReflex',
  'scheduleScan', 'recordAcquisition', 'startReading', 'authorReport',
  'publishReport', 'distributeReport', 'decrementStock',
]

const actionNames = (file: string): string[] => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/store', `${file}.ts`), 'utf8')
  return [...src.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)\s*:/gm)].map((m) => m[1])
}

describe('order boundary', () => {
  for (const store of STORES) {
    it(`${store} exposes no fulfilment action`, () => {
      const names = actionNames(store)
      expect(names.length).toBeGreaterThan(0)
      const offenders = names.filter((n) =>
        FULFILMENT.some((f) => n.toLowerCase().startsWith(f.toLowerCase())))
      expect(offenders).toEqual([])
    })

    it(`${store} still exposes at least one create action`, () => {
      const names = actionNames(store)
      expect(names.some((n) => /^(add|create|order|place|prescribe)/i.test(n))).toBe(true)
    })
  }
})
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd "/e/Umang Hospital HIMS"
npx vitest run src/__tests__/order-boundary.test.ts
```

Expected: FAIL — each store's `exposes no fulfilment action` case lists its dispensing / result-entry / reporting actions.

If a store passes already, widen `FULFILMENT` with the actual action names Step 1 found for it before continuing; a green test here would mean the test is not pinning anything.

- [ ] **Step 4: Delete the fulfilment actions**

Remove the offending actions the test named, together with any state slices only those actions write. Keep the create action, the status read selectors, and every action a kept caller from Step 1 invokes.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd "/e/Umang Hospital HIMS"
npx vitest run src/__tests__/order-boundary.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Verify nothing kept was calling what you removed**

```bash
cd "/e/Umang Hospital HIMS"
npx tsc --noEmit; echo "tsc: $?"
npx vitest run src/__tests__/manifest.test.ts src/lib/__tests__/opd-doctors.test.ts src/lib/api/__tests__/core-fallback.test.ts src/lib/intake/__tests__/register.test.ts src/lib/supabase/__tests__/client.test.ts src/store/__tests__/useLabOrdersStore.setRealIds.test.ts   # the 6 hermetic suites: must be green
node scripts/reachability.mjs | head -3
```

Expected: `tsc` passes (a failure names the kept caller of a removed action — restore it), tests pass including `useLabOrdersStore.setRealIds.test.ts`, `DEAD` is 0 or reveals newly-orphaned fulfilment helpers.

- [ ] **Step 7: Delete any newly-orphaned helpers**

If Step 6 reported `DEAD > 0`, repeat Task 8 Steps 2–3 until `DEAD: 0`, then re-run `npx tsc --noEmit && npm run build`.

- [ ] **Step 8: Commit**

```bash
cd "/e/Umang Hospital HIMS"
git add -A
git commit -q -m "refactor: reduce pharmacy, lab and radiology stores to order creation

The doctor's consultation creates prescriptions and lab/imaging orders; no
portal in this project fulfils them. Removes dispensing, specimen handling,
result entry, verification, QC, reflex, scheduling, reading, reporting and
distribution, keeping the create actions and the status selectors that
patient and reception views read.

Orders therefore terminate at 'ordered', which is the intended end state.
src/__tests__/order-boundary.test.ts pins that so a later edit cannot
quietly reintroduce fulfilment."
```

---

### Task 10: Rebrand the landing page for Umang Hospital

**Files:**
- Modify: `src/components/landing/PortalLauncher.tsx`, `ModulesBento.tsx`, `LandingNav.tsx`, `LandingFooter.tsx`, `LandingHero.tsx`
- Modify: `messages/en/landing.json`, `messages/hi/landing.json`
- Modify: `src/app/layout.tsx` (metadata)

**Interfaces:**
- Consumes: Task 9's pruned stores.
- Produces: a landing page offering exactly five portals. `src/app/page.tsx`'s section composition is unchanged.

- [ ] **Step 1: Reduce the portal launcher to five portals**

In `src/components/landing/PortalLauncher.tsx`, keep only the cards for Patient (`/login?role=patient`), Reception (`/login?role=reception`), Nurse (`/login?role=nurse`), Doctor (`/login?role=doctor`) and Billing (`/login?role=billing`). Delete every other card and any now-unused icon import.

- [ ] **Step 2: Reduce the module tiles**

In `src/components/landing/ModulesBento.tsx`, keep only tiles describing the shipped modules — registration and OPD, reception and queueing, nursing and vitals, doctor consultation, patient portal, billing. Delete tiles for lab, pharmacy, radiology, IPD, OT, blood bank, ambulance, insurance, HR, inventory and the government cockpits.

- [ ] **Step 3: Rebrand copy and metadata**

Swap "Agentix HIMS" / government framing for Umang Hospital in `LandingNav.tsx`, `LandingFooter.tsx`, `LandingHero.tsx` and the `landing` namespace of **both** `messages/en/landing.json` and `messages/hi/landing.json`. The two locale files must stay key-for-key identical: next-intl resolves each key against the active locale, so a key added to `en` alone throws `MISSING_MESSAGE` for every Hindi visitor. Task 7's test does **not** catch this — it checks which namespace *files* exist, not their keys — so the parity is yours to maintain by hand. Point the logo at the existing `public/Umang-logo.webp`.

Update the `metadata` export in `src/app/layout.tsx`:

```ts
export const metadata: Metadata = {
  title: "Umang Hospital HIMS",
  description: "Hospital information management for the Umang Hospital OPD journey — registration, reception, nursing, consultation and billing.",
}
```

- [ ] **Step 4: Verify**

```bash
cd "/e/Umang Hospital HIMS"
npx tsc --noEmit; echo "tsc: $?"
npm run build; echo "build: $?"
npx vitest run src/__tests__/manifest.test.ts src/lib/__tests__/opd-doctors.test.ts src/lib/api/__tests__/core-fallback.test.ts src/lib/intake/__tests__/register.test.ts src/lib/supabase/__tests__/client.test.ts src/store/__tests__/useLabOrdersStore.setRealIds.test.ts   # the 6 hermetic suites: must be green
```

Expected: all pass, including the i18n namespace test.

- [ ] **Step 5: Visual check**

```bash
cd "/e/Umang Hospital HIMS"
npm run dev
```

Open `http://localhost:3000`. Confirm Umang branding, exactly five portal cards, no dead tiles, and no console `MISSING_MESSAGE` warnings. Toggle to Hindi and confirm the same. Stop the server.

- [ ] **Step 6: Commit**

```bash
cd "/e/Umang Hospital HIMS"
git add -A
git commit -q -m "feat: rebrand the landing page for Umang Hospital

Portal launcher offers the five shipped portals; module tiles describe only
what this project runs. Copy and metadata move from Agentix/government
framing to Umang Hospital, in both en and hi."
```

---

### Task 11: Prune scripts, seeds and dependencies; write project docs

**Files:**
- Delete: `scripts/shoot-*.cjs`, `probe-*.cjs`, `sweep-*.cjs`, `audit-*.cjs`, `scripts/migration/`, out-of-scope seeds
- Delete: `supabase/.temp/`
- Modify: `package.json`, `README.md`
- Create: `.env.example`

**Interfaces:**
- Consumes: Task 10's rebranded app.
- Produces: a repo whose `scripts/` holds only tools this project uses, and a README stating the shared-database constraint.

- [ ] **Step 1: Delete the screenshot, probe and migration harnesses**

```bash
cd "/e/Umang Hospital HIMS/scripts"
rm -f shoot-*.cjs probe-*.cjs sweep-*.cjs audit-*.cjs diag-*.cjs \
      flow-walker.cjs hero-journey-walker.cjs inventory-surface.cjs \
      regression-suite.cjs verify-closures.cjs \
      codemod-persist-stores.py codemod-uniform-palette.py
rm -rf migration
ls -1
```

Expected: `i18n-barrel.mjs`, `i18n-reterm.mjs`, `i18n-terms.json`, `reachability.mjs`, `seed/`.

- [ ] **Step 2: Delete out-of-scope seed scripts**

```bash
cd "/e/Umang Hospital HIMS/scripts/seed"
rm -f seed-ambulance.mjs seed-ap-invoices.mjs seed-blood-bank.mjs seed-bmw.mjs \
      seed-consent.mjs seed-cssd.mjs seed-dietary.mjs seed-er-cases.mjs \
      seed-feedback.mjs seed-housekeeping.mjs seed-hr.mjs seed-insurance-claims.mjs \
      seed-inventory.mjs seed-ipd-journey.mjs seed-mortuary.mjs seed-ot.mjs \
      seed-quality.mjs seed-statutory.mjs seed-vendor.mjs seed-ward.mjs
ls -1
```

Expected: `provision-demo-accounts.mjs`, `seed-bills.mjs`, `seed-drug-master.mjs`, `seed-nurse-worklist.mjs`.

- [ ] **Step 3: Remove the Supabase CLI temp directory**

```bash
cd "/e/Umang Hospital HIMS"
rm -rf supabase/.temp
ls supabase && ls supabase/migrations | wc -l
```

Expected: `config.toml`, `migrations`, `.gitignore`; count still `61` — migrations are **never** pruned.

- [ ] **Step 4: Remove genuinely unused dependencies**

```bash
cd "/e/Umang Hospital HIMS"
for p in recharts qrcode.react framer-motion @tabler/icons-react next-intl \
         react-hook-form @hookform/resolvers sonner zod zustand \
         tailwind-merge clsx puppeteer-core pg @types/pg dotenv; do
  n=$(grep -rl --include=*.ts --include=*.tsx --include=*.mjs "['\"]$p" src scripts 2>/dev/null | wc -l)
  echo "$n  $p"
done
```

Uninstall only packages reporting `0`. `puppeteer-core` will report 0 once the shoot scripts are gone — remove it. `pg`, `@types/pg` and `dotenv` are used by `scripts/seed/*` and `vitest.setup.ts`; keep any with a non-zero count.

```bash
cd "/e/Umang Hospital HIMS"
npm uninstall <each package that reported 0>
```

- [ ] **Step 5: Set the package identity**

Edit `package.json`:

```json
{
  "name": "umang-hospital-hims",
  "version": "0.1.0",
  "private": true,
  "description": "OPD patient journey for Umang Hospital — registration, reception, nursing, consultation, billing."
}
```

Add a script alongside the existing ones:

```json
"reachability": "node scripts/reachability.mjs"
```

- [ ] **Step 6: Create `.env.example`**

```bash
cd "/e/Umang Hospital HIMS"
sed 's/=.*/=/' .env.local > .env.example
grep -q "^.env.local" .gitignore && echo "gitignored ok" || printf '\n.env.local\n' >> .gitignore
cat .env.example
```

Confirm every value is blank before committing.

- [ ] **Step 6a: Project-wide brand sweep — replace "Agentix HIMS" with "Umang Hospital"**

Task 10 rebranded the landing page only. The product identity is everywhere else: **89 occurrences across 50 files** (63 in `src/`, 26 in `messages/`). Every step of the OPD journey still says Agentix:

| Touchpoint | File |
|---|---|
| Login heading — "Sign in — Agentix HIMS" | `src/app/login/page.tsx` |
| Check-in kiosk logo + alt text | `src/app/checkin/page.tsx` |
| **Voice agent greeting** — Asha introduces herself as "the AI receptionist at Agentix HIMS" | `src/app/api/intake/turn/route.ts`, `src/ai-services/intake-assistant.ts` |
| **Printed tax invoice** and downloadable documents | `src/app/patient/billing/page.tsx`, `src/app/patient/downloads/page.tsx` |
| Public patient-tracking page | `messages/{en,hi}/p.json` |
| ABHA consent `hiuName` (the name shown to the patient when consenting) | `src/app/abha/page.tsx` |
| WhatsApp assistant replies | `src/ai-services/whatsapp-assistant.ts` |
| Registration welcome screen | `messages/{en,hi}/intake.json` |

Replace every user-visible occurrence with **Umang Hospital**. Work through `grep -rn "Agentix" src messages` until it returns nothing — comments included, since a comment naming the old product is stale documentation here too.

Three judgement calls while you go:

1. **`src/app/checkin/page.tsx` references `/Agentix logo-health.svg`.** Repoint it at `/Umang-logo.webp` so Step 6b can delete the Agentix asset. Do this before Step 6b, or the reference-count check will keep the file.
2. **Claims that stop being true for one hospital.** `messages/{en,hi}/doctor.json` says beds are "Live across Agentix HIMS branches". Umang Hospital is a single hospital in this build — reword so it does not claim a multi-branch network.
3. **Keep Hindi Hindi.** Both locales change together, key-for-key; `i18n-namespaces.test.ts` enforces parity. "Umang Hospital" may stay Latin script inside Hindi strings (as "Agentix HIMS" did) — do not machine-transliterate it.

Then add a regression guard so this cannot creep back. Create `src/__tests__/branding.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// The old product name must not survive anywhere a user or a maintainer reads.
const FORBIDDEN = ['Agentix']

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|json)$/.test(e.name)) out.push(p)
  }
  return out
}

describe('branding', () => {
  it('no file under src/ or messages/ mentions the old product name', () => {
    const roots = ['src', 'messages'].map((d) => path.join(process.cwd(), d))
    const offenders: string[] = []
    for (const root of roots) {
      for (const file of walk(root)) {
        const text = fs.readFileSync(file, 'utf8')
        for (const term of FORBIDDEN) {
          if (text.includes(term)) {
            offenders.push(`${path.relative(process.cwd(), file)} -> ${term}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
```

Run it BEFORE the sweep to confirm it goes RED naming the 50 files, then after to confirm GREEN. It joins the binding suite set.

- [ ] **Step 6b: Prune stale brand assets from `public/`**

The rebrand in Task 10 leaves Gov-HIMS/Agentix assets behind. Remove the ones nothing references:

```bash
cd "/e/Umang Hospital HIMS"
for f in public/*; do
  n=$(grep -rlF "$(basename "$f")" src messages 2>/dev/null | wc -l)
  printf '%3d  %s
' "$n" "$f"
done
```

Delete every asset reporting `0`. Expect `Agentix logo-health.svg`, `Agentix-logo-favicon.ico`, `download-ayushman-card.jpg` and `peoplesuniversitylogo.png` among them — the last is a university logo with no place in a hospital product. **Keep `Umang-logo.webp`** and anything with a non-zero count. Next.js's own `file.svg`/`globe.svg`/`next.svg`/`vercel.svg` are scaffold leftovers; delete them too if unreferenced.

- [ ] **Step 7: Prune the inherited docs tree**

Task 1's mirror copied Gov-HIMS's entire `docs/` directory, including its specs and roughly seven phases of implementation plans for portals this project does not ship.

```bash
cd "/e/Umang Hospital HIMS/docs"
ls -R | head -60
```

Also prune the root `specs/` and `context/` directories, which are Gov-HIMS agent artefacts carried over by the mirror.

Keep only what describes **this** project: this extraction's own spec and plan (copy them in from the source repo's `docs/superpowers/{specs,plans}/2026-08-29-umang-opd-extraction*`), plus any design-system or design-language document the shipped UI still relies on. Delete the Gov-HIMS phase plans, the reviews, and the specs for lab, pharmacy, radiology, IPD, OT and the government cockpits.

```bash
cd "/e/Umang Hospital HIMS"
ls -R docs
```

Confirm nothing describing a removed portal survives. The deleted material remains in Gov-HIMS's own git history, which this plan never touches.

- [ ] **Step 8: Rewrite the README**

Replace `README.md` with a document covering: what the project is; the six-step journey; the five portals and six roles; setup (`npm ci`, copy `.env.example` to `.env.local`, `npm run dev`); the demo accounts and `scripts/seed/provision-demo-accounts.mjs`; the verification commands; and — stated plainly under its own heading — that **this app shares its Supabase project with Gov-HIMS**, so schema changes, RLS policies and demo data are common to both, and that `supabase/migrations/` is Gov-HIMS's applied history retained verbatim so `supabase db push` diffs correctly.

Delete `CMO_COCKPIT_BUILD_SPEC.md`, `HEALTH_SECRETARY_BUILD_SPEC.md`, `PROJECT-OVERVIEW.md` and `PRD.md` if any survived Task 1's exclusions. Keep `AGENTS.md`; rewrite `CLAUDE.md`'s Project and Structure sections for Umang.

- [ ] **Step 9: Verify**

```bash
cd "/e/Umang Hospital HIMS"
rm -rf node_modules package-lock.json && npm install
rm -rf .next
npx tsc --noEmit; echo "tsc: $?"
npm run build; echo "build: $?"
node scripts/reachability.mjs | head -3
npm run lint 2>&1 | tail -3      # <= 602 problems, no new rule violated
npx vitest run src/__tests__/manifest.test.ts src/lib/__tests__/opd-doctors.test.ts src/lib/api/__tests__/core-fallback.test.ts src/lib/intake/__tests__/register.test.ts src/lib/supabase/__tests__/client.test.ts src/store/__tests__/useLabOrdersStore.setRealIds.test.ts   # the 6 hermetic suites: must be green
```

Expected: all pass; `DEAD: 0`. The clean reinstall proves no removed dependency was still needed.

- [ ] **Step 10: Commit**

```bash
cd "/e/Umang Hospital HIMS"
git add -A
git commit -q -m "chore: prune tooling and dependencies, write project docs

Removes ~130 screenshot/probe/audit harnesses, the DB migration scripts and
20 out-of-scope seeds, keeping demo-account provisioning plus the bills,
drug-master and nurse-worklist seeds. Uninstalls packages with no importers,
verified by a clean reinstall.

supabase/migrations/ is untouched at 61 files: it is the applied history of
the shared database, and pruning it would make db push diff against a history
that never happened. The README says so under its own heading."
```

---

### Task 12: Verify the OPD journey end to end

The acceptance criterion. Nothing here is optional — the extraction is complete only when a patient can be carried from landing to a settled OPD bill.

**Files:**
- Modify: only files that fail a step below

**Interfaces:**
- Consumes: Tasks 1–11.
- Produces: a verified working application on branch `chore/opd-extraction`, merged to `main`.

- [ ] **Step 1: Run every automated gate**

```bash
cd "/e/Umang Hospital HIMS"
rm -rf .next
npx tsc --noEmit; echo "tsc: $?"
npm run build; echo "build: $?"
node scripts/reachability.mjs | head -3
npm run lint 2>&1 | tail -3      # <= 602 problems, no new rule violated
npx vitest run src/__tests__/manifest.test.ts src/lib/__tests__/opd-doctors.test.ts src/lib/api/__tests__/core-fallback.test.ts src/lib/intake/__tests__/register.test.ts src/lib/supabase/__tests__/client.test.ts src/store/__tests__/useLabOrdersStore.setRealIds.test.ts   # the 6 hermetic suites: must be green
```

Expected: `tsc: 0`, `build: 0`, `DEAD: 0`; lint at or below the 602-problem baseline with no newly-violated rule; the 6 hermetic vitest suites all green. **Record the actual output.** Do not proceed on a partial pass.

- [ ] **Step 2: Confirm demo accounts exist for the five portal roles**

**This Supabase project is shared with Gov-HIMS.** Its auth pool is live and common to both apps, so check before you write.

First, read-only: sign in at `/login` as each of `demo-patient@example.test`, `demo-reception@example.test`, `demo-nurse@example.test`, `demo-doctor@example.test`, `demo-billing@example.test` (Step 3 starts the dev server; do this as part of it, or query `profiles` with the service-role key).

Run the provisioning script **only for accounts that turn out to be missing**:

```bash
cd "/e/Umang Hospital HIMS"
node scripts/seed/provision-demo-accounts.mjs
```

Before running it, trim its role list to the six roles in `src/types/roles.ts` — otherwise it provisions accounts for portals this project deleted, into a database Gov-HIMS also reads.

If all five accounts already exist, **skip the script entirely** and move to Step 3.

- [ ] **Step 3: Walk the journey**

```bash
cd "/e/Umang Hospital HIMS"
npm run dev
```

At `http://localhost:3000`, complete each step and record the observed result:

1. **Landing** — loads; exactly five portal cards; no console errors.
2. **Registration (form)** — `/checkin/intake` completes; a patient row is created and a UHID issued.
3. **Registration (voice)** — the voice agent completes a registration through `/api/intake/turn` and `/api/voice/tts`. If `ELEVENLABS_API_KEY` is on a free plan the TTS call returns HTTP 402 and falls back to the browser voice — **that is a pass**; the registration must still complete.
4. **Reception** — sign in as reception; the new patient appears in the OPD queue; issue a token.
5. **Nurse** — sign in as nurse; record vitals against that visit; they persist on reload.
6. **Doctor** — sign in as doctor; open the consultation; the nurse's vitals are visible; record diagnosis and notes; write a prescription and a lab order; complete the visit.
7. **Patient** — sign in as patient; visit, vitals, prescription, orders and bill are all visible; orders read as `ordered` and do not advance.
8. **Billing** — sign in as billing; raise and settle the OPD consultation fee; the patient portal reflects payment.

- [ ] **Step 4: Confirm no route outside the manifest resolves**

With the dev server running, request three deleted routes and confirm each 404s:

```bash
for r in /lab/dashboard /pharmacy/queue /cmo; do
  printf '%s -> ' "$r"; curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3000$r"
done
```

Expected: `404` for all three. Stop the dev server.

- [ ] **Step 5: Fix and re-verify**

For any step that failed, fix the cause and re-run **Step 1 and the failing step**. Do not mark this task complete on a partial pass; report exactly which steps passed and which did not.

- [ ] **Step 6: Commit and merge**

```bash
cd "/e/Umang Hospital HIMS"
git add -A
git commit -q -m "test: verify the OPD journey end to end" --allow-empty
git checkout -q main
git merge --no-ff chore/opd-extraction -m "feat: Umang Hospital HIMS — OPD patient journey

Standalone OPD-only extraction from Gov-HIMS. Five portals (patient,
reception, nurse, doctor, billing), six roles, and the complete journey from
landing through registration, reception, vitals, consultation and billing.

The doctor creates prescriptions and lab/imaging orders; no portal fulfils
them, so orders terminate at 'ordered' by design.

Shares its Supabase project with Gov-HIMS — see README."
git log --oneline -1
```

---

## Recommended follow-up (deliberately out of scope)

- **Wire the clinical safety rules into the prescription pad.** `src/rules-engine/` — allergy blocking, drug-interaction checking, dosage bounds, critical values — was dead code in Gov-HIMS, reachable only from an out-of-scope lab panel, and is deleted in Task 8. Reinstating allergy and interaction checks against the Umang prescription pad is a genuine clinical-safety improvement.
- **Consolidated OPD-only migration set.** Would let Umang point at its own Supabase project and become standalone as a system, not just as a codebase.
