#!/usr/bin/env node
import { access, copyFile, cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SERVER_NAME = 'workflow-dinve-skills';
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const home = homedir();

function usage() {
  console.log(`Usage:
  node install.mjs --client <codex|claude|cursor|generic|all>

Options:
  --client <name>       Target agent config. Default: generic.
  --install-dir <path>  Install directory. Default: ~/.mcp/workflow-dinve-skills
  --no-config           Install files only; do not write agent config.
  --no-smoke-test       Skip MCP smoke test.
  --help                Show this help.

Secrets:
  In private repo mode, put fixed webhook URLs directly in manifest transport.url.
  Otherwise use ~/.mcp/workflow-dinve-skills/secrets/*.webhook-url.txt
  or the environment variable named by each registry manifest.
`);
}

function parseArgs(argv) {
  const opts = {
    client: 'generic',
    installDir: join(home, '.mcp', SERVER_NAME),
    writeConfig: true,
    smokeTest: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = () => {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error(`${arg} requires a value`);
      i += 1;
      return next;
    };

    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--client') opts.client = readValue();
    else if (arg.startsWith('--client=')) opts.client = arg.slice('--client='.length);
    else if (arg === '--install-dir') opts.installDir = readValue();
    else if (arg.startsWith('--install-dir=')) opts.installDir = arg.slice('--install-dir='.length);
    else if (arg === '--no-config') opts.writeConfig = false;
    else if (arg === '--no-smoke-test') opts.smokeTest = false;
    else throw new Error(`Unknown option: ${arg}`);
  }

  return opts;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
}

async function copyBundle(installDir) {
  await mkdir(installDir, { recursive: true });
  await mkdir(join(installDir, 'secrets'), { recursive: true });

  for (const file of ['server.mjs', 'smoke-test.mjs', 'package.json']) {
    await copyFile(join(scriptDir, file), join(installDir, file));
  }
  if (await exists(join(scriptDir, 'package-lock.json'))) {
    await copyFile(join(scriptDir, 'package-lock.json'), join(installDir, 'package-lock.json'));
  }

  await cp(join(repoRoot, 'workflow-registry'), join(installDir, 'workflow-registry'), { recursive: true, force: true });
  await cp(join(repoRoot, 'skills'), join(installDir, 'skills'), { recursive: true, force: true });
}

async function loadBusinessSkillManifests() {
  const registryDir = join(repoRoot, 'workflow-registry');
  const files = await readdir(registryDir);
  const manifests = [];

  for (const file of files.sort()) {
    if (!file.endsWith('.json') || file === 'schema.json') continue;
    const manifest = JSON.parse(await readFile(join(registryDir, file), 'utf8'));
    if (manifest.manifestType === 'business-skill' && manifest.skillPath) {
      manifests.push(manifest);
    }
  }

  return manifests;
}

async function resolveCodexSkillTargetRoot() {
  const userTargetRoot = join(home, '.agents', 'skills');
  try {
    await mkdir(userTargetRoot, { recursive: true });
    await access(userTargetRoot, fsConstants.W_OK);
    return userTargetRoot;
  } catch (error) {
    const repoTargetRoot = join(repoRoot, '.agents', 'skills');
    await mkdir(repoTargetRoot, { recursive: true });
    console.warn(`Cannot write ${userTargetRoot}: ${error.message}`);
    console.warn(`Installing repo-scoped Codex skills instead: ${repoTargetRoot}`);
    return repoTargetRoot;
  }
}

async function installCodexSkills() {
  const targetRoot = await resolveCodexSkillTargetRoot();

  const manifests = await loadBusinessSkillManifests();
  for (const manifest of manifests) {
    const sourceDir = join(repoRoot, dirname(manifest.skillPath));
    const targetDir = join(targetRoot, manifest.id);
    await rm(targetDir, { recursive: true, force: true });
    await cp(sourceDir, targetDir, { recursive: true, force: true });
    console.log(`Installed Codex skill: ${targetDir}`);
  }
}

async function installDependencies(installDir) {
  if (await exists(join(installDir, 'package-lock.json'))) {
    run('npm', ['ci', '--omit=dev'], installDir);
  } else {
    run('npm', ['install', '--omit=dev'], installDir);
  }
}

async function resolveNodeCommand() {
  const candidates = [join(home, '.local', 'bin', 'node'), process.execPath];
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return process.execPath;
}

function serverConfig(installDir, nodeCommand) {
  return {
    command: nodeCommand,
    args: [join(installDir, 'server.mjs')],
  };
}

async function backupIfExists(file) {
  if (!(await exists(file))) return;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  await copyFile(file, `${file}.bak-${stamp}`);
}

async function upsertJsonMcpConfig(file, installDir, nodeCommand) {
  await mkdir(dirname(file), { recursive: true });
  let data = {};
  if (await exists(file)) data = JSON.parse(await readFile(file, 'utf8'));
  data.mcpServers = data.mcpServers || {};
  data.mcpServers[SERVER_NAME] = serverConfig(installDir, nodeCommand);
  await backupIfExists(file);
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function upsertTomlSection(content, header, section) {
  const lines = content.split(/\r?\n/);
  const output = [];
  let skipping = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === header) {
      skipping = true;
      continue;
    }
    if (skipping && trimmed.startsWith('[') && trimmed.endsWith(']')) {
      skipping = false;
    }
    if (!skipping) output.push(line);
  }

  while (output.length && output[output.length - 1] === '') output.pop();
  output.push('', section.trim(), '');
  return output.join('\n');
}

