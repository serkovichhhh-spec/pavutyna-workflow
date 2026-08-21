# ТЯМА — Cloudflare foundation

Статус: **APPROVED — current production foundation v0.2**. Це поточний infrastructure layer, а не незворотний vendor lock-in. Validated staging flow у `tyama-staging/` не змінюється до окремого remote acceptance.

## Goal

Перенести core persistence/API ТЯМИ на zero/low-cost stack без окремого Supabase project:

- Cloudflare Workers — API/runtime;
- Cloudflare D1 — relational persistence;
- server-side sessions — Host boundary;
- opaque per-Event tokens — respondent flow і Public Screen;
- Event isolation у кожному host query + DB integrity guards;
- без real AI, R2/media та зовнішнього auth provider на цьому кроці.

## Current foundation

`migrations/0001_core.sql` створює:

`hosts → sessions → events → questionnaires → questions → responses → response_answers → kit_items → rehearsal_items → live_state`.

`migrations/0002_event_integrity.sql` додає DB-level guards проти cross-Event / cross-questionnaire зв’язків.

`src/index.ts` реалізує core API contract, сумісний із validated staging UI:

- `GET /health`
- `GET /api/events`
- `POST /api/events`
- `GET /api/events/:eventId`
- `PUT /api/events/:eventId/questionnaire`
- `PATCH /api/events/:eventId/kit/:itemId`
- `PATCH /api/events/:eventId/rehearsal`
- `POST /api/events/:eventId/live`
- `GET|POST /api/public/questionnaire/:token`
- `GET /api/public/screen/:token`

Host routes вимагають cookie `tyama_session`; у DB зберігається тільки SHA-256 hash token-а.

## Validation gate

`npm run check` та GitHub Actions перевіряють:

- generated Wrangler bindings;
- TypeScript;
- synthetic staging→D1 migration adapter;
- D1 migrations та negative cross-Event integrity checks;
- реальний HTTP core flow через `wrangler dev`;
- deploy dry-run.

## Local development

1. Install dependencies: `npm install`
2. Generate Worker binding types: `npx wrangler types`
3. Apply local migrations: `npx wrangler d1 migrations apply tyama-core --local`
4. Apply local-only seed: `npx wrangler d1 execute tyama-core --local --file ./dev/seed.sql`
5. Run: `npx wrangler dev`

Local test session cookie:

`tyama_session=tyama-dev-session`

`dev/seed.sql` must never be applied remotely.

## Remote bootstrap

`npm run bootstrap:remote` automates the first remote foundation bootstrap: resolve/create D1, write its database id to Wrangler config, apply migrations, run deploy dry-run and deploy only after validation succeeds.

Local seed and staging personal-data export are not deployed by this bootstrap.

## Auth boundary — OPEN transport

Cloudflare Workers + D1 are APPROVED. The production Host authentication transport/provider is still **OPEN**.

The core does not lock ТЯМА into an email/OAuth vendor. `sessions` is the stable application boundary. A later auth transport only needs to create/revoke sessions; Event, questionnaire, Kit and Live APIs do not change.

For production sessions:

- token generated with Web Crypto;
- only hash stored in D1;
- cookie must be `HttpOnly`, `Secure`, `SameSite=Lax` or stricter;
- session expiry enforced server-side;
- no API keys/system settings exposed to Host UI.

## Privacy / Public Screen invariant

A Live item may be shown only when both are true:

- `status = approved`
- `privacy = public_allowed`

The Worker checks this before changing `live_state`, and Public Screen checks it again when reading state.

## What is intentionally not here yet

- production signup/login transport;
- AI provider/model integration;
- R2/media uploads;
- Vectorize;
- analytics/CRM/booking;
- system-admin UI.

These stay out of scope until the remote foundation acceptance itself is green.
