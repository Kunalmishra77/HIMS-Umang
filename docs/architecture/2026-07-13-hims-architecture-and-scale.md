# Government HIMS — Architecture, Scalability & Strategy

**Author:** Lead Solution / Cloud / Database / Backend / DevOps Architect
**Date:** 2026-07-13
**Status:** For review & approval. No further feature implementation until approved.

> **Reading convention used throughout:** every subsystem is marked
> **[NOW]** (what actually exists in the codebase today) or **[TARGET]** (what
> a multi-hospital, crore-scale production deployment needs) with the
> **migration path** between them. This document does not present aspirational
> infrastructure as if it already exists.

---

# 1. Current Progress — Technical Report

## 1.1 Stack as it exists today [NOW]
- **Frontend:** Next.js 16.2 (App Router, Turbopack), TypeScript, Tailwind, Zustand state, framer-motion, next-intl. ~29 role portals under `src/app/*`.
- **Backend:** Supabase Pro project `uidhrfybgptqllzztgyb` (Postgres 17.6) reached **only via the connection pooler** (`aws-1-ap-south-1.pooler.supabase.com`; the direct host is IPv6-only and unreachable from our env). Auto-REST via PostgREST, auth via GoTrue, realtime via Supabase Realtime. Storage available but **unused**.
- **Data-access pattern:** a thin `src/lib/api/_core.ts` `table()` helper wraps PostgREST and **falls back to per-browser localStorage** when a table is missing; ~30 typed modules in `src/lib/api/*`. Cross-device board (`opd_orders`) is driven by service-role Next.js route handlers (`/api/opd-*`) + `src/lib/cross-device-orders.ts`.
- **State bridge:** ~12 Zustand stores mirror writes into Postgres when a **real session** exists; `StoreHydrator.tsx` does mount-hydrate + 4s poll + Supabase Realtime subscription.

## 1.2 Work completed this engagement

**Phase 1 — Supabase Pro migration (done, verified):**
- Migrated old project → new Pro project: **35 tables, 1,706 rows, 12 auth users**.
- Auth users recreated via Admin API with **new UUIDs remapped across 14 FK columns** (schema-verified complete: 0 self-FKs, acyclic).
- Verified: schema object parity **35 tables / 82 indexes / 83 RLS policies** OLD=NEW; row reconciliation all-tables exact; `next build` passes (262 routes); test failures traced to Auth rate-limiting (transient, proven by isolation pass) + a pre-existing relative-URL test gap — **0 migration defects**.
- Reusable, secret-free scripts in `scripts/migration/`; evidence report committed.

**#2 GitHub sync:** branch is 0-behind / ahead of both `origin/main` and `kunal/main`; merged `origin/feat/patient-journey-mom` (net zero code — our branch already superseded it).

**Phase 2 audit + Phase 3 roadmap:** committed (`docs/superpowers/specs/`).

**Tier 0 foundations (6 of 7 done, each verified):**

| ID | Change | Verification |
|---|---|---|
| T0.1 | Expanded `role_t` enum 7→**29 roles**; provisioned a real account+profile per role; wired **explicit login-per-role** (all launcher cards → `/login?role=…`) | live sign-in as a new role resolves correct role; `/login` + landing render 200 |
| T0.2 | Replaced blanket `using(true)` RLS on 9 graduated tables with **per-role policies** via a new `has_role()` helper (admin implicit) | **10/10 live write checks** (doctor✗/billing✓ bills; nurse✗/pharmacy✓ narcotics; …) |
| T0.3 | Neutralized `radiology.ts` table-name collision (retargeted to `legacy_radiology_studies` → localStorage) | real table intact (7 rows), tsc clean |
| T0.4 | Added `pushOrder()` to **result-ready transitions** (lab release/micro, radiology verify, pharmacy ready) → cross-device propagation; loop-safe | tsc clean, 49/49 lab/rad/pharma tests |
| T0.5 | Added `admission_requests`+`ipd_stays` to the **realtime publication** (listeners were dead); unified role-aware mount+poll hydration incl. patient portal | tables in publication, tsc clean |
| T0.6 | Audit durability — **verified already durable** (anon INSERT+SELECT works; 1,495 rows; mount-hydrates 500 + live `onAudit`); corrected stale audit doc | empirical anon insert/read |

