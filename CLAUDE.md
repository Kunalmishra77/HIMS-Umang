@AGENTS.md

## Project

**Name:** Umang Hospital HIMS
**Stack:** Next.js (App Router), TypeScript, Tailwind CSS
**Purpose:** OPD patient journey for Umang Hospital, a single private hospital — registration (voice or form), reception, nursing, doctor consultation, and billing. Five staff-facing portals (patient, reception, nurse, doctor, billing) plus a bilingual (en/hi) voice registration agent and in-portal AI copilots. See `README.md` for the full journey, roles, and the shared-database constraint with Gov-HIMS.

## Structure

- `src/app/` — Next.js App Router pages and layouts, one folder per portal (`reception/`, `nurse/`, `doctor/`, `billing/`, `patient/`) plus public routes (`login`, `checkin`, `abha`, `discovery`, `p/[uhid]`)
- `src/components/` — Shared UI components
- `src/store/` — Zustand state management, one store per domain
- `src/types/` — TypeScript type definitions
- `src/ai-services/` — AI/LLM integrations (OpenAI copilots, ElevenLabs voice)
- `src/lib/` — Pure utility libraries, including the Supabase-backed API layer (`src/lib/api/`)
- `src/i18n/` — next-intl wiring for the bilingual (en/hi) locales in `messages/`
- `supabase/migrations/` — Gov-HIMS's applied migration history, retained verbatim (see README)

## Branch Discipline

- Work on feature branches, never commit directly to `main`
- Branch naming: `feat/<name>`, `fix/<name>`, `chore/<name>`
- PRs required to merge to `main`

## Guardrails

- Read `node_modules/next/dist/docs/` before writing any Next.js code (see AGENTS.md)
- TypeScript always — no `any` unless truly unavoidable
- Functional components only, no class components
- `StyleSheet.create()` for React Native styles; for Next.js use Tailwind classes
- No inline style objects for reused styles
- Do not add error handling for scenarios that cannot happen
- Validate only at system boundaries (user input, external APIs)
- Default: no comments unless the WHY is non-obvious
