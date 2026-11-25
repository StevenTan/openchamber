import type { SessionInfo, SessionListInput } from '@opencode/client';
import type { ControlClient } from '../openchamber-control/opencode-client.js';
import type { createAntigravityBackend } from './antigravity.js';
import type { AcpConversation } from '@openchamber/sdk/agent-backends';
import { z } from 'zod';
import { isAgentPrompt } from '../openchamber-control/render-page.js';

export interface SessionMessage {
  id: string;
  type: string;
  text?: unknown;
  content?: { type: string; text?: unknown }[];
  model?: { providerID?: unknown; id?: unknown };
  time: { created: number; completed?: number };
}

export const nativeSessionInfo = (session: AcpConversation): SessionInfo => {
  const model = session.config.find(option => option.category === 'model' && option.type === 'select');
  const thought = session.config.find(option => option.category === 'thought_level' && option.type === 'select');
  return { id: session.id, projectID: session.directory, location: { directory: session.directory }, title: session.title,
    agent: 'antigravity', cost: 0, tokens: session.tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    ...session.metadata && { metadata: z.record(z.string(), z.json()).parse(session.metadata) },
    ...model?.type === 'select' && { model: { id: model.currentValue, providerID: 'antigravity', ...thought?.type === 'select' && { variant: thought.currentValue } } },
    time: { created: session.created, updated: session.updated, ...session.archived != null && { archived: session.archived } } };
};

export function createApplicationSessions(options: {
  openCode(directory?: string | null): Promise<ControlClient>;
  antigravity?: ReturnType<typeof createAntigravityBackend> | undefined;
}) {
  const native = (sessionID: string) => sessionID.startsWith('ses_ag_') ? options.antigravity : undefined;
  return {
    async get(sessionID: string) {
      const backend = native(sessionID);
      return backend ? nativeSessionInfo(await backend.get(sessionID)) : (await options.openCode()).session.get({ sessionID });
    },
    async list(input: SessionListInput) {
      const page = await (await options.openCode(input.directory)).session.list(input);
      const own = input.cursor ? [] : (await options.antigravity?.list(input.directory) ?? []).map(nativeSessionInfo);
      if (own.length === 0) return page;
      return { ...page, data: [...page.data, ...own].sort((a, b) => b.time.updated - a.time.updated) };
    },
    async active(sessionID?: string) {
      const backend = sessionID ? native(sessionID) : undefined;
      if (backend) return backend.statuses();
      return { ...await (await options.openCode()).session.active(), ...options.antigravity?.statuses() };
    },
    async messages(sessionID: string, input: { limit?: number; order?: 'asc' | 'desc'; cursor?: string }): Promise<{ data: SessionMessage[]; cursor?: { next?: string | null } }> {
      const backend = native(sessionID);
      if (!backend) return (await options.openCode()).message.list({ sessionID, ...input });
      const session = await backend.get(sessionID);
      let messages = session.turns.flatMap(turn => [
        ...[{ id: turn.id, text: turn.text, created: turn.created }, ...turn.followups].map(message => ({ id: message.id, type: 'user', text: message.text, time: { created: message.created } })),
        { id: turn.assistantID, type: 'assistant', text: turn.updates.flatMap(update => update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text' ? [update.content.text] : []).join(''),
          model: { providerID: 'antigravity', id: turn.modelID }, time: { created: turn.created, ...turn.completed !== undefined && { completed: turn.completed } } },
      ]);
      if (input.order === 'desc') messages = messages.reverse();
      const offset = Number(input.cursor ?? 0);
      const data = messages.slice(offset, input.limit ? offset + input.limit : undefined);
      return { data, cursor: { next: offset + data.length < messages.length ? String(offset + data.length) : null } };
    },
    async rename(sessionID: string, title: string) {
      const backend = native(sessionID);
      if (backend) await backend.rename(sessionID, title);
      else await (await options.openCode()).session.update({ sessionID, title });
    },
    async interrupt(sessionID: string) {
      const backend = native(sessionID);
      if (!backend) return (await options.openCode()).session.interrupt({ sessionID });
      const interrupted = Boolean(backend.statuses()[sessionID]);
      await backend.abort(sessionID);
      return { interrupted };
    },
    async hasPendingInput(sessionID: string) {
      if (native(sessionID)) return false;
      return (await (await options.openCode()).session.inbox.list({ sessionID })).some(item => item.type === 'user' && item.delivery === 'steer' && !isAgentPrompt(item.payload.metadata));
    },
  };
}

export type ApplicationSessions = ReturnType<typeof createApplicationSessions>;
