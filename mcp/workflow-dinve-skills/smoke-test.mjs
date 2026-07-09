#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = dirname(fileURLToPath(import.meta.url));
const client = new Client({ name: 'workflow-dinve-skills-smoke-test', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(serverDir, 'server.mjs')],
  cwd: serverDir,
  env: {
    PATH: process.env.PATH || '',
  },
  stderr: 'pipe',
});

transport.stderr?.on('data', (chunk) => process.stderr.write(chunk));

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name);
  for (const required of ['list_workflow_skills', 'get_workflow_skill', 'run_workflow_skill']) {
    if (!toolNames.includes(required)) {
      throw new Error(`Missing tool: ${required}`);
    }
  }

  const listed = await client.callTool({ name: 'list_workflow_skills', arguments: {} });
  const listedText = listed.content?.[0]?.text || '';
  const listedData = JSON.parse(listedText);
  const skillIds = new Set((listedData.skills || []).map((skill) => skill.id));
  for (const required of [
    'amazon-competitor-analysis',
  ]) {
    if (!skillIds.has(required)) {
      throw new Error(`${required} not listed: ${listedText}`);
    }
  }
  for (const component of [
    'publish-markdown-to-wiki',
    'send-mattermost-notification',
  ]) {
    if (skillIds.has(component)) {
      throw new Error(`Component manifest should not be listed as a workflow skill: ${component}`);
    }
  }

  let guardedSkillCount = 0;
  for (const skillId of skillIds) {
    const details = await client.callTool({
      name: 'get_workflow_skill',
      arguments: {
        skillId,
        includeSkillMarkdown: false,
        includeContract: false,
      },
    });
    const detailsText = details.content?.[0]?.text || '';
    const detailsData = JSON.parse(detailsText);
    if (detailsData.ok !== true) {
      throw new Error(`get_workflow_skill failed for ${skillId}: ${detailsText}`);
    }

    const expectedSmokeError = detailsData.skill?.expectedSmokeError;
    if (!expectedSmokeError) continue;

    const guarded = await client.callTool({
      name: 'run_workflow_skill',
      arguments: {
        skillId,
        input: detailsData.skill.safeSmokeInput || {},
      },
    });
    const guardedText = guarded.content?.[0]?.text || '';
    if (!guarded.isError || !guardedText.includes(expectedSmokeError)) {
      throw new Error(`smoke guard failed for ${skillId}: ${guardedText}`);
    }
    guardedSkillCount += 1;
  }

  console.log(JSON.stringify({
    ok: true,
    tools: toolNames,
    listedAmazonCompetitorSkill: true,
    hiddenComponentWorkflows: true,
    sideEffectGuarded: guardedSkillCount > 0,
    guardedSkillCount,
  }, null, 2));
} finally {
  await transport.close();
}
