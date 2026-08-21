const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function id(): string {
  return crypto.randomUUID();
}

function token(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

function cookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

async function requireHost(request: Request, env: Env): Promise<string | null> {
  const raw = cookie(request, 'tyama_session');
  if (!raw) return null;
  const hash = await sha256(raw);
  const row = await env.DB.prepare(
    `SELECT host_id FROM sessions WHERE token_hash = ? AND expires_at > datetime('now') LIMIT 1`
  ).bind(hash).first<{ host_id: string }>();
  return row?.host_id || null;
}

async function eventOwned(env: Env, eventId: string, hostId: string) {
  return env.DB.prepare(
    `SELECT id, host_id, title, event_type, event_date, venue, questionnaire_token, public_screen_token, created_at, updated_at
       FROM events WHERE id = ? AND host_id = ? LIMIT 1`
  ).bind(eventId, hostId).first();
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function createEvent(request: Request, env: Env, hostId: string): Promise<Response> {
  const body = await readJson(request);
  const title = String(body.title || '').trim();
  if (!title) return json({ error: 'Назва події обов’язкова' }, 400);

  const eventId = id();
  const questionnaireId = id();
  const qToken = token();
  const screenToken = token();
  const questions = [
    ['Як вас звати?', 'text', 1],
    ['Що варто знати ведучому про вас або вашу роль у цій події?', 'textarea', 1],
    ['Яка історія або деталь може бути корисною ведучому?', 'textarea', 0],
    ['Чого точно не варто використовувати публічно?', 'textarea', 0],
    ['Чи можна використовувати ваші відповіді під час події?', 'select', 1],
  ] as const;

  const statements = [
    env.DB.prepare(`INSERT INTO events (id, host_id, title, event_type, questionnaire_token, public_screen_token) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(eventId, hostId, title, String(body.eventType || 'Подія'), qToken, screenToken),
    env.DB.prepare(`INSERT INTO questionnaires (id, event_id) VALUES (?, ?)`)
      .bind(questionnaireId, eventId),
    env.DB.prepare(`INSERT INTO live_state (event_id) VALUES (?)`).bind(eventId),
    ...questions.map((q, index) => env.DB.prepare(
      `INSERT INTO questions (id, questionnaire_id, position, label, field_type, is_required, options_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id(), questionnaireId, index, q[0], q[1], q[2], q[1] === 'select' ? JSON.stringify(['Так', 'Ні']) : null))
  ];

  await env.DB.batch(statements);
  return json({ event: { id: eventId, title, questionnaireToken: qToken, publicToken: screenToken } }, 201);
}

async function listEvents(env: Env, hostId: string): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT e.id, e.title, e.event_type, e.event_date, e.venue, e.created_at,
            (SELECT count(*) FROM responses r WHERE r.event_id = e.id) AS responses,
            (SELECT count(*) FROM kit_items k WHERE k.event_id = e.id AND k.status = 'approved') AS approved
       FROM events e WHERE e.host_id = ? ORDER BY e.created_at DESC`
  ).bind(hostId).all();
  return json({ events: rows.results });
}

async function eventDetail(env: Env, eventId: string, hostId: string): Promise<Response> {
  const event = await eventOwned(env, eventId, hostId);
  if (!event) return json({ error: 'Не знайдено' }, 404);

  const [questions, responses, kit, rehearsal, live] = await Promise.all([
    env.DB.prepare(`SELECT q.* FROM questions q JOIN questionnaires f ON f.id=q.questionnaire_id WHERE f.event_id=? ORDER BY q.position`).bind(eventId).all(),
    env.DB.prepare(`SELECT id, respondent_label, consent, submitted_at FROM responses WHERE event_id=? ORDER BY submitted_at DESC`).bind(eventId).all(),
    env.DB.prepare(`SELECT * FROM kit_items WHERE event_id=? AND status!='removed' ORDER BY created_at DESC`).bind(eventId).all(),
    env.DB.prepare(`SELECT kit_item_id, state, updated_at FROM rehearsal_items WHERE event_id=?`).bind(eventId).all(),
    env.DB.prepare(`SELECT current_item_id, updated_at FROM live_state WHERE event_id=?`).bind(eventId).first(),
  ]);

  return json({ event, questionnaire: { questions: questions.results }, responses: responses.results, kit: kit.results, rehearsal: rehearsal.results, live });
}

async function patchKit(request: Request, env: Env, eventId: string, itemId: string, hostId: string): Promise<Response> {
  if (!(await eventOwned(env, eventId, hostId))) return json({ error: 'Не знайдено' }, 404);
  const body = await readJson(request);
  const allowed = ['title', 'body', 'status', 'privacy', 'useful', 'edited'] as const;
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (!(key in body)) continue;
    sets.push(`${key} = ?`);
    values.push(typeof body[key] === 'boolean' ? (body[key] ? 1 : 0) : body[key]);
  }
  if (!sets.length) return json({ error: 'Немає змін' }, 400);
  sets.push(`updated_at = datetime('now')`);
  const result = await env.DB.prepare(`UPDATE kit_items SET ${sets.join(', ')} WHERE id = ? AND event_id = ?`).bind(...values, itemId, eventId).run();
  if (!result.meta.changes) return json({ error: 'Не знайдено' }, 404);
  const item = await env.DB.prepare(`SELECT * FROM kit_items WHERE id=? AND event_id=?`).bind(itemId, eventId).first();
  return json({ item });
}

async function patchRehearsal(request: Request, env: Env, eventId: string, hostId: string): Promise<Response> {
  if (!(await eventOwned(env, eventId, hostId))) return json({ error: 'Не знайдено' }, 404);
  const body = await readJson(request);
  const itemId = String(body.itemId || '');
  const state = body.state === 'ready' ? 'ready' : 'pending';
  const item = await env.DB.prepare(`SELECT id FROM kit_items WHERE id=? AND event_id=? AND status='approved'`).bind(itemId, eventId).first();
  if (!item) return json({ error: 'Матеріал не відібрано' }, 400);
  await env.DB.prepare(
    `INSERT INTO rehearsal_items (event_id, kit_item_id, state, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(event_id, kit_item_id) DO UPDATE SET state=excluded.state, updated_at=datetime('now')`
  ).bind(eventId, itemId, state).run();
  return json({ itemId, state });
}

async function liveAction(request: Request, env: Env, eventId: string, hostId: string): Promise<Response> {
  if (!(await eventOwned(env, eventId, hostId))) return json({ error: 'Не знайдено' }, 404);
  const body = await readJson(request);
  if (body.action === 'blank') {
    await env.DB.prepare(`UPDATE live_state SET current_item_id=NULL, updated_at=datetime('now') WHERE event_id=?`).bind(eventId).run();
    return json({ currentItemId: null });
  }
  if (body.action !== 'show_item') return json({ error: 'Невідома дія' }, 400);
  const itemId = String(body.itemId || '');
  const allowed = await env.DB.prepare(
    `SELECT id FROM kit_items WHERE id=? AND event_id=? AND status='approved' AND privacy='public_allowed'`
  ).bind(itemId, eventId).first();
  if (!allowed) return json({ error: 'Цей матеріал не дозволено показувати публічно' }, 403);
  await env.DB.prepare(`UPDATE live_state SET current_item_id=?, updated_at=datetime('now') WHERE event_id=?`).bind(itemId, eventId).run();
  return json({ currentItemId: itemId });
}

async function publicQuestionnaire(request: Request, env: Env, publicToken: string): Promise<Response> {
  const event = await env.DB.prepare(
    `SELECT e.id, e.title, q.id AS questionnaire_id, q.is_open
       FROM events e JOIN questionnaires q ON q.event_id=e.id
      WHERE e.questionnaire_token=? LIMIT 1`
  ).bind(publicToken).first<{ id: string; title: string; questionnaire_id: string; is_open: number }>();
  if (!event) return json({ error: 'Анкету не знайдено' }, 404);

  if (request.method === 'GET') {
    const questions = await env.DB.prepare(`SELECT id, position, label, field_type, is_required, options_json FROM questions WHERE questionnaire_id=? ORDER BY position`).bind(event.questionnaire_id).all();
    return json({ event: { id: event.id, title: event.title }, isOpen: Boolean(event.is_open), questions: questions.results });
  }

  if (!event.is_open) return json({ error: 'Анкету закрито' }, 409);
  const body = await readJson(request);
  const respondentLabel = String(body.respondentLabel || '').trim();
  const answers = Array.isArray(body.answers) ? body.answers as Array<{ questionId?: string; value?: unknown }> : [];
  if (!respondentLabel) return json({ error: 'Ім’я обов’язкове' }, 400);

  const responseId = id();
  const answerRows = answers
    .map(a => ({ questionId: String(a.questionId || ''), value: String(a.value || '').trim() }))
    .filter(a => a.questionId && a.value);
  const consent = String(body.consent || '');

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO responses (id, event_id, questionnaire_id, respondent_label, consent) VALUES (?, ?, ?, ?, ?)`)
      .bind(responseId, event.id, event.questionnaire_id, respondentLabel, consent),
    ...answerRows.map(a => env.DB.prepare(`INSERT INTO response_answers (id, response_id, question_id, answer_text) VALUES (?, ?, ?, ?)`)
      .bind(id(), responseId, a.questionId, a.value))
  ]);

  const material = answerRows.map(a => a.value).join(' · ').slice(0, 1800);
  if (material) {
    await env.DB.prepare(
      `INSERT INTO kit_items (id, event_id, source_response_id, category, title, body, privacy)
       VALUES (?, ?, ?, 'stories', ?, ?, ?)`
    ).bind(id(), event.id, responseId, `Контекст від ${respondentLabel}`, material, consent.toLowerCase() === 'ні' ? 'host_only' : 'review_required').run();
  }
  return json({ ok: true }, 201);
}

