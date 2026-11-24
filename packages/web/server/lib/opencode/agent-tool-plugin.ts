import fs from 'node:fs/promises';
import path from 'node:path';
import type { ToolOptions } from '../agent-tool/runtime.js';
import { browserMcpSetup } from '../browser-control/mcp.js';
import { controlMcpSetup } from '../agent-tool/control-mcp.js';
import { LEAD_COMPACTION_HOOK } from '../session-lead/agent-tool-plugin.js';
import { COMMAND_PLUGIN_ID, createCommandPluginSource } from '../agent-command/src/plugin.js';
import {
  OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS,
  OPENCHAMBER_SCHEDULE_ACTION_DEFINITIONS,
  OPENCHAMBER_WEB_ACTION_DEFINITIONS,
  OPENCHAMBER_MEMORY_ACTION_DEFINITIONS,
  OPENCHAMBER_KNOWLEDGE_ACTION_DEFINITIONS,
  OPENCHAMBER_NOTIFY_ACTION_DEFINITIONS,
  OPENCHAMBER_RENDER_ACTION_DEFINITIONS,
  OPENCHAMBER_IMAGE_ACTION_DEFINITIONS,
  OPENCHAMBER_SECRET_ACTION_DEFINITIONS,
  OPENCHAMBER_USAGE_ACTION_DEFINITIONS,
  OPENCHAMBER_TERMINAL_ACTION_DEFINITIONS,
} from '../openchamber-control/actions.js';

const PLUGIN_ID = 'openchamber-agent-tool';
const OPENCODE_TOOLS_REPLACED_BY_CONTROL = ['opencode_worktree_create', 'opencode_models'];

const AGENT_TOOL_ACTION_TITLES = Object.fromEntries(
  [
    ...OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS,
    ...OPENCHAMBER_SCHEDULE_ACTION_DEFINITIONS,
    ...OPENCHAMBER_WEB_ACTION_DEFINITIONS,
    ...OPENCHAMBER_MEMORY_ACTION_DEFINITIONS,
    ...OPENCHAMBER_KNOWLEDGE_ACTION_DEFINITIONS,
    ...OPENCHAMBER_NOTIFY_ACTION_DEFINITIONS,
    ...OPENCHAMBER_RENDER_ACTION_DEFINITIONS,
    ...OPENCHAMBER_IMAGE_ACTION_DEFINITIONS,
    ...OPENCHAMBER_SECRET_ACTION_DEFINITIONS,
    ...OPENCHAMBER_USAGE_ACTION_DEFINITIONS,
    ...OPENCHAMBER_TERMINAL_ACTION_DEFINITIONS,

  ].map(({ action, title }) => [action, title]),
);

const createPluginSource = ({ includeControl, includeSchedule, includeWeb, includeMemory, includeKnowledge, includeNotify, includeRender, includeImage, includeSecret, includeUsage, includeTerminal }: Required<ToolOptions>) => {
  if (!includeControl && !includeSchedule && !includeWeb && !includeMemory && !includeKnowledge && !includeNotify && !includeRender && !includeImage && !includeSecret && !includeUsage && !includeTerminal) {
    throw new Error('At least one OpenChamber managed tool must be enabled to inject the plugin');
  }
  const entries = [];
  if (includeControl) {
    entries.push(`    for (const id of ${JSON.stringify(OPENCODE_TOOLS_REPLACED_BY_CONTROL)}) tools.remove(id)
`);
  }

  return `const exemptCallbackFromProxy = () => {
  const endpoint = process.env.OPENCHAMBER_AGENT_TOOL_URL
  if (!endpoint || !URL.canParse(endpoint)) return
  const host = new URL(endpoint).hostname.replace(/^\\[|\\]$/g, "")
  for (const key of ["NO_PROXY", "no_proxy"]) {
    const entries = (process.env[key] || "").split(",").map((entry) => entry.trim()).filter(Boolean)
    if (!entries.includes(host)) process.env[key] = [...entries, host].join(",")
  }
}

export default {
  id: ${JSON.stringify(PLUGIN_ID)},
  setup: async (ctx) => {
    exemptCallbackFromProxy()
    await ctx.tool.transform((tools) => {
${entries.join('')}    })${includeWeb ? browserMcpSetup(AGENT_TOOL_ACTION_TITLES) : ''}${includeMemory || includeKnowledge || includeUsage || includeNotify || includeControl || includeSchedule || includeTerminal || includeRender || includeImage || includeSecret ? controlMcpSetup(AGENT_TOOL_ACTION_TITLES) : ''}${includeControl ? LEAD_COMPACTION_HOOK : ''}
  },
}
`;
};

const PLUGIN_PACKAGE_JSON = `${JSON.stringify({
  name: 'openchamber-agent-tool',
  version: '0.0.0',
  private: true,
  type: 'module',
  exports: { '.': './index.js' },
}, null, 2)}\n`;

export async function materializeAgentToolPlugin(instanceDir: string, options: Required<ToolOptions>) {
  const source = createPluginSource(options);
  const directory = path.join(instanceDir, 'agent-tool', PLUGIN_ID);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'package.json'), PLUGIN_PACKAGE_JSON, { mode: 0o600 });
  await fs.writeFile(path.join(directory, 'index.js'), source, { mode: 0o600 });
  return directory;
}

export async function materializeCommandPlugin(instanceDir: string) {
  const pluginDirectory = path.join(instanceDir, "agent-tool", COMMAND_PLUGIN_ID);
  const source = createCommandPluginSource();
  await fs.mkdir(pluginDirectory, { recursive: true });
  for (const [name, content] of [
    [
      "package.json",
      JSON.stringify({
        name: COMMAND_PLUGIN_ID,
        version: "0.0.0",
        private: true,
        type: "module",
        exports: { ".": "./index.js" },
      }) + "\n",
    ],
    ["index.js", source],
  ] as const) {
    const file = path.join(pluginDirectory, name);
    const previous = await fs
      .readFile(file, "utf8")
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
    if (previous !== content)
      await fs.writeFile(file, content, { mode: 0o600 });
  }
  return pluginDirectory;
}
