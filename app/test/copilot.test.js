'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildArgs, listAgents, specRequest } = require('../lib/copilot');

const SID = '123e4567-e89b-42d3-a456-426614174000';
const base = { message: 'Hi', agent: 'product-owner', sessionId: SID, model: 'claude-opus-5.5', cwd: '/repo' };

test('first turn starts a new session and adds the chat preamble', () => {
  const args = buildArgs({ ...base, firstTurn: true });
  assert.deepStrictEqual(args.slice(args.indexOf('--session-id'), args.indexOf('--session-id') + 2), ['--session-id', SID]);
  assert.match(args[1], /ai-assistant-bot[\s\S]*Hi$/);
  assert.ok(!args.includes('--resume'));
});

test('follow-up turns resume the session with the raw message', () => {
  const args = buildArgs({ ...base, firstTurn: false });
  assert.deepStrictEqual(args.slice(args.indexOf('--resume'), args.indexOf('--resume') + 2), ['--resume', SID]);
  assert.strictEqual(args[1], 'Hi');
});

test('switching agent mid-conversation adds a hand-off note', () => {
  const args = buildArgs({ ...base, agent: 'ux-ui-designer', previousAgent: 'product-owner' });
  assert.match(args[1], /from "product-owner" to you \("ux-ui-designer"\)[\s\S]*Hi$/);
  assert.strictEqual(buildArgs({ ...base, previousAgent: 'product-owner' })[1], 'Hi');
});

test('group: first speaker gets the user question, later speakers are told it is their turn', () => {
  const group = { step: 'speak', members: ['product-owner', 'ux-ui-designer'] };
  const first = buildArgs({ ...base, group: { ...group, first: true } })[1];
  assert.match(first, /group discussion[\s\S]*PASS[\s\S]*User message:\nHi$/);
  const later = buildArgs({ ...base, message: '', agent: 'ux-ui-designer', group })[1];
  assert.match(later, /You are "ux-ui-designer"[\s\S]*your turn/);
});

test('group: summary step asks the moderator to summarise without needing a message', () => {
  const p = buildArgs({ ...base, message: '', agent: 'orchestrator', group: { step: 'summary', members: ['a', 'b'] } })[1];
  assert.match(p, /moderator[\s\S]*\(a, b\)[\s\S]*Summarise/);
  assert.throws(() => buildArgs({ ...base, group: { step: 'dance' } }), /group step/);
});

test('handing off from the group uses a readable label', () => {
  assert.match(buildArgs({ ...base, previousAgent: 'group' })[1], /from the group discussion to you/);
});

test('shell is denied unless allowAll is set', () => {
  assert.ok(buildArgs(base).includes('shell'));
  const all = buildArgs({ ...base, allowAll: true });
  assert.ok(all.includes('--allow-all-tools') && !all.includes('shell'));
});

test('rejects invalid session ids and empty messages', () => {
  assert.throws(() => buildArgs({ ...base, sessionId: '../etc' }), /sessionId/);
  assert.throws(() => buildArgs({ ...base, message: '  ' }), /empty/);
});

test('specRequest only accepts kebab-case feature names', () => {
  assert.match(specRequest('biometric-login'), /docs\/features\/biometric-login\/spec\.md/);
  assert.throws(() => specRequest('../../etc'), /kebab-case/);
});

test('listAgents reads name and description from frontmatter', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-'));
  fs.writeFileSync(path.join(dir, 'po.agent.md'), '---\nname: product-owner\ndescription: Writes specs\nmodel: x\n---\nbody');
  fs.writeFileSync(path.join(dir, 'notes.md'), 'ignored');
  assert.deepStrictEqual(listAgents(dir), [{ name: 'product-owner', description: 'Writes specs', model: 'x' }]);
});

test('parseUsage converts nano-AIU to AI credits', () => {
  const { parseUsage } = require('../lib/copilot');
  assert.deepStrictEqual(parseUsage({ totalNanoAiu: 6444940000, aiCreditsStatus: 'complete' }), { aic: 6.44494, status: 'complete' });
  assert.strictEqual(parseUsage({}), null);
});

test('parseQuota reads premium_interactions and handles unlimited plans', () => {
  const { parseQuota } = require('../lib/copilot');
  const q = { quota_reset_date: '2026-11-01', quota_snapshots: { premium_interactions: { unlimited: false, quota_remaining: 666.4, entitlement: 10000, percent_remaining: 6.6 } } };
  assert.deepStrictEqual(parseQuota(q), { unlimited: false, remaining: 666.4, entitlement: 10000, percentRemaining: 6.6, resetDate: '2026-11-01' });
  assert.deepStrictEqual(parseQuota({ quota_snapshots: { premium_interactions: { unlimited: true } } }), { unlimited: true, resetDate: null });
  assert.strictEqual(parseQuota({}), null);
});