## 1.3 Backend module status (from the Phase 2 audit)
- **Real, table-backed CRUD:** patients, visits, encounters, prescriptions, orders, admission_requests, beds, lab (specimens/tests/reflex), radiology_studies, pharmacy (dispenses/inventory), ipd_stays/vitals, nurse_tasks, shift_handovers, narcotics_log, vitals_readings, audit, discharge, drugs, er_cases, staff. `bills`+`payments` tables exist but the **billing UI is still dummy**.
- **Pure dummy (no backend):** billing UI, insurance/TPA, blood bank, OT, ambulance, HR/payroll, general inventory, CSSD, dietary, BMW, mortuary, vendor mgmt, quality, statutory, feedback, ER triage board, consent, ward mgmt, notifications persistence — and the **CMO (7 stores)** + **Secretary (12 stores)** cockpits.

## 1.4 Database work completed
- 35 tables migrated with full relationships, 82 indexes, 83 RLS policies. Enum expanded to 29 roles (`20260713120000`). Per-role RLS hardening (`20260713130000`). Realtime publication fix (`20260713140000`). All applied to the live Pro project and recorded in `supabase_migrations.schema_migrations`.

## 1.5 APIs completed
- ~30 typed modules in `src/lib/api/*` (PostgREST-backed). Service-role route handlers: `/api/opd-register`, `/api/opd-advance`, `/api/opd-queue`, `/api/opd-order`, `/api/admin/staff`, `/api/auth/session`. AI/integration routes: `/api/ai/complete`, `/api/intake/turn`, `/api/voice/tts`, `/api/whatsapp/*` (not HIMS data).

## 1.6 Problems discovered → status
| Problem | Status |
|---|---|
| Demo role-switcher created no real session → writes silently no-op'd to localStorage | **Fixed** (T0.1 login-per-role) |
| `role_t` enum only 7 of 29 roles → non-clinical portals couldn't carry a real role | **Fixed** (T0.1) |
| Blanket `using(true)` RLS: any authenticated user could write bills/payments/narcotics | **Fixed** (T0.2) |
| `radiology.ts` wrote the real `radiology_studies` table with an incompatible schema (corruption risk under real sessions) | **Fixed** (T0.3) |
| Lab/radiology/pharmacy result status never propagated cross-device | **Fixed for result-ready** (T0.4); intermediate worklist steps deferred |
| `admission_requests`/`ipd_stays` realtime listeners were dead (tables not published) | **Fixed** (T0.5) |
| Patient portal never actively hydrated → stale on fresh device | **Fixed** (T0.5) |
| "Audit is in-memory / vanishes on reload" (Phase 2 claim) | **Disproven** (T0.6) — already durable |
| Direct-URL access to a portal without login isn't hard-blocked (no route guard) | **Pending** (fold into T0.2 follow-up / middleware guard) |
| Server-side gates (discharge-exit, bill-freeze) enforced only in client JS | **Pending** (build with Billing/Discharge modules) |
| ~20 modules + 2 cockpits are dummy | **Pending** (Tier 2/3) |
| No multi-tenant (hospital/branch) model, no Redis/queues/workers, no LB/replicas/partitioning/observability | **Pending** (this document defines the target) |

## 1.7 Currently working on / next
- **Currently:** Tier 0 is 6/7; **T0.7** (delete the 4 legacy modules + the `_seed.ts` code that drives them; confirm the migrated data forms a coherent demo journey; add a small real-table seed only where gaps exist) is the last Tier-0 item — **paused pending your approval of this architecture**.
- **Next after approval:** Tier 2 module builds (Billing first), Tier 3 cockpits, then the #4–#8 verification pass under real logins — plus the enterprise-architecture work items defined in §11.

