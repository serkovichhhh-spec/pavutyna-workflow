# ТЯМА — Production Foundation v0.1

Status: **PROPOSED CHANGE**

## Current state

Validated staging MVP uses:
- static GitHub Pages UI;
- Supabase Edge Functions as staging API adapters;
- one temporary JSON state row for staging persistence;
- deterministic local processor instead of real AI;
- no production auth, production media storage, billing or production analytics.

The current Supabase project also contains unrelated/legacy public tables with separate security issues. It must not be treated as the production source of truth for ТЯМА.

## Problem

The staging architecture is sufficient for UX acceptance, but not for production:
- one JSON state row is not a safe multi-user persistence model;
- Host ownership is not enforced with production identity;
- public questionnaire/Public Screen access is token-based but not backed by a normalized event model;
- unrelated public tables in the current Supabase project increase operational and security risk;
- production infrastructure is still OPEN in MASTER CONTEXT.

## Proposed solution

Use a **separate production Supabase project** for ТЯМА instead of promoting the mixed staging project.

Foundation stack:
- Supabase Auth for Host identity;
- normalized Postgres tables for Event-scoped data;
- Row Level Security on every Host-owned table;
- server-side/Edge Function routes for anonymous respondent and Public Screen token access;
- service-role access only inside trusted server functions;
- real AI remains behind an internal provider interface and is NOT enabled in this foundation step;
- media storage remains a later isolated step after auth/persistence is green;
- validated staging remains untouched as a demo/acceptance environment.

## Why better

- preserves Event isolation structurally;
- removes dependence on a shared JSON document and write races;
- separates production risk from the current mixed Supabase project;
- gives production-safe Host ownership and permissions;
- keeps public respondent/Public Screen surfaces narrow and token-scoped;
- allows AI and media to be added later without changing the Host/Public access model;
- minimizes migration risk because staging UX and routes can be preserved.

## Risks

- new Supabase project has infrastructure cost;
- data migration from staging should be limited to fictional/demo seed data, not treated as production migration;
- auth changes require updating Host session handling;
- hosting provider for production frontend remains OPEN and should not be silently coupled to Vercel or GitHub Pages.

## Impact

Production foundation only. No new user-facing feature and no change to validated MVP flow.

---

# Executable specification

## Goal

Replace temporary staging persistence/auth assumptions with a production-safe foundation while preserving the already validated ТЯМА MVP workflow.

## Current state

Validated flow:
`Host access -> Dashboard -> Create Event -> Questionnaire -> public response -> Responses -> Event Kit -> Rehearsal -> Live -> Public Screen`.

Current staging must remain available and must not be rewritten during production foundation work.

## Required behaviour

1. A Host authenticates with a real account.
2. A Host can read/write only Events they own.
3. Every Event has isolated Questionnaire, Questions, Responses, Event Kit, Rehearsal and Live state.
4. Respondents do not need Host accounts.
5. A respondent can submit only to the Event resolved by a scoped questionnaire token.
6. Public Screen can read only the sanitized current public state resolved by a scoped public token.
7. `host_only` and `review_required` material can never be returned by the Public Screen endpoint.
8. `public_allowed` material still requires Host selection/approval before Live use.
9. No service-role key or privileged backend credential is exposed to the browser.
10. System Admin remains outside Host Dashboard scope.

## User flow

### Host

1. Sign in.
2. See only owned Events.
3. Create Event.
4. Configure questionnaire.
5. Copy/open respondent link.
6. Receive responses in the correct Event.
7. Work with Event Kit.
8. Edit/privacy/approve material.
9. Rehearse.
10. Enter Live.
11. Push only eligible material to Public Screen.
12. Clear Public Screen.

### Respondent

1. Open questionnaire token URL on mobile.
2. See only questionnaire data required for that Event.
3. Submit answers.
4. Receive success state.
5. Gain no Host or other Event access.

### Public Screen

1. Open public token URL.
2. Read only current sanitized live payload.
3. Never receive Host-only metadata or raw responses.

## UI states

Must preserve the validated staging states:
- Host access/sign-in;
- Dashboard empty/populated;
- Event overview;
- Questionnaire edit;
- Responses empty/populated;
- Event Kit draft/approved/do-not-use/removed;
- privacy: `host_only`, `review_required`, `public_allowed`;
- Rehearsal;
- Live blank/item;
- Public Screen blank/item;
- respondent success/error.

No production infrastructure controls appear in Host UI.

