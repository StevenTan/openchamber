#!/usr/bin/env node
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION, RequestError } from '@agentclientprotocol/sdk';
import { Readable, Writable } from 'node:stream';
import { createInterface } from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const profile = process.argv[process.argv.indexOf('--gemini-dir') + 1];
const token = path.join(profile, 'antigravity-acp', 'antigravity-oauth-token');

if (process.argv.includes('--login')) {
  process.stdout.write('https://accounts.google.com/o/oauth2/v2/auth?state=fixture\n');
  for await (const code of createInterface({ input: process.stdin })) {
    if (code !== 'fixture-code') process.exit(1);
    await fs.writeFile(path.join(process.cwd(), 'login-environment.json'), JSON.stringify({ geminiHome: process.env.GEMINI_HOME, fileStorage: process.env.AGY_ACP_FORCE_FILE_STORAGE, ssh: process.env.SSH_CONNECTION }));
    await fs.mkdir(path.dirname(token), { recursive: true });
    await fs.writeFile(token, 'fixture');
    process.exit(0);
  }
  process.exit(1);
}

const model = value => [{ id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: value, options: [{ value: 'fixture', name: 'Fixture' }, { value: 'second', name: 'Second' }] }];
let pending;
let count = 0;
const connection = new AgentSideConnection(client => ({
  initialize: async () => ({ protocolVersion: PROTOCOL_VERSION, agentCapabilities: { loadSession: true, mcpCapabilities: { http: true } }, authMethods: [] }),
  authenticate: async () => ({}),
  logout: async () => { await fs.unlink(token); return {}; },
  newSession: async () => {
    if (process.env.AGY_FIXTURE_REJECT_ACCOUNT === '1') throw new RequestError(-32000, 'Account access denied');
    return { sessionId: `native-${++count}`, configOptions: model('fixture') };
  },
  loadSession: async () => ({ configOptions: model('fixture') }),
  setSessionConfigOption: async input => ({ configOptions: model(input.value) }),
  closeSession: async () => ({}),
  cancel: async () => { pending?.({ stopReason: 'cancelled' }); pending = undefined; },
  prompt: async input => {
    const text = input.prompt.filter(part => part.type === 'text').map(part => part.text).join('');
    if (text === 'usage') {
      const directory = path.join(profile, 'antigravity-acp', 'conversations');
      await fs.mkdir(directory, { recursive: true });
      const db = new DatabaseSync(path.join(directory, `${input.sessionId}.db`));
      db.exec('CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB)');
      db.prepare('INSERT INTO gen_metadata VALUES (0, ?)').run(Uint8Array.from([10, 18, 34, 10, 16, 5, 24, 4, 32, 2, 40, 23, 72, 2, 74, 4, 82, 2, 32, 64]));
      db.close();
      await client.sessionUpdate({ sessionId: input.sessionId, update: { sessionUpdate: 'usage_update', used: 32, size: 128 } });
    }
    const waiting = text === 'working' ? new Promise(resolve => { pending = resolve; }) : undefined;
    await client.sessionUpdate({ sessionId: input.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } });
    if (waiting) return waiting;
    pending?.({ stopReason: 'end_turn' });
    pending = undefined;
    return { stopReason: 'end_turn' };
  },
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
await connection.closed;
