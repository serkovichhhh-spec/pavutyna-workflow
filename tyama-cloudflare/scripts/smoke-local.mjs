import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const cwd = new URL('..', import.meta.url).pathname;
const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(args) {
  execFileSync(npx, ['wrangler', ...args], { cwd, stdio: 'inherit' });
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function waitForHealth() {
  let last;
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) return;
      last = new Error(`health ${response.status}`);
    } catch (error) {
      last = error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw last || new Error('Worker did not become ready');
}

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
  const data = text ? JSON.parse(text) : null;
  return { response, data };
}

console.log('Preparing local D1...');
run(['d1', 'migrations', 'apply', 'tyama-core', '--local']);
run(['d1', 'execute', 'tyama-core', '--local', '--command', `
DELETE FROM response_answers;
DELETE FROM rehearsal_items;
DELETE FROM live_state;
DELETE FROM kit_items;
DELETE FROM responses;
DELETE FROM questions;
DELETE FROM questionnaires;
DELETE FROM events;
DELETE FROM sessions;
DELETE FROM hosts;
`]);
run(['d1', 'execute', 'tyama-core', '--local', '--file', './dev/seed.sql']);
run(['d1', 'execute', 'tyama-core', '--local', '--command', `
INSERT INTO hosts (id, email, display_name) VALUES ('host_other', 'other@tyama.local', 'Інший ведучий');
INSERT INTO sessions (id, host_id, token_hash, expires_at)
VALUES ('session_other', 'host_other', '${hash('tyama-other-session')}', '2099-01-01T00:00:00Z');
`]);

const child = spawn(npx, ['wrangler', 'dev', '--local', '--port', String(PORT)], {
  cwd,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let workerLog = '';
child.stdout.on('data', chunk => { workerLog += chunk.toString(); process.stdout.write(chunk); });
child.stderr.on('data', chunk => { workerLog += chunk.toString(); process.stderr.write(chunk); });

try {
  await waitForHealth();
  const hostHeaders = { cookie: 'tyama_session=tyama-dev-session' };
  const otherHeaders = { cookie: 'tyama_session=tyama-other-session' };

  const created = await api('/api/events', {
    method: 'POST',
    headers: hostHeaders,
    body: { title: 'Cloudflare E2E', type: 'Весілля', heroNames: 'Марта та Андрій', notes: 'Тестовий контекст' },
  });
  if (created.response.status !== 201) throw new Error(`Create Event failed: ${created.response.status} ${JSON.stringify(created.data)}`);
  const eventId = created.data.event.id;
  const qToken = created.data.event.questionnaireToken;
  const screenToken = created.data.event.publicToken;

  const foreign = await api(`/api/events/${eventId}`, { headers: otherHeaders });
  if (foreign.response.status !== 404) throw new Error(`Event isolation failed: expected 404, got ${foreign.response.status}`);

  const questionnaire = await api(`/api/public/questionnaire/${qToken}`);
  if (!questionnaire.response.ok || !questionnaire.data.questions?.length) throw new Error('Public questionnaire did not load');
  if (!questionnaire.data.questions.some(q => q.key === 'media' && q.type === 'url')) throw new Error('Validated questionnaire context was not preserved');

  const answers = questionnaire.data.questions.map((question, index) => ({
    questionId: question.id,
    value: question.key === 'name' ? 'Олена' : question.key === 'consent' ? 'Так' : question.key === 'media' ? 'https://example.com/media' : `Контекст ${index}`,
  }));
  const submitted = await api(`/api/public/questionnaire/${qToken}`, {
    method: 'POST',
    body: { respondentLabel: 'Олена', answers },
  });
  if (submitted.response.status !== 201) throw new Error(`Questionnaire submit failed: ${submitted.response.status} ${JSON.stringify(submitted.data)}`);

  const detail = await api(`/api/events/${eventId}`, { headers: hostHeaders });
  if (!detail.response.ok || detail.data.responses.length !== 1 || detail.data.kit.length < 1) throw new Error('Response did not reach Event Kit');
  if (detail.data.event.heroNames !== 'Марта та Андрій') throw new Error('Event context was not preserved in Host API');
  if (!detail.data.event.metrics || typeof detail.data.event.metrics.readiness !== 'number') throw new Error('Validated Host metrics contract is missing');
  const itemId = detail.data.kit[0].id;

  const editedLabel = `${detail.data.questionnaire.questions[2].label} — тест`;
  const questionnaireUpdate = await api(`/api/events/${eventId}/questionnaire`, {
    method: 'PUT',
    headers: hostHeaders,
    body: { questions: detail.data.questionnaire.questions.map((q, index) => index === 2 ? { ...q, label: editedLabel } : q) },
  });
  if (!questionnaireUpdate.response.ok || questionnaireUpdate.data.questionnaire.questions[2].label !== editedLabel) throw new Error('Questionnaire editing contract failed');

  const privacy = await api(`/api/events/${eventId}/kit/${itemId}`, {
    method: 'PATCH', headers: hostHeaders, body: { privacy: 'public_allowed', edited: true },
  });
  if (!privacy.response.ok) throw new Error('Privacy update failed');
  const approved = await api(`/api/events/${eventId}/kit/${itemId}`, {
    method: 'PATCH', headers: hostHeaders, body: { status: 'approved', edited: true },
  });
  if (!approved.response.ok) throw new Error('Approve failed');

  const rehearsal = await api(`/api/events/${eventId}/rehearsal`, {
    method: 'PATCH', headers: hostHeaders, body: { itemId, state: 'ready' },
  });
  if (!rehearsal.response.ok) throw new Error('Rehearsal update failed');

  const shown = await api(`/api/events/${eventId}/live`, {
    method: 'POST', headers: hostHeaders, body: { action: 'show_item', itemId },
  });
  if (!shown.response.ok) throw new Error(`Live show failed: ${shown.response.status}`);

  const screen = await api(`/api/public/screen/${screenToken}`);
  if (!screen.response.ok || !screen.data.item?.title) throw new Error('Public Screen did not receive approved item');

  const blank = await api(`/api/events/${eventId}/live`, {
    method: 'POST', headers: hostHeaders, body: { action: 'blank' },
  });
  if (!blank.response.ok) throw new Error('Live blank failed');
  const cleared = await api(`/api/public/screen/${screenToken}`);
  if (cleared.data.item !== null || cleared.data.currentItemId !== null) throw new Error('Public Screen did not clear');

  console.log('TYAMA Worker local E2E: PASS');
} catch (error) {
  console.error('\nTYAMA Worker local E2E: FAIL');
  console.error(error);
  console.error(workerLog.slice(-5000));
  process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => {
    child.once('exit', resolve);
    setTimeout(resolve, 2000);
  });
}
