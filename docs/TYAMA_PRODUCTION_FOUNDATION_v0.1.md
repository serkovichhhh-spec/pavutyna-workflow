# ТЯМА — Production Foundation v0.2

Status: **PROPOSED CHANGE**

## Current state

Validated staging MVP remains available on GitHub Pages and uses a temporary Supabase staging harness with one JSON state row. That environment is accepted for UX validation but is not a production persistence model.

A Cloudflare foundation candidate now exists in `tyama-cloudflare/` and is intentionally isolated from validated staging.

## Problem

The previous proposal assumed a separate paid Supabase production project. Current resource constraints make that a poor fit now. Promoting the existing mixed Supabase project would also inherit unrelated public tables and security debt.

## Proposed solution

Use **Cloudflare Workers + D1** as the production-like foundation candidate.

- Workers: Host/public API runtime.
- D1: normalized Event-scoped relational persistence.
- server-side session records: Host access boundary.
- opaque questionnaire/Public Screen tokens: anonymous scoped access.
- R2: BACKLOG until media storage is required.
- Workers AI / AI Gateway: BACKLOG until real AI integration is approved.
- Host authentication transport/provider: **OPEN**. Session boundary is implemented, but Google/email/OAuth choice is not silently approved.
- validated staging remains unchanged until the Cloudflare candidate passes acceptance.

## Why better

- no separate paid database project required for the current phase;
- removes whole-Event JSON writes and staging race conditions;
- Event isolation is enforced in both API ownership checks and D1 integrity triggers;
- Worker API preserves the validated Host/Public contract instead of forcing a UI rewrite;
- D1 schema preserves existing event/questionnaire context (`heroNames`, notes, lifecycle, questionnaire title/intro, question key/locked/privacyDefault, URL fields);
- migration adapter can convert staging state without committing personal responses to the public repository;
- future R2/AI additions can use Cloudflare bindings without changing Host/Public access semantics.

## Risks

- D1 is a platform choice and remains **PROPOSED CHANGE** until explicitly approved as the production infrastructure decision.
- auth transport is still OPEN; a real Host login provider must be selected before production user onboarding.
- realtime/offline requirements remain OPEN and may later require Durable Objects or another coordination layer.
- data retention, deletion policy and legal privacy architecture remain OPEN.

## Impact

Foundation only. No new Host feature and no change to the validated MVP flow.

---

# Executable specification

## Goal

Replace temporary staging persistence with a low-operational-load, Event-isolated backend candidate while preserving:

`Host -> Event -> Questionnaire -> Responses -> Event Kit -> Rehearsal -> Live -> Public Screen`.

## Required behaviour

1. Host requests require a valid server-side session.
2. Every Host Event read/write is scoped by `host_id`.
3. Cross-Host Event IDs return not-found behaviour.
4. Questionnaire token resolves to exactly one Event/questionnaire.
5. Submitted answers are accepted only for questions belonging to that questionnaire.
6. D1 rejects Event/questionnaire mismatches even if application code regresses.
7. Event Kit mutations update individual rows, never a whole Event JSON document.
8. Live can show only `approved + public_allowed` items.
9. Public Screen returns only a sanitized live payload.
10. Questionnaire/Public Screen remain anonymous token-scoped surfaces.
11. AI failure or absence cannot block the core Event workflow.
12. No infrastructure controls appear in Host Dashboard.

## Data / permissions

Current D1 model:

- `hosts`
- `sessions`
- `events`
- `questionnaires`
- `questions`
- `responses`
- `response_answers`
- `kit_items`
- `rehearsal_items`
- `live_state`

Event context preserved in schema:
- event type/date/venue;
- hero names;
- notes;
- lifecycle;
- questionnaire title/intro/open state;
- question key/type/required/locked/privacy default/options.

Integrity triggers enforce:
- response questionnaire belongs to response Event;
- answer question belongs to response questionnaire;
- source response for Kit belongs to same Event;
- rehearsal item belongs to same Event;
- live item belongs to same Event.

## User flow

### Host

1. Authenticate through future approved auth transport and receive server session.
2. See only owned Events.
3. Create Event.
4. Edit questionnaire labels/context.
5. Share respondent URL.
6. Receive responses in the correct Event.
7. Review/edit/privacy/approve Event Kit items.
8. Mark rehearsal readiness.
9. Enter Live.
10. Show eligible item or clear Public Screen.

### Respondent

1. Open token URL.
2. See only that Event questionnaire.
3. Submit required answers.
4. Receive success state.
5. Gain no Host access.

### Public Screen

1. Open public token URL.
2. Receive blank state or one sanitized approved/public item.
3. Never receive raw responses or Host-only context.

## Edge cases

- invalid/closed questionnaire token -> safe error;
- forged question ID from another questionnaire -> rejected;
- Event A + questionnaire B persistence attempt -> D1 trigger rejection;
- Host B requests Host A Event -> 404-like response;
- item loses approval/privacy -> no longer eligible for Public Screen;
- simultaneous Kit mutations -> row-level D1 updates, no shared JSON overwrite;
- acceptance-generated Events -> excluded by migration adapter unless explicitly requested;
- generated migration SQL may contain personal data and is ignored by git under `tyama-cloudflare/tmp/`.

## Acceptance criteria

1. Wrangler generated bindings succeed.
2. TypeScript typecheck succeeds.
3. D1 migrations apply locally.
4. D1 cross-Event negative integrity test passes.
5. Local HTTP E2E passes:
   `Host session -> Event -> public questionnaire -> submit -> Event Kit -> questionnaire edit -> privacy -> approve -> rehearsal -> live -> Public Screen -> clear`.
6. Cross-Host Event access returns not-found.
7. Public Screen exposes only sanitized approved/public content.
8. Worker deploy dry-run succeeds.
9. migration adapter preserves validated staging context without committing real data.
10. validated staging remains unaffected.

## What must not change

- public name: ТЯМА;
- Event as isolated central context;
- Host Dashboard as Host surface;
- questionnaire mobile-first;
- Event Kit desktop-first;
- Host/Public Screen separation;
- privacy semantics;
- Host is final decision-maker;
- no ChatGPT/system/backend/admin exposure to Host;
- no production AI or media added in this foundation task.

## Tests

Automated Cloudflare gate must cover:
- generated binding/type compatibility;
- migrations;
- database integrity rejection tests;
- Host ownership isolation;
- public questionnaire GET/POST;
- questionnaire edit compatibility;
- Event context serialization compatibility;
- Event Kit privacy/approval;
- rehearsal;
- Live show/blank;
- Public Screen sanitization;
- Wrangler dry-run.

## Implementation order

1. Keep staging frozen as accepted UX reference.
2. Bring Cloudflare D1 schema/API to contract parity. **IN PROGRESS**
3. Keep CI green with local HTTP E2E and negative isolation tests. **IN PROGRESS**
4. Validate staging-to-D1 migration adapter using synthetic data.
5. Resolve Host auth transport. **OPEN**
6. Create remote D1/Worker only after Cloudflare infrastructure decision is explicitly approved and account write access is available.
7. Connect validated frontend to candidate Worker in a separate acceptance environment.
8. Run full browser acceptance again.
9. Only after green foundation: real AI.
10. Media storage after AI/core persistence is stable.

Production domain, auth provider, retention/deletion policy, offline fallback, billing and System Admin remain **OPEN**.
