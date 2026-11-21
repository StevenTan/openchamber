import { spawn } from 'node:child_process';
import { Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import type { RequestPermissionRequest, RequestPermissionResponse, SessionNotification } from '@agentclientprotocol/sdk';
import { antigravityAuthMethod, antigravityLaunch } from './antigravity.js';
import { withoutInjectedEnv } from '../injected-env.js';

export interface AcpBackendHost {
  update(notification: SessionNotification): void;
  permission(request: RequestPermissionRequest): Promise<RequestPermissionResponse>;
}

export class AcpBackend {
  private connection: acp.ClientConnection | undefined;
  private process: ReturnType<typeof spawn> | undefined;
  private opening: Promise<acp.InitializeResponse> | undefined;
  private loaded = new Set<string>();
  private readonly host: AcpBackendHost;
  private readonly command: string;
  private readonly args: string[];

  constructor(host: AcpBackendHost, command?: string, args?: string[]) {
    this.host = host;
    const launch = antigravityLaunch();
    this.command = command ?? launch.command;
    this.args = args ?? launch.args;
  }

  private open() {
    if (this.opening) return this.opening;
    const env = withoutInjectedEnv(process.env);
    delete env.ELECTRON_RUN_AS_NODE;
    env.AGY_CLI_DISABLE_AUTO_UPDATE = '1';
    const child = spawn(this.command, this.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env });
    this.process = child;
    const output: AsyncIterator<Uint8Array> = child.stdout[Symbol.asyncIterator]();
    const readable = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const item = await output.next();
        if (item.done) controller.close();
        else controller.enqueue(item.value);
      },
    });
    const connection = acp.client({ name: 'OpenChamber' })
      .onNotification(acp.methods.client.session.update, ({ params }) => this.host.update(params))
      .onRequest(acp.methods.client.session.requestPermission, ({ params }) => this.host.permission(params))
      .connect(acp.ndJsonStream(Writable.toWeb(child.stdin), readable));
    this.connection = connection;
    child.stderr.resume();
    child.once('error', error => connection.close(error));
    child.once('exit', (code, signal) => connection.close(new Error(`Antigravity exited (${signal ?? code}).`)));
    this.opening = connection.agent.request(acp.methods.agent.initialize, { protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: {} }).then(async init => {
      const methodId = antigravityAuthMethod(env);
      if (methodId) await connection.agent.request(acp.methods.agent.authenticate, { methodId });
      return init;
    });
    return this.opening;
  }

  async create(directory: string) {
    await this.open();
    const response = await this.agent().request(acp.methods.agent.session.new, { cwd: directory, mcpServers: [] });
    this.loaded.add(response.sessionId);
    return response.sessionId;
  }

  async restore(nativeId: string, directory: string) {
    if (this.loaded.has(nativeId)) return;
    const init = await this.open();
    if (!init.agentCapabilities?.loadSession) throw new Error('This Antigravity version does not support restoring sessions.');
    await this.agent().request(acp.methods.agent.session.load, { sessionId: nativeId, cwd: directory, mcpServers: [] });
    this.loaded.add(nativeId);
  }

  async prompt(nativeId: string, text: string) {
    return this.agent().request(acp.methods.agent.session.prompt, { sessionId: nativeId, prompt: [{ type: 'text', text }] });
  }

  async cancel(nativeId: string) {
    await this.agent().notify(acp.methods.agent.session.cancel, { sessionId: nativeId });
  }

  private agent() {
    if (!this.connection) throw new Error('The agent is not connected.');
    return this.connection.agent;
  }

  stop() {
    this.connection?.close();
    this.process?.kill();
  }
}
