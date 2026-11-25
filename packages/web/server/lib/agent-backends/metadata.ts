import { createSessionMetadataStore } from '../openchamber-sessions/session-metadata-store.js';
import type { MetadataDecider, OpenCodeSessionMetadata, SessionMetadata } from '../openchamber-sessions/session-metadata-store.js';
import { isRecord } from '../shared/guards.js';
import type { createAntigravityBackend } from './antigravity.js';

export function createBackendMetadata(options: {
  dataDir: string;
  backend(): ReturnType<typeof createAntigravityBackend>;
  openCode: OpenCodeSessionMetadata;
  onWrite(sessionID: string, metadata: SessionMetadata | undefined): void;
  publish(event: { type: 'openchamber:session-metadata'; properties: { sessionID: string; metadata: SessionMetadata | undefined } }): void;
  notifyGoalChanged(sessionID: string, directory: string, metadata: SessionMetadata | undefined): Promise<void>;
}) {
  const store = createSessionMetadataStore({
    dataDir: options.dataDir,
    openCode: {
      read: (sessionID, input) => sessionID.startsWith('ses_ag_') ? options.backend().get(sessionID).then(session => session.metadata ?? {}) : options.openCode.read(sessionID, input),
      write: (sessionID, metadata, input) => (sessionID.startsWith('ses_ag_') ? options.backend().metadata(sessionID, metadata) : options.openCode.write(sessionID, metadata, input)).then(() => options.onWrite(sessionID, metadata)),
    },
  });
  const persist = async (sessionID: string, patch: SessionMetadata, { directory = '' }: { directory?: string | undefined } = {}) => {
    const metadata = await store.setSessionMetadata(sessionID, patch, { directory });
    options.publish({ type: 'openchamber:session-metadata', properties: { sessionID, metadata } });
    if (isRecord(patch.openchamber) && 'goal' in patch.openchamber) {
      void Promise.resolve(options.notifyGoalChanged(sessionID, directory, metadata))
        .catch((error) => console.warn('[session-goal] could not arm after a goal change:', error?.message ?? error));
    }
    return metadata;
  };
  const update = async (sessionID: string, decide: MetadataDecider, { directory = '' }: { directory?: string | undefined } = {}) => {
    const result = await store.updateSessionMetadata(sessionID, decide, { directory });
    if (result.changed) options.publish({ type: 'openchamber:session-metadata', properties: { sessionID, metadata: result.metadata } });
    return result;
  };
  return { store, read: store.get, persist, update };
}
