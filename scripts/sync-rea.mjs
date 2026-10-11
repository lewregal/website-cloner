#!/usr/bin/env node

/**
 * Registers the REA ("Reverse Engineer Anything") MCP server for every agent
 * that supports project-scoped MCP config, and vendors REA's matching
 * `reverse-engineer-anything` skill from the published npm package.
 *
 * REA is opt-in: nothing is registered until this script runs.
 *
 * The pinned version lives in REA_VERSION below (or pass one as an argument).
 * Everything this script writes is derived from that one version, so the MCP
 * server and the skill instructions always match.
 *
 * Usage:
 *   node scripts/sync-rea.mjs            # enable / re-sync the pinned version
 *   node scripts/sync-rea.mjs 6.4.0      # bump to a new version
 *   node scripts/sync-rea.mjs latest     # bump to npm's latest release
 *   node scripts/sync-rea.mjs off        # remove every registration and the skill
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

// Claude Code, Cursor, Gemini CLI — all use { mcpServers: { ... } }
const JSON_CONFIGS = ['.mcp.json', '.cursor/mcp.json', '.gemini/settings.json'];
// Codex CLI (trusted projects only)
const TOML_CONFIG = '.codex/config.toml';
const SKILL_DIRS = ['.claude/skills', '.codex/skills', '.github/skills'];

const TOML_BEGIN = '# >>> rea (managed by scripts/sync-rea.mjs)';
const TOML_END = '# <<< rea';
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TOML_BLOCK = new RegExp(`\\n*${escape(TOML_BEGIN)}[\\s\\S]*?${escape(TOML_END)}\\n?`);

// --- Helpers ---

function write(relPath, content) {
  const full = join(ROOT, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
  console.log(`  ✓ ${relPath}`);
}

function remove(relPath) {
  rmSync(join(ROOT, relPath), { recursive: true, force: true });
  console.log(`  ✗ ${relPath}`);
}

function read(relPath) {
  const full = join(ROOT, relPath);
  return existsSync(full) ? readFileSync(full, 'utf8').replace(/\r\n/g, '\n') : null;
}

function readJson(relPath) {
  const text = read(relPath);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    console.error(`Error: ${relPath} is not valid JSON — fix it and re-run.`);
    process.exit(1);
  }
}

// --- Disable ---

function disable() {
  console.log('Removing REA...\n');

  // Drop only the rea entry; delete the file if nothing else is left in it.
  for (const relPath of JSON_CONFIGS) {
    const config = readJson(relPath);
    if (!config?.mcpServers?.rea) continue;
    delete config.mcpServers.rea;
    if (Object.keys(config.mcpServers).length === 0) delete config.mcpServers;
    if (Object.keys(config).length === 0) remove(relPath);
    else write(relPath, JSON.stringify(config, null, 2) + '\n');
  }

  const toml = read(TOML_CONFIG);
  if (toml !== null && TOML_BLOCK.test(toml)) {
    const rest = toml.replace(TOML_BLOCK, '\n').trim();
    if (rest) write(TOML_CONFIG, rest + '\n');
    else remove(TOML_CONFIG);
  }

  for (const dest of SKILL_DIRS) {
    if (existsSync(join(ROOT, dest, SKILL))) remove(`${dest}/${SKILL}/`);
  }

  console.log('\nDone! REA is disabled. Restart your agent.');
}

// --- Enable ---

function enable(version) {
  const server = { command: 'npx', args: ['-y', `rea-agents@${version}`, 'mcp'] };
  console.log(`Syncing REA rea-agents@${version}...\n`);

  // 1. MCP registrations — set mcpServers.rea and leave every other key untouched
  for (const relPath of JSON_CONFIGS) {
    const config = readJson(relPath) ?? {};
    config.mcpServers = { ...config.mcpServers, rea: server };
    write(relPath, JSON.stringify(config, null, 2) + '\n');
  }

  // Replace only the managed block, so hand-written Codex settings survive
  const block = [
    TOML_BEGIN,
    '[mcp_servers.rea]',
    `command = "${server.command}"`,
    `args = [${server.args.map((a) => `"${a}"`).join(', ')}]`,
    'startup_timeout_sec = 60',
    TOML_END,
  ].join('\n');
  const rest = (read(TOML_CONFIG) ?? '').replace(TOML_BLOCK, '\n').trim();
  write(TOML_CONFIG, (rest ? rest + '\n\n' : '') + block + '\n');

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

    for (const dest of SKILL_DIRS) {
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
}

// --- Run ---

let version = process.argv[2] ?? REA_VERSION;
if (version === 'off') {
  disable();
} else {
  if (version === 'latest') {
    version = execFileSync(npm, ['view', 'rea-agents', 'dist-tags.latest'], { encoding: 'utf8' }).trim();
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`Error: expected an exact semver version (e.g. 6.3.0) or "off", got "${version}"`);
    process.exit(1);
  }
  enable(version);
}
