import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentToolCall } from '@openchamber/sdk/agent-backends';
import { z } from 'zod';
import { toolResultMetadata } from './tool-metadata.js';
import type { McpCallContext } from './mcp-context.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const jsonObject = (value: NonNullable<CallToolResult['structuredContent']>) => z.record(z.string(), z.json()).parse(JSON.parse(JSON.stringify(value)));

export function createToolActivity(options: {
  dataDir: string;
  anchor(sessionID: string): { turnID?: string | undefined; messageID?: string | undefined };
  changed(sessionID: string, call: AgentToolCall, turnID: string | undefined): Promise<void>;
}) {
  const root = path.join(options.dataDir, 'tool-activity');
  const ready = fs.mkdir(root, { recursive: true });
  const save = async (sessionID: string, turnID: string | undefined, call: AgentToolCall) => {
    await ready;
    await fs.appendFile(path.join(root, `${sessionID}.jsonl`), JSON.stringify({ turnID, call }) + '\n', { mode: 0o600 });
    await options.changed(sessionID, call, turnID);
  };
  const record = (sessionID: string, callID: string, source?: Pick<McpCallContext, 'messageID' | 'partID'>): NonNullable<McpCallContext['record']> => async (namespace, name, input, execute) => {
    const anchor = options.anchor(sessionID);
    const { turnID } = anchor;
    const messageID = source?.messageID ?? anchor.messageID;
    const parsedInput = jsonObject(input);
    const call: AgentToolCall = { id: randomUUID(), callID, namespace, name, input: parsedInput, started: Date.now(), ...messageID && { messageID }, ...source?.partID && { partID: source.partID } };
    await save(sessionID, turnID, call);
    try {
      const result = await execute(metadata => save(sessionID, turnID, { ...call, metadata: jsonObject(metadata) }));
      const { structuredContent, _meta, ...rest } = result;
      const recorded = { ...rest, content: result.content, ...structuredContent && { structuredContent: jsonObject(structuredContent) }, ..._meta && { _meta: jsonObject(_meta) } };
      await save(sessionID, turnID, { ...call, completed: Date.now(), result: recorded, ...recorded.structuredContent && !result.isError && { metadata: jsonObject(toolResultMetadata(namespace, name, recorded.structuredContent, parsedInput)) } });
      return result;
    } catch (error) {
      await save(sessionID, turnID, { ...call, completed: Date.now(), error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };
  return { record };
}
