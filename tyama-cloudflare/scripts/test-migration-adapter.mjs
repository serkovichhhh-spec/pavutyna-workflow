import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tyama-migrate-'));
const input = path.join(dir, 'state.json');
const output = path.join(dir, 'import.sql');

const state = {
  hosts: [{ id: 'host_fixture', email: 'fixture@tyama.local', name: 'Fixture Host', createdAt: '2026-01-01T00:00:00Z' }],
  events: [
    { id: 'event_fixture', hostId: 'host_fixture', title: 'Fixture Event', type: 'Весілля', date: '2026-09-01', venue: 'Київ', heroNames: 'Марта та Андрій', notes: 'Контекст', lifecycle: 'preparing', questionnaireToken: 'fixture-q-token', publicToken: 'fixture-screen-token', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
    { id: 'event_acceptance', hostId: 'host_fixture', title: 'Acceptance 1234567890', questionnaireToken: 'acceptance-q', publicToken: 'acceptance-screen', createdAt: '2026-01-01T00:00:00Z' }
  ],
  questionnaires: [{
    id: 'form_fixture', eventId: 'event_fixture', title: 'Кілька запитань', intro: 'Живі деталі', isOpen: true, updatedAt: '2026-01-02T00:00:00Z',
    questions: [
      { id: 'q_name', key: 'name', type: 'text', label: 'Як вас звати?', required: true, locked: true, privacyDefault: 'review_required', options: [] },
      { id: 'q_media', key: 'media', type: 'url', label: 'Посилання', required: false, locked: false, privacyDefault: 'review_required', options: [] },
      { id: 'q_consent', key: 'consent', type: 'select', label: 'Чи можна використати?', required: true, locked: true, privacyDefault: 'host_only', options: ['Так', 'Ні'] }
    ]
  }],
  responses: [{ id: 'response_fixture', eventId: 'event_fixture', questionnaireId: 'form_fixture', respondentLabel: 'Гість', submittedAt: '2026-01-03T00:00:00Z', answers: [
    { questionId: 'q_name', value: 'Гість' },
    { questionId: 'q_media', value: 'https://example.com/photo' },
    { questionId: 'q_consent', value: 'Так' }
  ] }],
  kitItems: [{ id: 'kit_fixture', eventId: 'event_fixture', sourceResponseId: 'response_fixture', category: 'stories', title: 'Історія', body: 'Текст', status: 'approved', privacy: 'public_allowed', useful: true, edited: true, createdAt: '2026-01-03T00:00:00Z', updatedAt: '2026-01-04T00:00:00Z' }],
  rehearsal: [{ eventId: 'event_fixture', states: { kit_fixture: 'ready' }, updatedAt: '2026-01-04T00:00:00Z' }],
  live: [{ eventId: 'event_fixture', currentItemId: 'kit_fixture', updatedAt: '2026-01-04T00:00:00Z' }]
};

fs.writeFileSync(input, JSON.stringify(state));
execFileSync(process.execPath, ['./scripts/convert-staging-export.mjs', input, output], { cwd: new URL('..', import.meta.url).pathname, stdio: 'inherit' });
const sql = fs.readFileSync(output, 'utf8');

const requiredFragments = [
  "'Марта та Андрій'",
  "'Кілька запитань'",
  "'Живі деталі'",
  "'url'",
  "'Так'",
  "'public_allowed'",
  "'kit_fixture'",
  "'ready'"
];
for (const fragment of requiredFragments) {
  if (!sql.includes(fragment)) throw new Error(`Migration adapter lost expected context: ${fragment}`);
}
if (sql.includes('event_acceptance') || sql.includes('Acceptance 1234567890')) {
  throw new Error('Migration adapter did not exclude CI acceptance Event by default');
}
if (!sql.startsWith('-- Generated locally from TYAMA staging state. Do not commit generated SQL')) {
  throw new Error('Migration output privacy warning is missing');
}
console.log('TYAMA staging -> D1 migration adapter: PASS');
