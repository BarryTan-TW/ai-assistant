'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CHAT_PREAMBLE = [
  '[ai-assistant-bot] You are talking to the user through a chat UI.',
  'Act as their teammate in your role: ask focused clarifying questions (at most 3 at a time)',
  'about the project and feature before producing deliverables, and summarise what you have understood.',
  'Do not create or modify files unless the user explicitly asks you to (for example "save the spec").',
  'The user may be non-technical or elderly: always reply in the same language the user writes in,',
  'use short sentences and plain words, explain any jargon, and number your questions.',
  '',
  'User message:',
].join('\n');

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx > 0) data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return data;
}

function listAgents(agentsDir) {
  if (!fs.existsSync(agentsDir)) return [];
  return fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith('.agent.md'))
    .map((f) => {
      const meta = parseFrontmatter(fs.readFileSync(path.join(agentsDir, f), 'utf8'));
      return {
        name: meta.name || f.replace(/\.agent\.md$/, ''),
        description: meta.description || '',
        model: meta.model || '',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const GROUP = 'group';
const PASS_RE = /^\W*PASS\W*$/i;

function handoffNote(previousAgent, agent) {
  const from = previousAgent === GROUP ? 'the group discussion' : `"${previousAgent}"`;
  return (
    `[ai-assistant-bot] The user handed this conversation from ${from} to you ("${agent}"). ` +
    'Earlier replies came from other teammates. Continue in your own role, keep the same chat rules ' +
    '(same language as the user, plain words, ask before writing files), and briefly say what you will help with.'
  );
}

function buildPrompt({ message, firstTurn, agent, previousAgent }) {
  if (firstTurn) return `${CHAT_PREAMBLE}\n${message}`;
  if (agent && previousAgent && agent !== previousAgent) {
    return `${handoffNote(previousAgent, agent)}\n\nUser message:\n${message}`;
  }
  return message;
}

// One turn of a group discussion. All turns share one session, so each
// speaker sees the user's question and every earlier teammate reply.
function buildGroupPrompt({ message, firstTurn, agent, group }) {
  const { step, members = [], first } = group;
  const parts = [];
  if (firstTurn) parts.push(CHAT_PREAMBLE.replace(/\n\nUser message:$/, ''));
  if (step === 'summary') {
    parts.push(
      `[ai-assistant-bot group discussion] You are "${agent}", the moderator. ` +
      `The teammates (${members.join(', ')}) have just replied above to the user's latest question. ` +
      'Summarise for the user in plain words: (1) the key ideas, (2) the suggested direction, ' +
      '(3) any disagreements, and (4) the most important questions for the user (at most 3, numbered). ' +
      'Do not repeat everything. Keep it short. Use the same language as the user.'
    );
    return parts.join('\n');
  }
  parts.push(
    `[ai-assistant-bot group discussion] You are "${agent}" in a group chat with the user and teammates: ` +
    `${members.join(', ')}. Speakers take turns; read every earlier reply in this conversation.`,
    'Contribute ONLY from your own expertise: ideas, design, test cases, or implementation approach that fit your role. ' +
    'Build on what teammates said instead of repeating it, and say so if you disagree. ' +
    'Keep it under about 150 words, plain words, and the same language as the user. Do not create or modify files. ' +
    'If you have nothing useful to add, reply with exactly: PASS'
  );
  parts.push(first ? `\nUser message:\n${message}` : '\nIt is your turn now; respond to the user\'s latest message above.');
  return parts.join('\n');
}

function buildArgs({ message, agent, previousAgent, group, sessionId, firstTurn, model, cwd, allowAll, addDirs = [], usageFile }) {
  if (!UUID_RE.test(sessionId || '')) throw new Error('Invalid sessionId');
  const needsMessage = !group || (group.step === 'speak' && group.first);
  if (needsMessage && (!message || !message.trim())) throw new Error('Message is empty');
  if (group && !['speak', 'summary'].includes(group.step)) throw new Error('Invalid group step');

  const prompt = group
    ? buildGroupPrompt({ message, firstTurn, agent, group })
    : buildPrompt({ message, firstTurn, agent, previousAgent });
  const args = [
    '-p', prompt,
    '-s',
    '--stream', 'on',
    firstTurn ? '--session-id' : '--resume', sessionId,
    '-C', cwd,
  ];
  if (agent) args.push('--agent', agent);
  // Load the team's agents (and allow access) when working in another project folder.
  for (const dir of addDirs) args.push('--add-dir', dir);
  if (model) args.push('--model', model);
  if (usageFile) args.push('--usage-output-file', usageFile);
  if (allowAll) {
    args.push('--allow-all-tools');
  } else {
    // Let agents read the repo and write docs, but never run shell commands.
    args.push('--allow-tool', 'write', '--deny-tool', 'shell');
  }
  return args;
}

function specRequest(slug) {
  if (!SLUG_RE.test(slug || '')) throw new Error('Feature name must be kebab-case, e.g. biometric-login');
  return (
    `Please write the final specification now to docs/features/${slug}/spec.md ` +
    '(the folder already exists; use your file create/edit tool, not shell), ' +
    'using everything we discussed and the structure defined in your role. ' +
    'List any still-open questions in the "Open questions & risks" section. ' +
    'Reply with a short summary of what you saved.'
  );
}

// Marks the end of the streamed reply; the JSON usage summary follows it.
const USAGE_MARK = '\u001e';

// Converts copilot's --usage-output-file JSON into the AI credits (AIC) spent.
function parseUsage(json) {
  const nano = json && Number(json.totalNanoAiu);
  if (!Number.isFinite(nano)) return null;
  return { aic: nano / 1e9, status: json.aiCreditsStatus || 'unknown' };
}

// Extracts the remaining AI-credit quota from `gh api /copilot_internal/user`.
function parseQuota(json) {
  const q = json && json.quota_snapshots && json.quota_snapshots.premium_interactions;
  if (!q) return null;
  if (q.unlimited) return { unlimited: true, resetDate: json.quota_reset_date || null };
  return {
    unlimited: false,
    remaining: Number(q.quota_remaining ?? q.remaining),
    entitlement: Number(q.entitlement),
    percentRemaining: Number(q.percent_remaining),
    resetDate: json.quota_reset_date || null,
  };
}

function runCopilot(args, { bin = 'copilot', onData, onDone }) {
  const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  let stderr = '';
  child.stdout.on('data', (chunk) => onData(chunk.toString()));
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', (err) => onDone({ code: -1, stderr: err.message }));
  child.on('close', (code) => onDone({ code, stderr }));
  return child;
}

module.exports = {
  UUID_RE, GROUP, PASS_RE, listAgents, parseFrontmatter, buildArgs, buildPrompt, buildGroupPrompt, specRequest, runCopilot,
  USAGE_MARK, parseUsage, parseQuota,
};
