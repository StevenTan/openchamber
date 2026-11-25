import { recordedTurnDiffSchema } from '@openchamber/sdk/agent-backends';
import { runtimeFetch } from '../runtime-fetch';

export const turnDiffClient = {
  async read(sessionID: string, turnID: string, directory?: string | null) {
    const response = await runtimeFetch('/api/openchamber/turn-diffs', { query: { sessionID, turnID, ...directory && { directory } } });
    if (!response.ok) throw new Error(`Turn diff read failed: ${response.status}`);
    return recordedTurnDiffSchema.parse(await response.json());
  },
};