async function publicScreen(env: Env, publicToken: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT e.id AS event_id, e.title AS event_title, l.current_item_id,
            k.title AS item_title, k.body AS item_body
       FROM events e
       LEFT JOIN live_state l ON l.event_id=e.id
       LEFT JOIN kit_items k ON k.id=l.current_item_id
          AND k.event_id=e.id AND k.status='approved' AND k.privacy='public_allowed'
      WHERE e.public_screen_token=? LIMIT 1`
  ).bind(publicToken).first();
  if (!row) return json({ error: 'Екран не знайдено' }, 404);
  return json(row);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === 'GET' && path === '/health') return json({ ok: true, service: 'tyama-core' });

      const publicQ = path.match(/^\/api\/public\/questionnaire\/([^/]+)$/);
      if (publicQ && (request.method === 'GET' || request.method === 'POST')) return publicQuestionnaire(request, env, publicQ[1]);
      const publicS = path.match(/^\/api\/public\/screen\/([^/]+)$/);
      if (publicS && request.method === 'GET') return publicScreen(env, publicS[1]);

      const hostId = await requireHost(request, env);
      if (!hostId) return json({ error: 'Потрібен вхід ведучого' }, 401);

      if (path === '/api/events' && request.method === 'GET') return listEvents(env, hostId);
      if (path === '/api/events' && request.method === 'POST') return createEvent(request, env, hostId);

      const detail = path.match(/^\/api\/events\/([^/]+)$/);
      if (detail && request.method === 'GET') return eventDetail(env, detail[1], hostId);
      const kit = path.match(/^\/api\/events\/([^/]+)\/kit\/([^/]+)$/);
      if (kit && request.method === 'PATCH') return patchKit(request, env, kit[1], kit[2], hostId);
      const rehearsal = path.match(/^\/api\/events\/([^/]+)\/rehearsal$/);
      if (rehearsal && request.method === 'PATCH') return patchRehearsal(request, env, rehearsal[1], hostId);
      const live = path.match(/^\/api\/events\/([^/]+)\/live$/);
      if (live && request.method === 'POST') return liveAction(request, env, live[1], hostId);

      return json({ error: 'Маршрут не знайдено' }, 404);
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', message: 'request_failed', error: error instanceof Error ? error.message : String(error) }));
      return json({ error: 'Внутрішня помилка сервісу' }, 500);
    }
  }
} satisfies ExportedHandler<Env>;
