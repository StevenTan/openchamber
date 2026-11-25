import type { SessionPayload } from '../openchamber-sessions/routes.js';
import type { BackendRegistry } from './registry.js';
import type { DispatchContext } from './contracts.js';

export function createBackendSessionService(openCode: DispatchContext['openCode'], registry: BackendRegistry, syncKnowledge: DispatchContext['syncKnowledge'], chatsScope: DispatchContext['chatsScope']) {
  const context = { openCode, syncKnowledge, chatsScope };
  const forSession = (sessionID?: string) => registry.forSession(sessionID).dispatch(context);
  return {
    ...openCode,
    async create(payload: SessionPayload = {}, options: Parameters<typeof openCode.create>[1] = {}) {
      await registry.ready;
      return registry.forInput(payload).dispatch(context).create(payload, options);
    },
    async send(sessionID: string | undefined, payload: SessionPayload | null | undefined) {
      await registry.ready;
      return forSession(sessionID).send(sessionID, payload);
    },
    async fork(sessionID: string | undefined, payload: SessionPayload | null | undefined) {
      await registry.ready;
      return forSession(sessionID).fork(sessionID, payload);
    },
    queueBackend: (sessionID: string) => forSession(sessionID).queueBackend(sessionID),
  };
}
