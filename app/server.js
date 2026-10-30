'use strict';

const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { GROUP, listAgents, buildArgs, specRequest, runCopilot, USAGE_MARK, parseUsage, parseQuota } = require('./lib/copilot');
const { parseProjectInput, resolveLocal, listDirs, cloneOrUpdate } = require('./lib/projects');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4317);
// BOT_ROOT holds the agent definitions; each conversation can work in a different project folder.
const BOT_ROOT = path.resolve(__dirname, '..');
const AGENTS_DIR = path.join(BOT_ROOT, '.github', 'agents');
const DEFAULT_WORKDIR = path.resolve(process.env.BOT_WORKDIR || BOT_ROOT);
const REPOS_DIR = path.resolve(process.env.BOT_REPOS_DIR || path.join(os.homedir(), 'ai-assistant-bot', 'repos'));
const MODEL = process.env.BOT_MODEL || 'claude-opus-5.5';
const COPILOT_BIN = process.env.COPILOT_BIN || 'copilot';
const ALLOW_ALL = process.env.BOT_ALLOW_ALL === '1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
};

const busySessions = new Set();

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('Invalid JSON')); }
    });
  });
}

function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file)) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

async function handleChat(req, res) {
  let body;
  try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }

  const agents = listAgents(AGENTS_DIR).map((a) => a.name);
  const group = body.group
    ? { step: body.group.step, first: !!body.group.first, members: Array.isArray(body.group.members) ? body.group.members : [] }
    : undefined;
  const toCheck = [body.agent, ...(group ? group.members : [])];
  if (body.previousAgent !== GROUP) toCheck.push(body.previousAgent);
  for (const a of toCheck) {
    if (a && !agents.includes(a)) return sendJson(res, 400, { error: `Unknown agent ${a}` });
  }

  let message = body.message;
  let args;
  const usageFile = path.join(os.tmpdir(), `ai-assistant-bot-usage-${crypto.randomUUID()}.json`);
  try {
    const workdir = body.workdir ? resolveLocal(body.workdir).path : DEFAULT_WORKDIR;
    if (body.saveSpec) {
      message = specRequest(body.saveSpec);
      // Agents can't run shell (mkdir), so create the validated folder for them.
      fs.mkdirSync(path.join(workdir, 'docs', 'features', body.saveSpec), { recursive: true });
    }
    args = buildArgs({
      message, agent: body.agent, previousAgent: body.previousAgent, group: body.saveSpec ? undefined : group,
      sessionId: body.sessionId, firstTurn: !!body.firstTurn, model: MODEL, cwd: workdir, allowAll: ALLOW_ALL,
      addDirs: workdir === BOT_ROOT ? [] : [BOT_ROOT], usageFile,
    });
  } catch (e) {
    return sendJson(res, 400, { error: e.message });
  }

  if (busySessions.has(body.sessionId)) return sendJson(res, 409, { error: 'This conversation is still answering' });
  busySessions.add(body.sessionId);

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  let finished = false;
  const child = runCopilot(args, {
    bin: COPILOT_BIN,
    onData: (text) => res.write(text),
    onDone: ({ code, stderr }) => {
      finished = true;
      busySessions.delete(body.sessionId);
      if (code !== 0) res.write(`\n\n⚠️ copilot exited with code ${code}\n${stderr.trim()}`);
      let usage = null;
      try { usage = parseUsage(JSON.parse(fs.readFileSync(usageFile, 'utf8'))); } catch { /* no usage written */ }
      fs.rm(usageFile, { force: true }, () => {});
      if (usage) res.write(USAGE_MARK + JSON.stringify(usage));
      res.end();
    },
  });
  res.on('close', () => {
    if (!finished) child.kill('SIGTERM');
  });
}

function handleQuota(res) {
  execFile('gh', ['api', '/copilot_internal/user'], { timeout: 15000 }, (err, stdout) => {
    let quota = null;
    try { if (!err) quota = parseQuota(JSON.parse(stdout)); } catch { /* unparsable */ }
    sendJson(res, 200, quota || { unavailable: true });
  });
}

async function handleProject(req, res) {
  try {
    const body = await readBody(req);
    const parsed = parseProjectInput(body.input);
    const project = parsed.type === 'local' ? resolveLocal(parsed.path) : await cloneOrUpdate(parsed, REPOS_DIR);
    sendJson(res, 200, project);
  } catch (e) {
    sendJson(res, 400, { error: e.message });
  }
}

// Only accept requests addressed to this machine (blocks DNS rebinding) and,
// for POSTs, JSON bodies (forces a CORS preflight that cross-site pages can't pass).
function isTrusted(req) {
  const host = (req.headers.host || '').replace(/:\d+$/, '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return false;
  if (req.method === 'POST' && !(req.headers['content-type'] || '').startsWith('application/json')) return false;
  return true;
}

function createServer() {
  return http.createServer((req, res) => {
    if (!isTrusted(req)) return sendJson(res, 403, { error: 'Forbidden' });
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/agents') {
      let defaultProject;
      try { defaultProject = resolveLocal(DEFAULT_WORKDIR); } catch { defaultProject = null; }
      return sendJson(res, 200, { agents: listAgents(AGENTS_DIR), model: MODEL, defaultProject, reposDir: REPOS_DIR });
    }
    if (req.method === 'GET' && url.pathname === '/api/fs') {
      try { return sendJson(res, 200, listDirs(url.searchParams.get('path') || os.homedir())); } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    if (req.method === 'GET' && url.pathname === '/api/quota') return handleQuota(res);
    if (req.method === 'POST' && url.pathname === '/api/project') return handleProject(req, res);
    if (req.method === 'POST' && url.pathname === '/api/chat') return handleChat(req, res);
    if (req.method === 'GET') return serveStatic(req, res);
    res.writeHead(405).end();
  });
}

if (require.main === module) {
  createServer().listen(PORT, HOST, () => {
    console.log(`ai-assistant-bot running at http://${HOST}:${PORT}  (default project: ${DEFAULT_WORKDIR}, model: ${MODEL})`);
  });
}

module.exports = { createServer };
