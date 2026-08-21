import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
const output = process.argv[3] || 'tmp/staging-import.sql';
const includeAcceptance = process.argv.includes('--include-acceptance');

if (!input) {
  console.error('Usage: node scripts/convert-staging-export.mjs <staging-state.json> [output.sql] [--include-acceptance]');
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync(input, 'utf8'));
const events = (state.events || []).filter((e) => includeAcceptance || !/^Acceptance\s+\d+/.test(String(e.title || '')));
const eventIds = new Set(events.map((e) => String(e.id)));
const hosts = (state.hosts || []).filter((h) => events.some((e) => String(e.hostId) === String(h.id)));
const questionnaires = (state.questionnaires || []).filter((q) => eventIds.has(String(q.eventId)));
const responses = (state.responses || []).filter((r) => eventIds.has(String(r.eventId)));
const responseIds = new Set(responses.map((r) => String(r.id)));
const kitItems = (state.kitItems || []).filter((k) => eventIds.has(String(k.eventId)));
const rehearsal = (state.rehearsal || []).filter((r) => eventIds.has(String(r.eventId)));
const live = (state.live || []).filter((l) => eventIds.has(String(l.eventId)));

function q(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function bool(value) {
  return value ? 1 : 0;
}

function safePrivacy(value) {
  return ['review_required', 'host_only', 'public_allowed'].includes(value) ? value : 'review_required';
}

function safeStatus(value) {
  return ['draft', 'approved', 'do_not_use', 'removed'].includes(value) ? value : 'draft';
}

const lines = [
  '-- Generated locally from TYAMA staging state. Do not commit generated SQL: it may contain personal data.',
  'PRAGMA foreign_keys = ON;',
  'BEGIN TRANSACTION;'
];

for (const h of hosts) {
  lines.push(`INSERT OR IGNORE INTO hosts (id,email,display_name,created_at,updated_at) VALUES (${q(h.id)},${q(h.email)},${q(h.name || h.displayName || h.email)},${q(h.createdAt)},${q(h.updatedAt || h.createdAt)});`);
}

for (const e of events) {
  lines.push(`INSERT OR REPLACE INTO events (id,host_id,title,event_type,event_date,venue,hero_names,notes,lifecycle,questionnaire_token,public_screen_token,created_at,updated_at) VALUES (${q(e.id)},${q(e.hostId)},${q(e.title)},${q(e.type || 'Подія')},${q(e.date)},${q(e.venue)},${q(e.heroNames)},${q(e.notes)},${q(e.lifecycle || 'preparing')},${q(e.questionnaireToken)},${q(e.publicToken)},${q(e.createdAt)},${q(e.updatedAt || e.createdAt)});`);
}

const questionToQuestionnaire = new Map();
const questionKey = new Map();
for (const form of questionnaires) {
  lines.push(`INSERT OR REPLACE INTO questionnaires (id,event_id,title,intro,is_open,created_at,updated_at) VALUES (${q(form.id)},${q(form.eventId)},${q(form.title)},${q(form.intro)},${bool(form.isOpen !== false)},${q(form.createdAt || form.updatedAt)},${q(form.updatedAt || form.createdAt)});`);
  (form.questions || []).forEach((question, index) => {
    questionToQuestionnaire.set(String(question.id), String(form.id));
    questionKey.set(String(question.id), String(question.key || ''));
    const type = ['text','textarea','select','url'].includes(question.type) ? question.type : 'text';
    lines.push(`INSERT OR REPLACE INTO questions (id,questionnaire_id,position,question_key,label,field_type,is_required,is_locked,privacy_default,options_json,created_at) VALUES (${q(question.id)},${q(form.id)},${index},${q(question.key)},${q(question.label)},${q(type)},${bool(question.required)},${bool(question.locked)},${q(safePrivacy(question.privacyDefault))},${q(JSON.stringify(question.options || []))},${q(question.createdAt || form.updatedAt || form.createdAt)});`);
  });
}

for (const r of responses) {
  const answers = Array.isArray(r.answers) ? r.answers : [];
  const consentAnswer = answers.find((a) => questionKey.get(String(a.questionId)) === 'consent');
  lines.push(`INSERT OR REPLACE INTO responses (id,event_id,questionnaire_id,respondent_label,consent,submitted_at) VALUES (${q(r.id)},${q(r.eventId)},${q(r.questionnaireId)},${q(r.respondentLabel || 'Гість')},${q(consentAnswer?.value ?? r.consent)},${q(r.submittedAt)});`);
  for (const a of answers) {
    const questionId = String(a.questionId || '');
    if (!questionId || !questionToQuestionnaire.has(questionId)) continue;
    const answerId = `${r.id}:${questionId}`;
    lines.push(`INSERT OR REPLACE INTO response_answers (id,response_id,question_id,answer_text,created_at) VALUES (${q(answerId)},${q(r.id)},${q(questionId)},${q(a.value ?? '')},${q(r.submittedAt)});`);
  }
}

for (const item of kitItems) {
  const source = item.sourceResponseId && responseIds.has(String(item.sourceResponseId)) ? item.sourceResponseId : null;
  lines.push(`INSERT OR REPLACE INTO kit_items (id,event_id,source_response_id,category,title,body,status,privacy,useful,edited,created_at,updated_at) VALUES (${q(item.id)},${q(item.eventId)},${q(source)},${q(item.category || 'stories')},${q(item.title || 'Матеріал')},${q(item.body || '')},${q(safeStatus(item.status))},${q(safePrivacy(item.privacy))},${bool(item.useful)},${bool(item.edited)},${q(item.createdAt || item.updatedAt)},${q(item.updatedAt || item.createdAt)});`);
}

const kitIds = new Set(kitItems.map((k) => String(k.id)));
for (const rehearsalState of rehearsal) {
  const states = rehearsalState.states && typeof rehearsalState.states === 'object' ? rehearsalState.states : {};
  for (const [itemId, value] of Object.entries(states)) {
    if (!kitIds.has(String(itemId))) continue;
    const stateValue = value === 'ready' || value === true ? 'ready' : 'pending';
    lines.push(`INSERT OR REPLACE INTO rehearsal_items (event_id,kit_item_id,state,updated_at) VALUES (${q(rehearsalState.eventId)},${q(itemId)},${q(stateValue)},${q(rehearsalState.updatedAt)});`);
  }
}

for (const entry of live) {
  const current = entry.currentItemId && kitIds.has(String(entry.currentItemId)) ? entry.currentItemId : null;
  lines.push(`INSERT OR REPLACE INTO live_state (event_id,current_item_id,updated_at) VALUES (${q(entry.eventId)},${q(current)},${q(entry.updatedAt)});`);
}

for (const event of events) {
  if (!live.some((l) => String(l.eventId) === String(event.id))) {
    lines.push(`INSERT OR IGNORE INTO live_state (event_id,current_item_id) VALUES (${q(event.id)},NULL);`);
  }
}

lines.push('COMMIT;');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${lines.join('\n')}\n`);
console.log(JSON.stringify({
  output,
  counts: {
    hosts: hosts.length,
    events: events.length,
    questionnaires: questionnaires.length,
    responses: responses.length,
    kitItems: kitItems.length
  },
  acceptanceEventsExcluded: !includeAcceptance
}, null, 2));
