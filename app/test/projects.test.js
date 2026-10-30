'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseProjectInput, resolveLocal, listDirs, cloneOrUpdate } = require('../lib/projects');
const { buildArgs } = require('../lib/copilot');

test('parses GitHub URLs, SSH and owner/repo forms', () => {
  for (const input of ['https://github.com/octo/app', 'github.com/octo/app.git', 'git@github.com:octo/app.git', 'octo/app']) {
    assert.deepStrictEqual(
      parseProjectInput(input),
      { type: 'github', owner: 'octo', repo: 'app', name: 'octo/app', url: 'https://github.com/octo/app.git' },
      input,
    );
  }
});

test('parses absolute and home-relative local paths', () => {
  assert.deepStrictEqual(parseProjectInput('/tmp/x/../y'), { type: 'local', path: '/tmp/y' });
  assert.strictEqual(parseProjectInput('~/code').path, path.join(os.homedir(), 'code'));
});

test('parses other git hosts and rejects traversal or junk', () => {
  const p = parseProjectInput('https://gitlab.com/group/sub/proj.git');
  assert.deepStrictEqual([p.type, p.name, p.parts], ['git', 'group/sub/proj', ['gitlab.com', 'group', 'sub', 'proj']]);
  assert.throws(() => parseProjectInput('https://gitlab.com/../etc'), /Invalid/);
  assert.throws(() => parseProjectInput('octo/..'), /Invalid/);
  assert.throws(() => parseProjectInput('relative-folder'), /Not a folder path/);
  assert.throws(() => parseProjectInput('  '), /Please enter/);
});

test('resolveLocal and listDirs report folders and git repos, hiding dot-folders', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'));
  fs.mkdirSync(path.join(root, 'app', '.git'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'));
  fs.mkdirSync(path.join(root, '.hidden'));
  fs.writeFileSync(path.join(root, 'file.txt'), '');
  assert.throws(() => resolveLocal(path.join(root, 'missing')), /not found/);
  assert.throws(() => resolveLocal(path.join(root, 'file.txt')), /Not a folder/);
  assert.strictEqual(resolveLocal(path.join(root, 'app')).isGit, true);
  const listing = listDirs(root);
  assert.deepStrictEqual(listing.dirs, [{ name: 'app', isGit: true }, { name: 'docs', isGit: false }]);
  assert.strictEqual(listing.parent, path.dirname(fs.realpathSync(root)));
});

test('cloneOrUpdate clones new repos into reposDir and pulls existing ones', async () => {
  const reposDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repos-'));
  const calls = [];
  const runCmd = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (args[0] === 'clone' || args[1] === 'clone') fs.mkdirSync(path.join(args[args.length - 1], '.git'), { recursive: true });
    return { code: 0, out: '' };
  };
  const project = parseProjectInput('octo/app');
  const dest = path.join(reposDir, 'octo', 'app');

  const first = await cloneOrUpdate(project, reposDir, { runCmd, useGh: () => false });
  assert.deepStrictEqual(calls[0], ['git', 'clone', '--', 'https://github.com/octo/app.git', dest]);
  assert.strictEqual(first.path, dest);

  await cloneOrUpdate(project, reposDir, { runCmd, useGh: () => true });
  assert.deepStrictEqual(calls[1], ['git', '-C', dest, 'pull', '--ff-only']);
});

test('cloneOrUpdate surfaces clone failures', async () => {
  const reposDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repos-'));
  const runCmd = async () => ({ code: 128, out: 'fatal: repository not found' });
  await assert.rejects(cloneOrUpdate(parseProjectInput('octo/nope'), reposDir, { runCmd, useGh: () => true }), /not found/);
});

test('buildArgs adds --add-dir for each extra directory', () => {
  const args = buildArgs({ message: 'Hi', sessionId: '123e4567-e89b-42d3-a456-426614174000', cwd: '/proj', addDirs: ['/bot'] });
  assert.deepStrictEqual(args.slice(args.indexOf('--add-dir'), args.indexOf('--add-dir') + 2), ['--add-dir', '/bot']);
});
