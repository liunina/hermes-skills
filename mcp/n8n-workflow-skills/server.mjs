#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = dirname(fileURLToPath(import.meta.url));
const installedRoot = existsSync(join(serverDir, 'workflow-registry')) ? serverDir : '';
const repoRoot = installedRoot || resolve(serverDir, '..', '..');
const registryDir = process.env.WORKFLOW_SKILLS_REGISTRY_DIR || join(repoRoot, 'workflow-registry');
const skillsRoot = process.env.WORKFLOW_SKILLS_ROOT || repoRoot;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readTextIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function loadManifestFiles() {
  if (!existsSync(registryDir)) return [];
  return readdirSync(registryDir)
    .filter((file) => file.endsWith('.json'))
    .filter((file) => file !== 'schema.json')
    .sort()
    .map((file) => join(registryDir, file));
}

function loadSkills() {
  return loadManifestFiles()
    .map((file) => ({
      manifestPath: file,
      ...readJson(file),
    }))
    .filter((skill) => skill.manifestType === 'business-skill');
}

const skills = loadSkills();
const skillsById = new Map(skills.map((skill) => [skill.id, skill]));

function publicManifest(skill) {
  const { manifestPath, transport, ...rest } = skill;
  return {
    ...rest,
    transport: {
      type: transport?.type || '',
      urlEnv: transport?.urlEnv || '',
      timeoutMs: transport?.timeoutMs || 0,
      configured: Boolean(resolveWebhookUrl(skill, false)),
    },
  };
}

function getSkillOrThrow(skillId) {
  const skill = skillsById.get(skillId);
  if (!skill) {
    const error = new Error(`Unknown workflow skill: ${skillId}`);
    error.data = { available: [...skillsById.keys()].sort() };
    throw error;
  }
  return skill;
}

function resolveWebhookUrl(skill, throwOnMissing = true) {
  const transport = skill.transport || {};
  const envValue = transport.urlEnv ? process.env[transport.urlEnv] : '';
  if (envValue) return envValue.trim();

  const secretFile = transport.secretFile ? join(serverDir, transport.secretFile) : '';
  if (secretFile && existsSync(secretFile)) {
    const value = readFileSync(secretFile, 'utf8').trim();
    if (value) return value;
  }

  if (!throwOnMissing) return '';

  const error = new Error(`Webhook URL is not configured for workflow skill: ${skill.id}`);
  error.data = {
    skillId: skill.id,
    expectedEnv: transport.urlEnv || '',
    expectedSecretFile: transport.secretFile || '',
  };
  throw error;
}

function sideEffectsRequested(skill, input) {
  if (skill.sideEffectMode === 'always') {
    return ['__skill_execution__'];
  }
  return (skill.sideEffectFields || []).filter((field) => input?.[field] === true);
}

function toolResult(data, isError = false) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data,
    isError,
  };
}

function errorResult(error) {
  return toolResult({
    ok: false,
    error: 'mcp_tool_error',
    message: error.message,
    ...(error.data || {}),
  }, true);
}

async function executeWebhookSkill(skill, input, options) {
  const payload = {
    ...(skill.defaults || {}),
    ...(input || {}),
  };

  const requestedSideEffects = sideEffectsRequested(skill, payload);
  if (requestedSideEffects.length > 0 && options.confirmSideEffects !== true) {
    const fieldList = requestedSideEffects.includes('__skill_execution__')
      ? ['skill execution']
      : requestedSideEffects;
    return {
      ok: false,
      error: 'side_effect_confirmation_required',
      message: `Confirm side effects before enabling: ${fieldList.join(', ')}`,
      skillId: skill.id,
      sideEffectFields: fieldList,
    };
  }

  const webhookUrl = resolveWebhookUrl(skill);
  const timeoutMs = skill.transport?.timeoutMs || 600000;
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { ok: false, error: 'invalid_json_response', message: text };
  }

  return {
    httpStatus: response.status,
    skillId: skill.id,
    ...data,
  };
}

const server = new McpServer({
  name: 'n8n-workflow-skills',
  version: '0.1.0',
});

server.registerTool(
  'list_workflow_skills',
  {
    description: 'List reusable business workflow skills registered in this skill tap. Implementation components are not exposed as standalone skills.',
    inputSchema: {
      query: z.string().optional().describe('Optional text search over id, name, description, category, and tags.'),
      tag: z.string().optional().describe('Optional exact tag filter.'),
      category: z.string().optional().describe('Optional exact category filter.'),
      includeInactive: z.boolean().optional().describe('Include draft or deprecated skills. Defaults to false.'),
    },
  },
  async (args) => {
    const query = (args.query || '').toLowerCase();
    const tag = args.tag || '';
    const category = args.category || '';
    const includeInactive = args.includeInactive === true;

    const items = skills
      .filter((skill) => includeInactive || skill.status === 'active')
      .filter((skill) => !category || skill.category === category)
      .filter((skill) => !tag || (skill.tags || []).includes(tag))
      .filter((skill) => {
        if (!query) return true;
        const haystack = [
          skill.id,
          skill.name,
          skill.description,
          skill.category,
          ...(skill.tags || []),
        ].join(' ').toLowerCase();
        return haystack.includes(query);
      })
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        status: skill.status,
        category: skill.category,
        tags: skill.tags || [],
        configured: Boolean(resolveWebhookUrl(skill, false)),
        sideEffectMode: skill.sideEffectMode || 'field',
        sideEffectFields: skill.sideEffectFields || [],
      }));

    return toolResult({ ok: true, count: items.length, skills: items });
  },
);

server.registerTool(
  'get_workflow_skill',
  {
    description: 'Read one workflow skill manifest and bundled skill instructions before invoking it.',
    inputSchema: {
      skillId: z.string().describe('Workflow skill id, such as amazon-competitor-analysis.'),
      includeSkillMarkdown: z.boolean().optional().describe('Include SKILL.md content. Defaults to true.'),
      includeContract: z.boolean().optional().describe('Include contract/reference content. Defaults to true.'),
    },
  },
  async (args) => {
    try {
      const skill = getSkillOrThrow(args.skillId);
      const includeSkillMarkdown = args.includeSkillMarkdown !== false;
      const includeContract = args.includeContract !== false;
      const skillMarkdown = includeSkillMarkdown
        ? readTextIfExists(join(skillsRoot, skill.skillPath))
        : '';
      const contract = includeContract && skill.contractPath
        ? readTextIfExists(join(skillsRoot, skill.contractPath))
        : '';

      return toolResult({
        ok: true,
        skill: publicManifest(skill),
        skillMarkdown,
        contract,
      });
    } catch (error) {
      return errorResult(error);
    }
  },
);

server.registerTool(
  'run_workflow_skill',
  {
    description: 'Execute a registered workflow skill. Side effects require confirmSideEffects=true.',
    inputSchema: {
      skillId: z.string().describe('Workflow skill id to run.'),
      input: z.object({}).passthrough().optional().describe('Workflow skill input payload.'),
      confirmSideEffects: z.boolean().optional().describe('Set true only after the user explicitly approves side effects.'),
    },
  },
  async (args) => {
    try {
      const skill = getSkillOrThrow(args.skillId);
      const data = await executeWebhookSkill(skill, args.input || {}, {
        confirmSideEffects: args.confirmSideEffects === true,
      });
      return toolResult(data, data.ok === false || data.httpStatus >= 400);
    } catch (error) {
      return errorResult(error);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('n8n-workflow-skills MCP server running');
