'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const NAME_RE = /^[A-Za-z0-9_.-]+$/;

function expandHome(p) {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

function isGitRepo(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

// Classifies user input as a local folder or a remote git repository.
function parseProjectInput(raw) {
  const input = (raw || '').trim();
  if (!input) throw new Error('Please enter a folder path or a repository URL');

  if (input.startsWith('/') || input.startsWith('~')) {
    return { type: 'local', path: path.resolve(expandHome(input)) };
  }

  let m = /^(?:https?:\/\/)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(input)
    || /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i.exec(input)
    || /^([^/\s:]+)\/([^/\s:]+)$/.exec(input);
  if (m) {
    const [, owner, repo] = m;
    if (!NAME_RE.test(owner) || !NAME_RE.test(repo) || /^\.+$/.test(owner) || /^\.+$/.test(repo)) {
      throw new Error('Invalid GitHub owner or repository name');
    }
    return { type: 'github', owner, repo, name: `${owner}/${repo}`, url: `https://github.com/${owner}/${repo}.git` };
  }

  m = /^(?:https:\/\/|ssh:\/\/|git@)([^/:\s]+)[/:](.+?)(?:\.git)?\/?$/.exec(input);
  if (m) {
    const parts = m[2].split('/').filter(Boolean);
    if (!parts.length || parts.some((p) => !NAME_RE.test(p) || /^\.+$/.test(p))) throw new Error('Invalid repository URL');
    return { type: 'git', host: m[1], name: parts.join('/'), url: input, parts: [m[1], ...parts] };
  }

  throw new Error('Not a folder path (must start with / or ~) or a repository URL');
}

function resolveLocal(p) {
  const abs = path.resolve(expandHome(p));
  let stat;
  try { stat = fs.statSync(abs); } catch { throw new Error(`Folder not found: ${abs}`); }
  if (!stat.isDirectory()) throw new Error(`Not a folder: ${abs}`);
  const real = fs.realpathSync(abs);
  return { type: 'local', path: real, name: path.basename(real) || real, isGit: isGitRepo(real) };
}

function listDirs(p) {
  const dir = resolveLocal(p || os.homedir()).path;
  const dirs = fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.'))
    .filter((d) => {
      if (d.isDirectory()) return true;
      if (!d.isSymbolicLink()) return false;
      try { return fs.statSync(path.join(dir, d.name)).isDirectory(); } catch { return false; }
    })
    .map((d) => ({ name: d.name, isGit: isGitRepo(path.join(dir, d.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const parent = path.dirname(dir);
  return { path: dir, parent: parent === dir ? null : parent, isGit: isGitRepo(dir), dirs };
}

function run(cmd, args, { cwd, timeoutMs = 5 * 60 * 1000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { out += c; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out: e.message }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

const hasGh = () => spawnSync('gh', ['--version'], { stdio: 'ignore' }).status === 0;

// Clones a remote repo into reposDir (or updates an existing clone) and returns the local project.
async function cloneOrUpdate(project, reposDir, { runCmd = run, useGh = hasGh } = {}) {
  const segments = project.type === 'github' ? [project.owner, project.repo] : project.parts;
  const dest = path.join(reposDir, ...segments);
  if (!dest.startsWith(path.resolve(reposDir) + path.sep)) throw new Error('Invalid destination');

  let warning;
  if (isGitRepo(dest)) {
    const r = await runCmd('git', ['-C', dest, 'pull', '--ff-only']);
    if (r.code !== 0) warning = `Could not update existing copy: ${r.out.trim().split('\n').pop()}`;
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const r = project.type === 'github' && useGh()
      ? await runCmd('gh', ['repo', 'clone', project.name, dest])
      : await runCmd('git', ['clone', '--', project.url, dest]);
    if (r.code !== 0) throw new Error(`Download failed: ${r.out.trim().split('\n').slice(-3).join(' ')}`);
  }
  return { type: project.type, name: project.name, url: project.url, path: dest, isGit: true, warning };
}

module.exports = { expandHome, parseProjectInput, resolveLocal, listDirs, cloneOrUpdate };