async function upsertCodexConfig(installDir, nodeCommand) {
  const file = join(home, '.codex', 'config.toml');
  await mkdir(dirname(file), { recursive: true });
  const current = await exists(file) ? await readFile(file, 'utf8') : '';
  const section = `[mcp_servers.${SERVER_NAME}]
command = ${JSON.stringify(nodeCommand)}
args = [${JSON.stringify(join(installDir, 'server.mjs'))}]
cwd = ${JSON.stringify(installDir)}
enabled = true
startup_timeout_sec = 120
tool_timeout_sec = 900`;
  await backupIfExists(file);
  await writeFile(file, upsertTomlSection(current, `[mcp_servers.${SERVER_NAME}]`, section), 'utf8');
}

async function writeGenericSnippet(installDir, nodeCommand) {
  const file = join(installDir, 'mcp-config.snippet.json');
  const data = { mcpServers: { [SERVER_NAME]: serverConfig(installDir, nodeCommand) } };
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function configureClient(client, installDir, nodeCommand) {
  const targets = client === 'all' ? ['codex', 'claude', 'cursor', 'generic'] : [client];
  for (const target of targets) {
    if (target === 'codex') {
      await installCodexSkills();
      await upsertCodexConfig(installDir, nodeCommand);
      console.log(`Configured Codex: ${join(home, '.codex', 'config.toml')}`);
    } else if (target === 'claude') {
      const file = join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      await upsertJsonMcpConfig(file, installDir, nodeCommand);
      console.log(`Configured Claude Desktop: ${file}`);
    } else if (target === 'cursor') {
      const file = join(home, '.cursor', 'mcp.json');
      await upsertJsonMcpConfig(file, installDir, nodeCommand);
      console.log(`Configured Cursor MCP JSON: ${file}`);
    } else if (target === 'generic') {
      await writeGenericSnippet(installDir, nodeCommand);
      console.log(`Wrote generic MCP snippet: ${join(installDir, 'mcp-config.snippet.json')}`);
    } else {
      throw new Error(`Unknown client: ${target}`);
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }

  const installDir = resolve(opts.installDir.replace(/^~(?=$|\/)/, home));
  await copyBundle(installDir);
  await installDependencies(installDir);
  const nodeCommand = await resolveNodeCommand();

  if (opts.writeConfig) await configureClient(opts.client, installDir, nodeCommand);
  if (opts.smokeTest) run(process.execPath, ['smoke-test.mjs'], installDir);

  console.log(`Installed ${SERVER_NAME} MCP server.`);
  console.log(`Install dir: ${installDir}`);
  console.log('Webhook URLs can come from manifest transport.url, environment variables, or the install-dir secrets/ folder.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
