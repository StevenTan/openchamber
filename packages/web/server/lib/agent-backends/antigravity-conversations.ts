import { acpSession, acpMessages, acpCatalog } from '@openchamber/sdk/conversations/antigravity';
import type { ConversationApi } from './conversation-contract.js';
import type { createAntigravityBackend } from './antigravity.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import os from 'node:os';
import { z } from 'zod';
import type { SessionApi } from '@opencode/client/promise/api';
import type { FormField, FormRequest } from '@openchamber/sdk/conversations/requests';

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

export function createAntigravityConversations(backend: ReturnType<typeof createAntigravityBackend>, directory?: string): ConversationApi {
  const history = async (id: string) => { const session = await backend.get(id); return session.turns.flatMap(turn => acpMessages(session, turn)); };
  return {
    async create(input) {
      const session = await backend.create(directory ?? os.homedir(), input.title, input.id);
      if (input.model) await backend.model(session.id, input.model.id, input.model.variant);
      return acpSession(await backend.get(session.id));
    },
    list: async input => ({ sessions: input.cursor ? [] : (await backend.list(input.global ? undefined : directory)).map(acpSession).filter(session => !input.parentID && (!input.search || session.title.includes(input.search))), cursor: {} }),
    get: async id => acpSession(await backend.get(id)),
    remove: id => backend.remove(id),
    rename: (id, title) => backend.rename(id, title),
    messages: async id => ({ items: (await history(id)).reverse(), cursor: {} }),
    async message(id, messageID) {
      const message = (await history(id)).find(item => item.info.id === messageID);
      if (!message) throw new OpenChamberControlError('Message not found', 404);
      return message;
    },
    inbox: async () => [],
    model: (id, model) => backend.model(id, model.id, model.variant),
    agent: async (_id, agent) => { if (agent !== 'antigravity') throw new OpenChamberControlError(`Unsupported Antigravity agent: ${agent}`, 400); },
    context: async (_id, input) => [input],
    skills: async names => ({ attached: [], unresolved: [...names] }),
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
  };
}
