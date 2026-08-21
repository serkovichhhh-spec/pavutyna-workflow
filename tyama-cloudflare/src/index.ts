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
    `SELECT id, host_id, title, event_type, event_date, venue, hero_names, notes, lifecycle,
            questionnaire_token, public_screen_token, created_at, updated_at
       FROM events WHERE id = ? AND host_id = ? LIMIT 1`
  ).bind(eventId, hostId).first<Record<string, unknown>>();
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseOptions(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function eventView(row: Record<string, unknown>) {
  return {
    id: row.id,
    hostId: row.host_id,
    title: row.title,
    type: row.event_type,
    date: row.event_date,
    venue: row.venue,
    heroNames: row.hero_names,
    notes: row.notes,
    lifecycle: row.lifecycle,
    questionnaireToken: row.questionnaire_token,
    publicToken: row.public_screen_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function questionView(row: Record<string, unknown>) {
  return {
    id: row.id,
    key: row.question_key,
    label: row.label,
    type: row.field_type,
    required: Boolean(row.is_required),
    locked: Boolean(row.is_locked),
    privacyDefault: row.privacy_default,
    options: parseOptions(row.options_json),
    position: row.position,
  };
}

function kitView(row: Record<string, unknown>) {
  return {
    id: row.id,
    eventId: row.event_id,
    sourceResponseId: row.source_response_id,
    category: row.category,
    title: row.title,
    body: row.body,
    status: row.status,
    privacy: row.privacy,
    useful: Boolean(row.useful),
    edited: Boolean(row.edited),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readiness(responses: number, approved: number): number {
  if (approved >= 3 && responses >= 2) return 90;
  if (approved > 0 && responses > 0) return 70;
  if (responses > 0) return 45;
  return 20;
}

function attention(responses: number, approved: number): string[] {
  if (!responses) return ['Надішліть анкету гостям і дочекайтеся перших відповідей.'];
  if (!approved) return ['Перегляньте Event Kit і відберіть матеріал для підготовки.'];
  return ['Матеріал уже можна перевіряти в Репетиції.'];
}

async function createEvent(request: Request, env: Env, hostId: string): Promise<Response> {
  const body = await readJson(request);
  const title = String(body.title || '').trim();
  if (!title) return json({ error: 'Назва події обов’язкова' }, 400);

  const eventId = id();
  const questionnaireId = id();
  const qToken = token();
  const screenToken = token();
  const eventType = String(body.type || body.eventType || 'Подія');
  const formTitle = String(body.questionnaireTitle || `Кілька запитань про ${title}`);
  const formIntro = String(body.questionnaireIntro || 'Не треба писати красиво. Нам важливі живі деталі, які знають саме свої.');
  const questions = [
    ['name', 'Як вас звати?', 'text', 1, 1, 'review_required'],
    ['relation', 'Ким ви доводитеся або як знаєте героїв події?', 'text', 1, 1, 'review_required'],
    ['story', 'Яку історію про них ви згадуєте першою?', 'textarea', 1, 0, 'review_required'],
    ['funny', 'Є смішний епізод, який добре знають свої?', 'textarea', 0, 0, 'review_required'],
    ['emotion', 'Який момент або риса в них вас особливо чіпляє?', 'textarea', 0, 0, 'review_required'],
    ['connection', 'Хто ще з гостей пов’язаний із цією історією?', 'textarea', 0, 0, 'review_required'],
    ['media', 'Є фото або відео до цієї історії? Додайте посилання.', 'url', 0, 0, 'review_required'],
    ['avoid', 'Є тема, яку точно не варто згадувати публічно?', 'textarea', 0, 1, 'host_only'],
    ['consent', 'Чи можна ведучому використати ваші відповіді під час події?', 'select', 1, 1, 'host_only'],
  ] as const;

  const statements = [
    env.DB.prepare(`INSERT INTO events (id, host_id, title, event_type, event_date, venue, hero_names, notes, lifecycle, questionnaire_token, public_screen_token)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'preparing', ?, ?)`)
      .bind(eventId, hostId, title, eventType, body.date || null, body.venue || null, body.heroNames || null, body.notes || null, qToken, screenToken),
    env.DB.prepare(`INSERT INTO questionnaires (id, event_id, title, intro) VALUES (?, ?, ?, ?)`)
      .bind(questionnaireId, eventId, formTitle, formIntro),
    env.DB.prepare(`INSERT INTO live_state (event_id) VALUES (?)`).bind(eventId),
    ...questions.map((q, index) => env.DB.prepare(
      `INSERT INTO questions (id, questionnaire_id, position, question_key, label, field_type, is_required, is_locked, privacy_default, options_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id(), questionnaireId, index, q[0], q[1], q[2], q[3], q[4], q[5], q[2] === 'select' ? JSON.stringify(['Так', 'Ні']) : JSON.stringify([])))
  ];

  await env.DB.batch(statements);
  const row = await eventOwned(env, eventId, hostId);
  return json({ event: row ? eventView(row) : { id: eventId, title } }, 201);
}

async function listEvents(env: Env, hostId: string): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT e.*,
            (SELECT count(*) FROM responses r WHERE r.event_id = e.id) AS response_count,
            (SELECT count(*) FROM kit_items k WHERE k.event_id = e.id AND k.status = 'approved') AS approved_count
       FROM events e WHERE e.host_id = ? ORDER BY e.created_at DESC`
  ).bind(hostId).all<Record<string, unknown>>();
  return json({ events: rows.results.map(row => ({
    ...eventView(row),
    metrics: {
      responses: Number(row.response_count || 0),
      approved: Number(row.approved_count || 0),
      readiness: readiness(Number(row.response_count || 0), Number(row.approved_count || 0)),
    }
  })) });
}

async function eventDetail(env: Env, eventId: string, hostId: string): Promise<Response> {
  const event = await eventOwned(env, eventId, hostId);
  if (!event) return json({ error: 'Не знайдено' }, 404);

  const [form, questions, responses, kit, rehearsal, live, counts] = await Promise.all([
    env.DB.prepare(`SELECT id,title,intro,is_open,created_at,updated_at FROM questionnaires WHERE event_id=? LIMIT 1`).bind(eventId).first<Record<string, unknown>>(),
    env.DB.prepare(`SELECT q.* FROM questions q JOIN questionnaires f ON f.id=q.questionnaire_id WHERE f.event_id=? ORDER BY q.position`).bind(eventId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id, respondent_label, consent, submitted_at FROM responses WHERE event_id=? ORDER BY submitted_at DESC`).bind(eventId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT * FROM kit_items WHERE event_id=? AND status!='removed' ORDER BY created_at DESC`).bind(eventId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT kit_item_id, state, updated_at FROM rehearsal_items WHERE event_id=?`).bind(eventId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT current_item_id, updated_at FROM live_state WHERE event_id=?`).bind(eventId).first<Record<string, unknown>>(),
    env.DB.prepare(`SELECT
      (SELECT count(*) FROM responses WHERE event_id=?) AS response_count,
      (SELECT count(*) FROM kit_items WHERE event_id=? AND status='approved') AS approved_count`).bind(eventId, eventId).first<Record<string, unknown>>(),
  ]);

  const responseCount = Number(counts?.response_count || 0);
  const approvedCount = Number(counts?.approved_count || 0);
  return json({
    event: {
      ...eventView(event),
      metrics: { responses: responseCount, approved: approvedCount, readiness: readiness(responseCount, approvedCount) },
      attention: attention(responseCount, approvedCount),
    },
    questionnaire: {
      id: form?.id,
      title: form?.title,
      intro: form?.intro,
      isOpen: Boolean(form?.is_open),
      questions: questions.results.map(questionView),
      updatedAt: form?.updated_at,
    },
    responses: responses.results.map(r => ({ id: r.id, respondentLabel: r.respondent_label, consent: r.consent, submittedAt: r.submitted_at })),
    kit: kit.results.map(kitView),
    rehearsal: rehearsal.results.map(r => ({ kitItemId: r.kit_item_id, state: r.state, updatedAt: r.updated_at })),
    live: { currentItemId: live?.current_item_id || null, updatedAt: live?.updated_at || null },
  });
}

async function updateQuestionnaire(request: Request, env: Env, eventId: string, hostId: string): Promise<Response> {
  if (!(await eventOwned(env, eventId, hostId))) return json({ error: 'Не знайдено' }, 404);
  const form = await env.DB.prepare(`SELECT id FROM questionnaires WHERE event_id=? LIMIT 1`).bind(eventId).first<{ id: string }>();
  if (!form) return json({ error: 'Анкету не знайдено' }, 404);
  const body = await readJson(request);
  const incoming = Array.isArray(body.questions) ? body.questions as Array<Record<string, unknown>> : [];
  const statements = incoming
    .filter(q => q.id && typeof q.label === 'string' && String(q.label).trim())
    .map(q => env.DB.prepare(`UPDATE questions SET label=? WHERE id=? AND questionnaire_id=?`).bind(String(q.label).trim(), String(q.id), form.id));
  if (typeof body.title === 'string' || typeof body.intro === 'string' || 'isOpen' in body) {
    await env.DB.prepare(`UPDATE questionnaires SET
      title=COALESCE(?,title), intro=COALESCE(?,intro), is_open=COALESCE(?,is_open), updated_at=datetime('now') WHERE id=?`)
      .bind(typeof body.title === 'string' ? body.title : null, typeof body.intro === 'string' ? body.intro : null,
        'isOpen' in body ? (body.isOpen ? 1 : 0) : null, form.id).run();
  }
  if (statements.length) await env.DB.batch(statements);
  await env.DB.prepare(`UPDATE questionnaires SET updated_at=datetime('now') WHERE id=?`).bind(form.id).run();
  return eventDetail(env, eventId, hostId);
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
  const item = await env.DB.prepare(`SELECT * FROM kit_items WHERE id=? AND event_id=?`).bind(itemId, eventId).first<Record<string, unknown>>();
  return json({ item: item ? kitView(item) : null });
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
    `SELECT e.id, e.title, q.id AS questionnaire_id, q.title AS questionnaire_title, q.intro, q.is_open
       FROM events e JOIN questionnaires q ON q.event_id=e.id
      WHERE e.questionnaire_token=? LIMIT 1`
  ).bind(publicToken).first<Record<string, unknown>>();
  if (!event) return json({ error: 'Анкету не знайдено' }, 404);

  const questionRows = await env.DB.prepare(`SELECT * FROM questions WHERE questionnaire_id=? ORDER BY position`).bind(event.questionnaire_id).all<Record<string, unknown>>();
  if (request.method === 'GET') {
    return json({
      event: { id: event.id, title: event.title },
      questionnaire: { id: event.questionnaire_id, title: event.questionnaire_title, intro: event.intro },
      isOpen: Boolean(event.is_open),
      questions: questionRows.results.map(questionView),
    });
  }

  if (!event.is_open) return json({ error: 'Анкету закрито' }, 409);
  const body = await readJson(request);
  const answers = Array.isArray(body.answers) ? body.answers as Array<{ questionId?: string; value?: unknown }> : [];
  const allowedQuestions = new Map(questionRows.results.map(q => [String(q.id), q]));
  const answerRows = answers
    .map(a => ({ questionId: String(a.questionId || ''), value: String(a.value ?? '').trim() }))
    .filter(a => a.questionId && allowedQuestions.has(a.questionId));
  const nameAnswer = answerRows.find(a => allowedQuestions.get(a.questionId)?.question_key === 'name');
  const respondentLabel = String(body.respondentLabel || nameAnswer?.value || '').trim();
  if (!respondentLabel) return json({ error: 'Ім’я обов’язкове' }, 400);

  for (const question of questionRows.results) {
    if (!question.is_required) continue;
    const answer = answerRows.find(a => a.questionId === String(question.id));
    if (!answer?.value) return json({ error: `Потрібна відповідь: ${String(question.label)}` }, 400);
  }

  const consentAnswer = answerRows.find(a => allowedQuestions.get(a.questionId)?.question_key === 'consent');
  const consent = String(body.consent || consentAnswer?.value || '');
  const responseId = id();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO responses (id, event_id, questionnaire_id, respondent_label, consent) VALUES (?, ?, ?, ?, ?)`)
      .bind(responseId, event.id, event.questionnaire_id, respondentLabel, consent),
    ...answerRows.filter(a => a.value).map(a => env.DB.prepare(`INSERT INTO response_answers (id, response_id, question_id, answer_text) VALUES (?, ?, ?, ?)`)
      .bind(id(), responseId, a.questionId, a.value))
  ]);

  const usable = answerRows.filter(a => {
    const key = allowedQuestions.get(a.questionId)?.question_key;
    return a.value && key !== 'name' && key !== 'consent';
  });
  const material = usable.map(a => a.value).join(' · ').slice(0, 1800);
  if (material) {
    await env.DB.prepare(
      `INSERT INTO kit_items (id, event_id, source_response_id, category, title, body, privacy)
       VALUES (?, ?, ?, 'stories', ?, ?, ?)`
    ).bind(id(), event.id, responseId, `Контекст від ${respondentLabel}`, material, consent.toLowerCase() === 'ні' ? 'host_only' : 'review_required').run();
  }
  return json({ ok: true, message: 'Дякуємо. Контекст збережено.' }, 201);
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
  ).bind(publicToken).first<Record<string, unknown>>();
  if (!row) return json({ error: 'Екран не знайдено' }, 404);
  return json({
    eventId: row.event_id,
    eventTitle: row.event_title,
    currentItemId: row.item_title ? row.current_item_id : null,
    item: row.item_title ? { id: row.current_item_id, title: row.item_title, body: row.item_body } : null,
  });
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
      const questionnaire = path.match(/^\/api\/events\/([^/]+)\/questionnaire$/);
      if (questionnaire && request.method === 'PUT') return updateQuestionnaire(request, env, questionnaire[1], hostId);
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
