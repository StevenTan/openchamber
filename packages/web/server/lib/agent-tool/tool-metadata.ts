import { Schema } from 'effect';
import {
  OPENCHAMBER_WEB_ACTION_DEFINITIONS, OPENCHAMBER_MEMORY_ACTION_DEFINITIONS,
  OPENCHAMBER_KNOWLEDGE_ACTION_DEFINITIONS, OPENCHAMBER_USAGE_ACTION_DEFINITIONS,
  OPENCHAMBER_NOTIFY_ACTION_DEFINITIONS,
  OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS, OPENCHAMBER_SCHEDULE_ACTION_DEFINITIONS,
  OPENCHAMBER_TERMINAL_ACTION_DEFINITIONS,
} from '../openchamber-control/actions.js';

const object = Schema.decodeUnknownSync(Schema.JsonObject);
const titles = Object.fromEntries([
  ...OPENCHAMBER_WEB_ACTION_DEFINITIONS, ...OPENCHAMBER_MEMORY_ACTION_DEFINITIONS,
  ...OPENCHAMBER_KNOWLEDGE_ACTION_DEFINITIONS, ...OPENCHAMBER_USAGE_ACTION_DEFINITIONS,
  ...OPENCHAMBER_NOTIFY_ACTION_DEFINITIONS,
  ...OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS, ...OPENCHAMBER_SCHEDULE_ACTION_DEFINITIONS,
  ...OPENCHAMBER_TERMINAL_ACTION_DEFINITIONS,
].map(({ action, title }) => [action, title]));


export function toolResultMetadata(namespace: string, name: string, value: Schema.Json, args: Schema.Json): Schema.JsonObject {
  if (namespace === 'openchamber' && name === 'execute') return {};
  if (namespace === 'file') return name === 'view_image' ? {} : object({ files: object(value).files, openchamberTurnDiff: object(value).openchamberTurnDiff });
  if (namespace === 'request') return object({ questionID: object(value).question_id });
  if (namespace === 'openchamber' || namespace === 'browser' && name === 'panel') {
    const output = object(value);
    const action = Schema.decodeUnknownSync(Schema.String)(output.action);
    const answer = object(output.data ?? {}).answer;
    return object({ openchamber: { schemaVersion: 1, action, description: titles[action] ?? action, ok: output.ok, ...answer !== undefined && { answer } } });
  }
  if (namespace === 'openchamber_commands') {
    const output = object(value);
    if (name === 'clock_sleep') return output;
    if (name === 'store' || name === 'load') return {};
    return object({ status: output.status, session_id: output.session_id, truncated: output.truncated,
      ...output.status === 'completed' && { exit_code: output.exit_code },
      ...name === 'exec_command' && { command: object(args).cmd } });
  }
  return {};
}

