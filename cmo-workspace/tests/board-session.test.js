import test from 'node:test';import assert from 'node:assert/strict';
import {sessionRemaining,taskStages} from '../board-session.js';
test('server session timer survives reload, expires and rejects missing dates',()=>{assert.equal(sessionRemaining({endsAt:'2026-10-01T12:05:00Z'},Date.parse('2026-10-01T12:00:00Z')),300);assert.equal(sessionRemaining({endsAt:'2026-10-01T12:05:00Z'},Date.parse('2026-10-01T12:06:00Z')),0);assert.equal(sessionRemaining({}),0);assert.equal(Object.keys(taskStages).length,7);});