---

# 2. Complete Architecture

## 2.1 Layered view [NOW → TARGET]

```
                         ┌────────────────────────────────────────────┐
  Browsers / Mobile ───► │  CDN / WAF  [TARGET]                        │
  (29 role portals,      └───────────────┬────────────────────────────┘
   patient app, kiosk)                   │
                          ┌──────────────▼───────────────┐
                          │  Load Balancer / Reverse Proxy │  [TARGET]
                          └──────────────┬───────────────┘
             ┌───────────────────────────┼───────────────────────────┐
             ▼                           ▼                            ▼
     ┌───────────────┐          ┌───────────────┐           ┌───────────────┐
     │ Next.js app N1│  ...     │ Next.js app Nk│           │ Worker pool   │ [TARGET]
     │ (SSR + API)   │          │               │           │ (BullMQ/queues)│
     └───────┬───────┘          └───────┬───────┘           └───────┬───────┘
             │  business logic / RLS-scoped queries                 │
             ▼                                                       ▼
     ┌─────────────────────────────────────────────┐        ┌──────────────┐
     │  Data + platform services                    │        │ Redis        │ [TARGET]
     │  • Postgres (Supabase) primary  [NOW]        │◄──────►│ cache / queue│
     │  • Read replicas                 [TARGET]    │        │ pub-sub / RL │
     │  • Supabase Auth (GoTrue)        [NOW]       │        └──────────────┘
     │  • Supabase Realtime (WS)        [NOW]       │        ┌──────────────┐
     │  • Object storage (S3/Supabase)  [NOW avail] │        │ Observability│ [TARGET]
     │  • PACS/RIS, HL7/FHIR gateways   [TARGET]    │        │ logs/metrics │
     └─────────────────────────────────────────────┘        │ traces       │
                                                             └──────────────┘
```

## 2.2 Frontend architecture [NOW]
Next.js App Router. Server Components for data-bound pages; Client Components (`"use client"`) for interactive portals. Zustand stores per domain, hydrated by `StoreHydrator` (mount pull + 4s poll + Supabase Realtime). Design tokens + Tailwind. **[TARGET]** move heavy read pages to Server Components hitting an RLS-scoped data layer; add a shared query cache (TanStack Query) to cut redundant polling; ship a React Native / patient PWA sharing `src/lib/api` types.

## 2.3 Backend architecture [NOW → TARGET]
**[NOW]** two backends coexist: (a) PostgREST auto-API behind RLS for CRUD via `src/lib/api/_core`, and (b) service-role Next.js route handlers for cross-device/board logic. **[TARGET]** promote a **single backend-for-frontend (BFF) API layer** (Next.js route handlers, or a dedicated NestJS service if the team prefers) that owns *business logic and transactions*, calls Postgres via a pooled connection, publishes domain events, and keeps PostgREST only for trivial RLS-safe reads. Business rules that today live in client stores (discharge gates, bill freeze, dispense reconciliation) move server-side.

## 2.4 Database architecture — see §3.

## 2.5 Authentication architecture [NOW]
Supabase **GoTrue**: email/password → JWT (access + refresh). Browser session cookie synced to server via `/api/auth/session` so middleware + Server Components see the user. Middleware refreshes tokens. **[TARGET]** add SSO/OIDC for hospital staff (ABHA/ABDM for patients), MFA for privileged roles, short access-token TTL + rotating refresh, and device/session management.

## 2.6 Authorization (RBAC) [NOW → TARGET]
**[NOW]** role in `profiles.role` (29-value enum) drives RLS via `has_role(roles[])` (admin implicit) and per-table policies. **[TARGET]** evolve to **RBAC + tenant scoping**: every row carries `hospital_id`/`branch_id`; policies become `has_role(...) AND same_tenant(hospital_id)`. Introduce a `permissions` matrix (role × action × resource) for fine-grained control beyond coarse roles, and break-glass emergency access (fully audited).

