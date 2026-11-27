import { acpSession, acpCatalog } from '@openchamber/sdk/conversations/antigravity';
import type { ConversationApi } from './conversation-contract.js';
import type { createAntigravityBackend } from './antigravity.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import os from 'node:os';
import fs from 'node:fs/promises';
import { z } from 'zod';
import type { SessionApi } from '@opencode/client/promise/api';
import type { FormField, FormRequest } from '@openchamber/sdk/conversations/requests';
import type { MessageListOptions } from '@openchamber/sdk/conversations/http';

type NativeForm = Parameters<SessionApi['form']['create']>[0];

function projectField(field: NativeForm['fields'][number]): FormField {
  if (field.type === 'external') return field;
  const { when, ...rest } = field;
  const conditions = when ? { when: when.map(condition => ({ ...condition })) } : {};
  if (rest.type === 'multiselect') {
    const { options, default: selected, ...value } = rest;
    return { ...value, ...conditions, options: options.map(option => ({ ...option })), ...selected && { default: [...selected] } };
  }
  if (rest.type === 'string') {
    const { options, ...value } = rest;
    return { ...value, ...conditions, ...options && { options: options.map(option => ({ ...option })) } };
  }
  return { ...rest, ...conditions };
}

function projectForm(form: NativeForm): FormRequest {
  const [first, ...rest] = form.fields;
  return { id: z.string().parse(form.id), sessionID: form.sessionID, title: form.title, fields: [projectField(first), ...rest.map(projectField)], ...form.metadata && { metadata: form.metadata } };
}

const historyCursor = z.object({ id: z.string(), order: z.enum(['asc', 'desc']), direction: z.literal('next') });

function paginate<T>(records: T[], input: MessageListOptions, id: (record: T) => string) {
  const position = input.cursor ? historyCursor.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString())) : undefined;
  const order = position?.order ?? input.order ?? 'desc';
  const ordered = order === 'desc' ? records.toReversed() : records;
  const start = position ? ordered.findIndex(record => id(record) === position.id) + 1 : 0;
  const end = start + (input.limit ?? ordered.length);
  const items = ordered.slice(start, end);
  const last = items.at(-1);
  return { items, cursor: last && end < ordered.length ? { next: Buffer.from(JSON.stringify({ id: id(last), order, direction: 'next' })).toString('base64url') } : {} };
}

export function createAntigravityConversations(backend: ReturnType<typeof createAntigravityBackend>, directory?: string): ConversationApi {
  return {
    async create(input) {
      const session = await backend.create(directory ?? os.homedir(), input.title, input.id);
      if (input.model) await backend.model(session.id, input.model.id, input.model.variant);
      return acpSession(await backend.get(session.id));
    },
    async list(input) {
      const sessions = (await backend.list(input.global ? undefined : directory)).map(acpSession)
        .filter(session => !input.parentID && (!input.search || session.title.includes(input.search)))
        .sort((a, b) => a.time.updated - b.time.updated || a.id.localeCompare(b.id));
      const page = paginate(sessions, { ...input, limit: input.limit ?? 100 }, session => session.id);
      return { sessions: page.items, cursor: page.cursor };
    },
    get: async id => acpSession(await backend.get(id)),
    remove: id => backend.remove(id),
    rename: (id, title) => backend.rename(id, title),
    messages: (id, input) => backend.messages(id, input),
    async message(id, messageID) {
      const message = await backend.message(id, messageID);
      if (!message) throw new OpenChamberControlError('Message not found', 404);
      return message;
    },
    inbox: async () => [],
    model: (id, model) => backend.model(id, model.id, model.variant),
    agent: async (_id, agent) => { if (agent !== 'antigravity') throw new OpenChamberControlError(`Unsupported Antigravity agent: ${agent}`, 400); },
    context: async (_id, input) => [input],
    prompt: (id, input) => backend.send(id, input),
    interrupt: id => backend.abort(id),
    catalog: async sessionID => acpCatalog(await (sessionID ? backend.get(sessionID) : backend.prepare(directory ?? os.homedir()))),
    providers: async () => [{ id: 'antigravity', name: 'Antigravity', activation: 'enabled', package: 'antigravity' }],
    agents: async () => [{ id: 'antigravity', name: 'antigravity', displayName: 'Antigravity', request: { settings: {}, headers: {}, body: {} }, mode: 'primary', hidden: false, permissions: [] }],
    pendingForms: async () => (await backend.list(directory)).flatMap(session => session.forms.filter(form => form.state.status === 'pending').map(projectForm)),
    pendingPermissions: async () => [],
    replyPermission: async () => { throw new OpenChamberControlError('Permission request not found', 404); },
    replyForm: (sessionID, formID, answer) => backend.questionSession.form.reply({ sessionID, formID, answer }),
    cancelForm: (sessionID, formID) => backend.questionSession.form.cancel({ sessionID, formID }),
    async location() {
      const folder = directory ?? os.homedir();
      return { directory: folder, project: { id: folder, directory: folder, canonical: await fs.realpath(folder) } };
    },
    configuration: async () => ({ defaultAgent: 'antigravity' }),
    projects: async () => [...new Set((await backend.list()).map(session => session.directory))].map(folder => ({ id: folder, worktree: folder, time: { created: 0, updated: 0 }, sandboxes: [] })),
    vcs: async () => ({}),
    statuses: async () => backend.statuses(),
    stageRevert: (id, messageID) => backend.stageRevert(id, messageID),
    clearRevert: id => backend.clearRevert(id),
    commitRevert: id => backend.commitRevert(id),
    fork: async (id, before) => acpSession(await backend.fork(id, before)),
  };
}
