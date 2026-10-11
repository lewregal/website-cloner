#!/usr/bin/env node

/**
 * Registers the REA ("Reverse Engineer Anything") MCP server for every agent
 * that supports project-scoped MCP config, and vendors REA's matching
 * `reverse-engineer-anything` skill from the published npm package.
 *
 * The pinned version lives in REA_VERSION below (or pass one as an argument).
 * Everything this script writes is derived from that one version, so the MCP
 * server and the skill instructions always match.
 *
 * Usage:
 *   node scripts/sync-rea.mjs            # re-sync the pinned version
 *   node scripts/sync-rea.mjs 6.4.0      # bump to a new version
 *   node scripts/sync-rea.mjs latest     # bump to npm's latest release
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = join(ROOT, 'scripts', 'sync-rea.mjs');
const SKILL = 'reverse-engineer-anything';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const REA_VERSION = '6.3.0';

// --- Resolve version ---

let version = process.argv[2] ?? REA_VERSION;
if (version === 'latest') {
  version = execFileSync(npm, ['view', 'rea-agents', 'dist-tags.latest'], { encoding: 'utf8' }).trim();
}
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Error: expected an exact semver version (e.g. 6.3.0), got "${version}"`);
  process.exit(1);
}

const server = { command: 'npx', args: ['-y', `rea-agents@${version}`, 'mcp'] };

// --- Helpers ---

function write(relPath, content) {
  const full = join(ROOT, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
  console.log(`  ✓ ${relPath}`);
}

function readJson(relPath) {
  const full = join(ROOT, relPath);
  if (!existsSync(full)) return {};
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch {
    console.error(`Error: ${relPath} is not valid JSON — fix it and re-run.`);
    process.exit(1);
  }
}

// Sets mcpServers.rea and leaves every other key untouched.
function registerJson(relPath) {
  const config = readJson(relPath);
  config.mcpServers = { ...config.mcpServers, rea: server };
  write(relPath, JSON.stringify(config, null, 2) + '\n');
}

// Replaces only the managed block, so hand-written Codex settings survive.
function registerToml(relPath) {
  const begin = '# >>> rea (managed by scripts/sync-rea.mjs)';
  const end = '# <<< rea';
  const block = [
    begin,
    '[mcp_servers.rea]',
    `command = "${server.command}"`,
    `args = [${server.args.map((a) => `"${a}"`).join(', ')}]`,
    'startup_timeout_sec = 60',
    end,
  ].join('\n');

  const full = join(ROOT, relPath);
  const current = existsSync(full) ? readFileSync(full, 'utf8').replace(/\r\n/g, '\n') : '';
  const pattern = new RegExp(`${begin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end}`);
  const next = pattern.test(current)
    ? current.replace(pattern, block)
    : (current.trimEnd() ? current.trimEnd() + '\n\n' : '') + block + '\n';
  write(relPath, next);
}

// --- Generate ---

console.log(`Syncing REA rea-agents@${version}...\n`);

// 1. MCP registrations (project scope)
registerJson('.mcp.json'); // Claude Code
registerJson('.cursor/mcp.json'); // Cursor
registerJson('.gemini/settings.json'); // Gemini CLI
registerToml('.codex/config.toml'); // Codex CLI (trusted projects)

// 2. Skill — copied verbatim from the npm tarball for this exact version
const work = mkdtempSync(join(tmpdir(), 'rea-sync-'));
try {
  const tarball = execFileSync(npm, ['pack', `rea-agents@${version}`, '--silent', '--pack-destination', work], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .pop();
  execFileSync('tar', ['-xzf', join(work, tarball), '-C', work, `package/skills/${SKILL}`]);
  const source = join(work, 'package', 'skills', SKILL);

  for (const dest of ['.claude/skills', '.codex/skills', '.github/skills']) {
    const target = join(ROOT, dest, SKILL);
    rmSync(target, { recursive: true, force: true });
    cpSync(source, target, { recursive: true });
    console.log(`  ✓ ${dest}/${SKILL}/`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

// 3. Remember the version for the next plain re-sync
const self = readFileSync(SELF, 'utf8');
writeFileSync(SELF, self.replace(/const REA_VERSION = '[^']+';/, `const REA_VERSION = '${version}';`), 'utf8');

console.log(`\nDone! REA ${version} registered and skill vendored.`);
console.log('Restart your agent so it picks up the MCP server.');