## 2.7 API architecture
**[NOW]** REST (PostgREST + route handlers), JSON. **[TARGET]** versioned API (`/api/v1`), consistent envelope + error codes, request validation at the boundary (zod), idempotency keys for mutations, OpenAPI spec, and an **event contract** for inter-module workflow (below).

## 2.8 Queue architecture [TARGET]
No queues today. Introduce **BullMQ on Redis** (or a managed broker) for: notification fan-out (SMS/WhatsApp/email), PDF/report generation, HL7/FHIR ingestion, lab-analyzer feeds, analytics rollups, DICOM post-processing, and ret/archival jobs. Workers run as a separate deployable pool with retries, DLQs, and concurrency limits per queue.

## 2.9 Event-driven workflow [TARGET]
Model the patient journey as **domain events** (`PatientRegistered`, `VisitAdvanced`, `LabResultReleased`, `RadiologyVerified`, `PrescriptionDispensed`, `Admitted`, `Discharged`, `BillFrozen`). Producers write the event (outbox table → Redis pub/sub or Kafka/NATS at scale); consumers (notification, billing, analytics, realtime) react asynchronously. This decouples modules and is what lets new modules subscribe **without rewrites** (§10).

## 2.10 Real-time communication — see §8.

## 2.11 File & image storage [NOW avail / TARGET]
Supabase Storage (S3-compatible) exists but is unused. **[TARGET]** buckets per class: `patient-documents`, `radiology-images` (DICOM/rendered), `lab-attachments`, `signatures`, `voice-notes`. Large radiology goes to a **PACS + object store**; HIMS stores DICOM metadata + a pointer, serves rendered previews via CDN with signed, expiring URLs. Never store binaries in Postgres.

## 2.12 Logging / monitoring / audit [NOW → TARGET]
**[NOW]** durable `audit_entries` (append-only, RLS public-insert). **[TARGET]** structured app logs (JSON) → Loki/ELK; metrics (Prometheus) + dashboards (Grafana); distributed traces (OpenTelemetry → Tempo/Jaeger); alerting (on error rate, latency, pool saturation, replication lag). Audit stays in Postgres, partitioned by month, archived after retention.

## 2.13 Backup & DR — see §3.8 and §10.

## 2.14 Deployment architecture — see §6.

---

# 3. Database Strategy (crores of records)

## 3.1 Normalization
Core clinical data stays **3NF** (patients, visits, encounters, orders, results, prescriptions, bills). Deliberate, controlled denormalization only for read-hot surfaces (e.g. `visits.doctor_name` alongside `doctor_id`, already present) and for reporting via **materialized views**, refreshed by workers — never hand-maintained in the transactional path.

## 3.2 Relationships & foreign keys
Every child references its parent with FKs (already the case: visits→patients, orders→visits, lab_tests→orders, etc.). **[TARGET]** add `hospital_id`/`branch_id` to every domain table for tenant isolation and composite FKs where cross-tenant integrity must be guaranteed.

## 3.3 Indexing strategy
**[NOW]** 82 indexes incl. partial indexes on active states (e.g. `visits_status_idx WHERE status NOT IN (...)`). **[TARGET]** systematic **composite indexes** matching real query shapes:
- `patients (hospital_id, hn)`, `patients (hospital_id, phone)`
- `visits (hospital_id, doctor_id, status)` partial on active
- `lab_tests (order_id, status)`, `orders (patient_id, created_at desc)`
- `audit_entries (hospital_id, timestamp desc)`, `(resource_id)`
- BRIN indexes on append-only time columns of very large tables (audit, results) — cheap for range scans over crores of rows.
Covering indexes for hot dashboards; review with `pg_stat_statements`.

## 3.4 Transactions & concurrency
Multi-row workflows (dispense, discharge clearance, bill freeze) must run in **DB transactions** with appropriate isolation, and **optimistic locking** (`updated_at`/version column checked on write) to prevent lost updates when two staff edit concurrently. Today these are sequential client calls with no atomicity — a correctness gap to close in the BFF layer.