## Data / permissions

Minimum normalized model:

- `profiles`
  - `id uuid` = auth user id
  - Host-facing profile fields only

- `events`
  - `id uuid`
  - `host_id uuid`
  - event metadata
  - lifecycle
  - questionnaire token hash/reference
  - public screen token hash/reference

- `questionnaires`
  - one active questionnaire per Event for MVP

- `questions`
  - belongs to questionnaire + Event
  - type, label, required, order, privacy/default processing metadata

- `responses`
  - belongs to Event + questionnaire
  - respondent label
  - submitted timestamp

- `answers`
  - belongs to response + question + Event

- `event_kit_items`
  - belongs to Event
  - category, title, body
  - provenance
  - status
  - useful
  - privacy
  - edited/source metadata

- `rehearsal_states`
  - belongs to Event + kit item

- `live_states`
  - one current state per Event
  - current item nullable
  - mode + updated timestamp

Permissions:
- all Host-owned tables: RLS enabled;
- Host CRUD requires `host_id = auth.uid()` through Event ownership;
- respondent writes go through a trusted function that resolves questionnaire token -> Event and inserts only allowed fields;
- Public Screen reads go through a trusted function that resolves public token and returns sanitized payload only;
- no anonymous direct SELECT on Host tables;
- no anonymous direct RPC to privileged maintenance functions;
- service-role only in server environment.

## Edge cases

- invalid/expired questionnaire token -> not found/closed state;
- duplicate or replayed respondent submission -> defined idempotency/rate-limit strategy before production launch;
- Host attempts another Host's Event ID -> indistinguishable not-found/forbidden response;
- Event deleted/archived while respondent form is open -> safe submit failure;
- Live item loses `public_allowed` or approval -> Public Screen must stop returning it on next read;
- simultaneous Host edits -> use row-level database updates/transactions, never whole-Event JSON replacement;
- missing AI result -> Event remains usable; AI failure does not block questionnaire/Host data access;
- weak network/offline behaviour remains OPEN and is not invented here.

## Acceptance criteria

1. Two test Hosts cannot read or mutate each other's Events.
2. New Event is visible only to its Host.
3. Questionnaire token submits into exactly one Event.
4. Response appears in that Event and nowhere else.
5. Event Kit item privacy/status mutations are atomic under concurrent requests.
6. `host_only` never appears in Live eligibility or Public Screen response.
7. `review_required` never appears in Public Screen response.
8. only approved + `public_allowed` can be shown live.
9. clearing Live immediately returns Public Screen to blank state.
10. anonymous client cannot query raw responses/answers/Event Kit through PostgREST.
11. browser bundle contains no service-role key.
12. automated E2E reproduces the validated staging flow against production-foundation environment.
13. security advisor has no ТЯМА-owned RLS/public-execution errors.

## What must not change

- public name: ТЯМА;
- Event as central isolated context;
- Host Dashboard as Host surface;
- questionnaire mobile-first;
- Event Kit desktop-first;
- Host/Public Screen separation;
- privacy semantics;
- Host remains final decision-maker;
- no ChatGPT/system/backend/admin exposure to Host;
- no real AI or media storage added inside this foundation task;
- validated staging URL remains available during migration work.

## Tests

Minimum automated suite:

1. auth sign-in/sign-out/session expiry;
2. Host A vs Host B Event isolation;
3. Event create/read/update ownership;
4. questionnaire CRUD within Event;
5. anonymous questionnaire token GET/POST;
6. invalid token and closed questionnaire;
7. response/event isolation;
8. Event Kit atomic mutation/concurrency;
9. privacy matrix tests;
10. rehearsal state ownership;
11. Live show/blank authorization;
12. Public Screen sanitized payload;
13. browser E2E clean Event flow;
14. security/RLS regression test;
15. public UI brand regression: ТЯМА only, no internal technical name.

---

## Implementation order

1. Approve production project isolation decision.
2. Create separate production Supabase project.
3. Apply normalized schema + RLS migrations.
4. Add Host Auth and ownership checks.
5. Add respondent/public token server functions.
6. Port Event persistence from staging adapter to production repository/data layer without changing UI flow.
7. Run isolation/security tests.
8. Run full browser acceptance.
9. Only after green foundation: AI provider integration.
10. Only after AI foundation is stable: media storage.

Production hosting provider, data retention, full privacy architecture, offline fallback, billing and System Admin remain OPEN.