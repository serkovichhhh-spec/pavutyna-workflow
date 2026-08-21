const BASE = String(process.env.TYAMA_REMOTE_BASE || '').replace(/\/$/, '');
const SESSION = String(process.env.TYAMA_ACCEPTANCE_SESSION_TOKEN || '');
if (!BASE || !SESSION) throw new Error('TYAMA_REMOTE_BASE and TYAMA_ACCEPTANCE_SESSION_TOKEN are required');

async function api(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { response, data };
}

const hostHeaders = { cookie: `tyama_session=${SESSION}` };

const health = await api('/health');
if (!health.response.ok || health.data?.ok !== true) throw new Error(`Health failed: ${health.response.status}`);

const created = await api('/api/events', {
  method: 'POST',
  headers: hostHeaders,
  body: {
    title: `Acceptance Remote ${Date.now()}`,
    type: 'Весілля',
    heroNames: 'Марта та Андрій',
    notes: 'Remote acceptance context',
  },
});
if (created.response.status !== 201) throw new Error(`Create Event failed: ${created.response.status} ${JSON.stringify(created.data)}`);

const eventId = created.data.event.id;
const qToken = created.data.event.questionnaireToken;
const screenToken = created.data.event.publicToken;

const questionnaire = await api(`/api/public/questionnaire/${qToken}`);
if (!questionnaire.response.ok || !questionnaire.data.questions?.length) throw new Error('Public questionnaire did not load');

const answers = questionnaire.data.questions.map((question, index) => ({
  questionId: question.id,
  value: question.key === 'name'
    ? 'Remote Test Guest'
    : question.key === 'consent'
      ? 'Так'
      : question.key === 'media'
        ? 'https://example.com/acceptance-media'
        : `Remote context ${index}`,
}));

const submitted = await api(`/api/public/questionnaire/${qToken}`, {
  method: 'POST',
  body: { respondentLabel: 'Remote Test Guest', answers },
});
if (submitted.response.status !== 201) throw new Error(`Submit failed: ${submitted.response.status} ${JSON.stringify(submitted.data)}`);

const detail = await api(`/api/events/${eventId}`, { headers: hostHeaders });
if (!detail.response.ok || detail.data.responses?.length !== 1 || !detail.data.kit?.length) throw new Error('Response did not reach Event Kit');
if (detail.data.event?.heroNames !== 'Марта та Андрій') throw new Error('Event context contract mismatch');
const itemId = detail.data.kit[0].id;

const questionnaireUpdate = await api(`/api/events/${eventId}/questionnaire`, {
  method: 'PUT',
  headers: hostHeaders,
  body: {
    questions: detail.data.questionnaire.questions.map((q, index) => index === 2 ? { ...q, label: `${q.label} — remote` } : q),
  },
});
if (!questionnaireUpdate.response.ok) throw new Error('Questionnaire edit failed');

for (const body of [
  { privacy: 'public_allowed', edited: true },
  { status: 'approved', edited: true },
]) {
  const result = await api(`/api/events/${eventId}/kit/${itemId}`, { method: 'PATCH', headers: hostHeaders, body });
  if (!result.response.ok) throw new Error(`Kit mutation failed: ${result.response.status}`);
}

const rehearsal = await api(`/api/events/${eventId}/rehearsal`, {
  method: 'PATCH', headers: hostHeaders, body: { itemId, state: 'ready' },
});
if (!rehearsal.response.ok) throw new Error('Rehearsal failed');

const shown = await api(`/api/events/${eventId}/live`, {
  method: 'POST', headers: hostHeaders, body: { action: 'show_item', itemId },
});
if (!shown.response.ok) throw new Error(`Live show failed: ${shown.response.status}`);

const screen = await api(`/api/public/screen/${screenToken}`);
if (!screen.response.ok || !screen.data.item?.title) throw new Error('Public Screen did not receive eligible item');

const blank = await api(`/api/events/${eventId}/live`, {
  method: 'POST', headers: hostHeaders, body: { action: 'blank' },
});
if (!blank.response.ok) throw new Error('Live blank failed');

const cleared = await api(`/api/public/screen/${screenToken}`);
if (cleared.data.item !== null || cleared.data.currentItemId !== null) throw new Error('Public Screen did not clear');

console.log(JSON.stringify({ status: 'PASS', eventId, respondent: true, kit: true, rehearsal: true, live: true, publicScreen: true }));