## 3.5 Partitioning [TARGET, when tables reach 10s of millions of rows]
Range-partition the largest append/time-series tables by **month** (and sub-partition by `hospital_id` if a single hospital dominates): `audit_entries`, `lab_tests`/results, `vitals_readings`, `visits`, `appointments`, `payments`. Benefits: index bloat control, fast pruning of recent-window queries, cheap archival (detach old partitions). Partitioning is introduced *before* pain, but not prematurely — sized by row-count triggers.

## 3.6 Archiving & retention
Hot (0–18 months) in primary partitions; warm (18m–legal retention) in detached partitions on cheaper storage; cold beyond retention exported to object storage (Parquet) for analytics, then purged per **DPDP/DISHA** retention rules and patient RTBF requests. A retention worker enforces this.

## 3.7 Query optimization
`pg_stat_statements` + `auto_explain` to find slow queries; ensure every hot path is index-backed; push filters into RLS-safe views; paginate keyset (not OFFSET) for large lists; move analytics off the primary to **read replicas** and **materialized views**.

## 3.8 Backup & restore
**[NOW]** Supabase Pro: automated daily backups + PITR (plan-dependent). **[TARGET]** documented RPO/RPO targets (e.g. RPO ≤ 5 min via WAL archiving/PITR, RTO ≤ 1 h), cross-region backup copies, and **quarterly restore drills** (a backup you've never restored is not a backup).

## 3.9 Multi-tenancy model (the key scale decision) [TARGET]
Recommend **shared-schema, row-level tenancy**: `hospital_id` + `branch_id` on every table, isolated by RLS. Rationale: one schema to migrate/operate, cross-hospital analytics is trivial, and RLS already enforces isolation. For a handful of very large hospitals that outgrow the shared cluster, **peel them into their own database/shard** later (the `hospital_id` key makes this a data-move, not a rewrite). Avoid schema-per-tenant (hundreds of schemas = migration nightmare) unless a regulator mandates physical isolation.

---

# 4. High-Load Strategy

## 4.1 Request path at scale [TARGET]
```
Client → CDN/WAF → Load Balancer → {Next.js app server pool, auto-scaled}
       → BFF business logic → Redis (cache/session/rate-limit)
       → Postgres primary (writes) / read replicas (reads)
       → enqueue async work (BullMQ) → workers → notifications/analytics
```

## 4.2 Components
- **Load balancer** (cloud ALB / nginx): TLS termination, sticky-less round-robin (sessions live in JWT + Redis, so any server can serve any request), **health checks** on `/api/health`, drains unhealthy nodes.
- **Reverse proxy** (nginx/Envoy): routing, compression, request buffering, per-route rate limits.
- **Multiple app servers:** stateless Next.js containers; **horizontal scaling** is the primary lever. **Vertical scaling** only for the DB tier.
- **Auto-scaling:** target CPU/RTT/queue-depth; scale-out on load, scale-in off-peak; min replicas for HA across ≥2 AZs.
- **Failover:** ≥2 app AZs; Postgres primary with a **standby** promoted on failure; Redis with replica/Sentinel or managed HA.
- **Connection pooling:** **already using Supavisor pooler** — critical, because thousands of stateless requests must not open thousands of Postgres connections. BFF uses transaction-mode pooling; migrations/DDL use session mode.
- **Database scaling:** primary for writes; **read replicas** for dashboards/reports/analytics; **partitioning** for table size; **sharding by `hospital_id`** only for the largest tenants when a single cluster is exhausted.

## 4.3 Capacity approach
Load-test with realistic mixes (registration bursts at OPD open, lab result storms). Budget connections (pooler size), Redis memory, and replica count from measured p95 latency, not guesses. Every scaling limit (pool max, queue concurrency) is explicit and monitored.

---

# 5. Redis Strategy [TARGET]

## 5.1 Why Redis
Postgres should not absorb session lookups, rate-limit counters, hot reference reads, or realtime fan-out. Redis offloads these at sub-ms latency.

## 5.2 Cache (what)
- Reference/master data: drug master, test/scan catalogs, tariff/package master, facility/bed maps.
- Computed dashboards: CMO/Secretary aggregates, admin KPIs (short TTL, refreshed by workers).
- Per-user auth/profile lookups.

## 5.3 Never cache
Live clinical truth read for a decision (current bed state at assignment, dispense quantity, bill balance at payment, RLS-sensitive PII across tenants). These read the primary/replica with correctness guarantees.

## 5.4 Invalidation
TTL for reference data (minutes–hours); **event-driven busting** on domain events (e.g. `DrugMasterUpdated` → evict `drug:*`); versioned cache keys to avoid stampedes; never cache without an invalidation path.

## 5.5 Sessions, queues, pub/sub, performance
- **Sessions:** refresh-token/allow-list + rate-limit buckets in Redis (stateless app servers).
- **Queues:** BullMQ (§2.8).
- **Pub/Sub:** realtime fan-out and cross-instance cache invalidation.
- **Effect:** removes read pressure from Postgres, enables horizontal app scaling, and backs the async event pipeline.

---

# 6. Server Architecture (deployment)

## 6.1 Today [NOW]
Next.js app (Vercel-style hosting) + Supabase managed Postgres/Auth/Realtime/Storage. Single logical environment. No separate worker/Redis/monitoring tiers yet.

## 6.2 Target responsibility separation [TARGET]
| Tier | Responsibility | Scaling |
|---|---|---|
| CDN/WAF | static assets, image previews, edge caching, attack filtering | managed |
| Load balancer / proxy | TLS, routing, health checks, rate limit | managed/HA |
| App servers (Next.js/BFF) | SSR + API + business logic (stateless) | horizontal auto-scale, ≥2 AZ |
| Worker pool | queues: notifications, PDFs, HL7/FHIR, analytics, archival | horizontal by queue depth |
| Postgres primary | transactional writes | vertical + partitioning |
| Read replicas | dashboards, reports, analytics | add replicas as read load grows |
| Redis | cache, sessions, rate-limit, queues, pub/sub | HA (replica/Sentinel) |
| Object storage + PACS | files, DICOM images, documents | managed/S3 |
| Observability | logs, metrics, traces, alerting | managed/self-hosted |

Initial production footprint can be modest (managed Supabase + 2 app nodes + 1 Redis + 1 worker + 1 read replica + observability SaaS) and grow each tier independently — the point is **separation of responsibility**, not many machines on day one.

---

# 7. Data Flow — request lifecycle (worked example)

**"Patient books an appointment":**
1. **Client** submits form (Client Component) → `POST /api/v1/appointments` with JWT cookie.
2. **LB → app server** (any node; stateless).
3. **Middleware** validates/refreshes the session (JWT), attaches `user`, `hospital_id`.
4. **BFF handler** validates payload (zod), checks RBAC (`has_role` + tenant), opens a **transaction**: insert `appointments` (RLS-scoped), optimistic-lock the doctor's slot.
5. **Cache:** read doctor/slot availability from Redis (fallback to replica) before commit; on commit, **evict** the slot cache key.
6. **Event:** write `AppointmentBooked` to the outbox → publish to Redis/broker.
7. **Queue/workers:** notification worker sends SMS/WhatsApp/email confirmation; analytics worker updates counters.
8. **Realtime:** Supabase Realtime emits the `appointments` row change → the reception/doctor portals on other devices re-hydrate → the new appointment appears **without refresh**.
9. **Response:** 201 + created resource (idempotency key prevents double-booking on retry).

Every clinical mutation follows this shape: **validate → RBAC/tenant → transaction → cache-evict → emit event → async fan-out → realtime → respond.**

---

# 8. Real-Time Updates

## 8.1 Recommendation
**Keep Supabase Realtime [NOW] as the primary channel** (Postgres logical replication → WebSocket, RLS-enforced) for row-change fan-out — it's already wired (`StoreHydrator`) and respects per-role/per-tenant policies for free. Keep the **4s poll fallback** for environments where WS is blocked. Same-browser tabs use BroadcastChannel.

## 8.2 Why (vs alternatives)
- **WebSockets (custom):** most control, but we'd own auth, scaling, and RLS re-implementation — unnecessary now.
- **SSE:** one-way, simpler, but no per-row RLS integration.
- **Supabase Realtime:** integrates auth + RLS + our existing schema; least code, correct security. Chosen.

## 8.3 Scaling realtime [TARGET]
At high connection counts, Supabase Realtime scales as a managed tier; if it becomes a bottleneck, front realtime with a **Redis pub/sub fan-out** and a dedicated WS gateway, driven by the **domain-event stream** (§2.9) rather than raw row changes — this also lets us push *semantic* events (e.g. "result ready") instead of table diffs, reducing client work. Migration is additive: the event bus wraps the same mutations that already emit today.

## 8.4 Loop-safety (already enforced)
Realtime pulls (hydrate/merge) never push; pushes happen only in explicit mutations. This one-way rule (documented in `StoreHydrator`) is what prevented the push→realtime→hydrate→push storm and must remain a design invariant.

---

# 9. Security Model

| Concern | [NOW] | [TARGET] |
|---|---|---|
| Authentication | GoTrue JWT (access+refresh), cookie-synced sessions, middleware refresh | SSO/OIDC for staff, ABHA/ABDM for patients, MFA for privileged roles, short TTL + rotating refresh |
| Authorization | 29-role RBAC via `profiles.role` + `has_role()` RLS | RBAC + **tenant isolation** (`hospital_id` in every policy), fine-grained permission matrix, audited break-glass |
| JWT handling | Supabase-issued, verified at PostgREST/RLS + middleware | rotate signing keys, minimize claims, revocation via Redis allow-list |
| Row-Level Security | per-role policies on all 35 tables; hardened graduated tables | per-tenant + per-role; deny-by-default; server-side gates (discharge/bill) via triggers |
| Encryption | TLS in transit; Supabase at-rest encryption | field-level encryption for sensitive PII (Aadhaar/ABHA), KMS-managed keys |
| API security | validation at some boundaries | zod validation everywhere, idempotency keys, output filtering, CORS lockdown |
| Secrets | `.env.local` (git-ignored); **service-role key + DB password were shared in chat and must be rotated** | secrets manager/vault, per-env, no secrets in repo or chat, rotation policy |
| Rate limiting | none | Redis token-bucket at gateway per IP/user/route |
| Audit | durable append-only `audit_entries` | partitioned + retained + tamper-evident (hash-chain) |
| Common attacks | parameterized queries (no SQLi), React escaping (XSS), RLS (IDOR) | WAF, CSRF tokens on cookie flows, security headers/CSP, dependency scanning, pen tests |
| Compliance | — | **DPDP Act / DISHA**: consent management, data localization, RTBF, breach logging (audit actions already reserved) |

**Immediate action owed:** rotate the service-role key and DB password (exposed in chat), then update `.env.local`.

---

# 10. Future Growth — how today's design absorbs scale

| Future pressure | What absorbs it without redesign |
|---|---|
| Crores of patient records | 3NF core + **partitioning** by month/hospital + BRIN/composite indexes + archival to cold storage |
| Hundreds of hospitals / thousands of branches | **`hospital_id`/`branch_id` + RLS tenancy** from the start; peel large tenants into shards later using the same key |
| Millions of appointments/reports | keyset pagination, read replicas, materialized reporting views, async rollups |
| Heavy concurrent traffic | stateless app tier + auto-scaling + connection pooling + Redis offload |
| New modules (blood bank, OT, TPA, …) | subscribe to the **domain-event bus**; add tables with the standard tenant+RLS+audit pattern — no core rewrite |
| Mobile / patient app / voice / WhatsApp | shared `src/lib/api` contracts + the same BFF + event bus; channels are just new event consumers |
| Radiology at scale (DICOM) | PACS/RIS + object storage + HL7/FHIR gateway; HIMS holds metadata + pointers |

The two decisions that make this true and must be taken **early**: (1) **tenant key + RLS on every table**, (2) **domain-event bus** for inter-module workflow. Everything else (Redis, replicas, partitioning, workers, CDN) can be added incrementally when metrics justify it.

---

# 11. Development Roadmap (remaining work)

Executed **one module at a time** (plan → DB → API → build → integrate → test → optimize → docs → approval). Tiers from the Phase 3 roadmap, now with the detail you asked for.

## Tier 0 (finish first) — T0.7
- **What:** delete the 4 legacy modules (`ipd/lab/pharmacy/radiology.ts`) + their `_seed.ts` usage; verify migrated data forms a coherent journey; add a small real-table seed only for gaps.
- **Why:** removes dead/duplicate write paths; gives the demo coherent, real-table data (#7).
- **Deps:** T0.1–T0.6 (done). **DB:** none (data already migrated). **API:** remove dead exports. **Complexity:** M. **Testing:** journey walk under real logins. **Risks:** seed touching wrong tables — mitigated by real-table-only seeding. **Optimization:** n/a.

## Cross-cutting enterprise items (schedule as their own tracks; some are prerequisites for real scale)
| Item | Why | Deps | Complexity |
|---|---|---|---|
| **Tenant model** (`hospital_id`/`branch_id` + RLS everywhere) | multi-hospital isolation; hardest to retrofit later | core tables | **L** — do early |
| **BFF + transactions + server-side gates** | atomicity, security, business logic off the client | tenant model | **L** |
| **Domain-event bus + outbox** | decouple modules; enable async & new modules | BFF | **L** |
| **Redis** (cache/session/rate-limit/queue) | scale reads, sessions, async | BFF | **M** |
| **Workers/queues** (notifications, PDF, HL7/FHIR, analytics) | offload + integrations | Redis, events | **M** |
| **Observability** (logs/metrics/traces/alerts) | operability | app tier | **M** |
| **Deployment** (LB, auto-scale, replicas, backups/DR drills) | HA & scale | infra | **L** |
| **Storage/PACS/DICOM + CDN** | radiology & documents | storage | **L** |
| **Compliance** (DPDP/DISHA: consent, retention, RTBF, encryption) | legal | tenant, audit | **L** |

## Tier 2 — module backends (build order; each: tables + RLS + API + integrate + test)
1. **Billing** (tables exist) → 2. Insurance/TPA → 3. ER triage → 4. Blood Bank → 5. OT → 6. Ambulance → 7. Inventory → 8. HR/HRMS → 9. Payroll/Finance → 10. CSSD → 11. Dietary → 12. Housekeeping → 13. BMW → 14. Mortuary → 15. Vendor mgmt → 16. Quality/NABH → 17. Statutory → 18. Feedback → 19. Consent → 20. Ward mgmt → 21. Drug master → 22. Notifications persistence.
Each module spec (written just-in-time) covers: scope, data model, API surface, business logic, status flow, roles/RLS, validation, edge cases, realtime need, performance, testing, risks, optimization.

## Tier 3 — cockpits (largest)
- **CMO district cockpit** (7 stores) — district-level aggregation schema over hospital data; heavy read/materialized views. **Complexity: XL.**
- **Secretary state cockpit** (12 stores) — state-level aggregation over districts. **Complexity: XL.**
Both depend on the tenant model + event/analytics pipeline; schedule after Tier 2 core.

## Verification track (#4–#8)
Under real logins: full patient-journey walk (Reception→ABHA→UHID→Vitals→Doctor→Lab→Radiology→Pharmacy→OPD/IPD), cross-device realtime checks with two sessions, realistic demo data, and an A–Z local test — run as a gate before any `main` merge.

---

# Approval

Please review. On approval I will: (a) finish **T0.7**, then (b) sequence the **tenant model + BFF + event bus** as early enterprise tracks alongside Tier 2 module builds (Billing first), per this document. I will not resume feature implementation until you approve this architecture.
