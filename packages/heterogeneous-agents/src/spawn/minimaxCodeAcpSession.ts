import type { AgentStreamEvent } from '@lobechat/agent-gateway-client';

import type { AcpRpcMessage } from './acpStdioClient';
import { AcpRpcResponseError, AcpServerRequestError, AcpStdioClient } from './acpStdioClient';
import { AgentStreamPipeline } from './agentStreamPipeline';
import type { HeterogeneousAgentRuntimeStatus } from './claudeAgentSdkSession';
import type { AgentPromptInput, BuildAgentInputOptions } from './input';
import { normalizeImage } from './input';

const ACP_PROTOCOL_VERSION = 1;
const NOTIFICATION_DRAIN_QUIET_MS = 250;
const NOTIFICATION_DRAIN_TIMEOUT_MS = 2000;
const TRANSPORT = 'minimax-code-acp' as const;
const AUTH_REQUIRED_MESSAGE = 'MiniMax Code could not authenticate. Run `mcode login`, then retry.';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface MinimaxCodeAcpTextPromptBlock {
  text: string;
  type: 'text';
}

export interface MinimaxCodeAcpImagePromptBlock {
  data: string;
  mimeType: string;
  type: 'image';
}

export type MinimaxCodeAcpPromptBlock =
  MinimaxCodeAcpImagePromptBlock | MinimaxCodeAcpTextPromptBlock;

export const buildMinimaxCodeAcpArgs = (extraArgs: string[] = []): string[] => [
  'acp',
  ...extraArgs,
];

export const buildMinimaxCodeAcpPrompt = async (
  prompt: AgentPromptInput,
  options: BuildAgentInputOptions = {},
): Promise<MinimaxCodeAcpPromptBlock[]> => {
  const blocks = typeof prompt === 'string' ? [{ text: prompt, type: 'text' as const }] : prompt;
  const result: MinimaxCodeAcpPromptBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'text') {
      result.push({ text: block.text, type: 'text' });
    } else {
      const image = await normalizeImage(block.source, options);
      result.push({
        data: image.buffer.toString('base64'),
        mimeType: image.mediaType,
        type: 'image',
      });
    }
  }
  return result;
};

interface MinimaxCodeAcpInitializeResult {
  agentCapabilities?: {
    loadSession?: boolean;
    promptCapabilities?: { image?: boolean };
    sessionCapabilities?: { close?: unknown; resume?: unknown };
  };
  protocolVersion?: number;
}

interface MinimaxCodeAcpSessionResult {
  sessionId?: string;
}

interface MinimaxCodeAcpPromptResult {
  stopReason?: string;
}

interface MinimaxCodeAcpPermissionOption {
  kind?: unknown;
  optionId?: unknown;
}

export interface MinimaxCodeAcpSessionOptions {
  args: string[];
  clientVersion: string;
  commandPath: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  inputOptions?: BuildAgentInputOptions;
  onEvents: (events: AgentStreamEvent[]) => Promise<void> | void;
  onRawMessage: (line: string) => Promise<void> | void;
  onRuntimeStatus: (status: HeterogeneousAgentRuntimeStatus) => void;
  onSessionId: (sessionId: string) => void;
  onStderr: (data: string) => Promise<void> | void;
  operationId: string;
  prompt: AgentPromptInput | MinimaxCodeAcpPromptBlock[];
  requestTimeoutMs?: number;
  resumeSessionId?: string;
  sessionId: string;
}

const isAuthRequiredError = (error: unknown): boolean => {
  if (error instanceof AcpRpcResponseError) {
    if (error.rpcError.code === -32_000) return true;
    const detail = [
      error.message,
      error.rpcError.message,
      JSON.stringify(error.rpcError.data ?? ''),
    ]
      .join(' ')
      .toLowerCase();
    return detail.includes('authentication required') || detail.includes('mcode login');
  }
  if (error instanceof Error) {
    return /authentication required|mcode login|sign in to minimax/i.test(error.message);
  }
  return false;
};

const wrapAuthError = (error: unknown): Error => {
  if (isAuthRequiredError(error)) return new Error(AUTH_REQUIRED_MESSAGE, { cause: error });
  return error instanceof Error ? error : new Error(String(error));
};

export class MinimaxCodeAcpSession {
  private readonly client: AcpStdioClient;
  private readonly pipeline: AgentStreamPipeline;
  private acceptUpdates = false;
  private closedByHost = false;
  private interruptTimer?: ReturnType<typeof setTimeout>;
  private lastSessionUpdateAt = 0;
  private session?: string;

  constructor(private readonly options: MinimaxCodeAcpSessionOptions) {
    this.pipeline = new AgentStreamPipeline({
      agentType: 'minimax-code',
      operationId: options.operationId,
    });
    this.client = new AcpStdioClient({
      args: buildMinimaxCodeAcpArgs(options.args),
      commandPath: options.commandPath,
      cwd: options.cwd,
      env: options.env,
      onMessage: (message) => this.handleRpcMessage(message),
      onRawMessage: options.onRawMessage,
      onServerRequest: (message) => this.handleServerRequest(message),
      onStderr: options.onStderr,
      processLabel: 'MiniMax Code ACP',
      requestTimeoutMs: options.requestTimeoutMs,
    });
  }

  get nativeSessionId(): string | undefined {
    return this.session;
  }

  get pid(): number | undefined {
    return this.client.pid;
  }

  async run(): Promise<void> {
    this.status('starting');
    try {
      const prompt = await this.resolvePrompt();
      const initialized = await this.initialize();
      if (
        prompt.some((block) => block.type === 'image') &&
        initialized?.agentCapabilities?.promptCapabilities?.image !== true
      ) {
        throw new Error('MiniMax Code ACP agent does not support image prompt blocks');
      }

      const sessionId = await this.openSession(initialized);
      this.session = sessionId;
      this.options.onSessionId(sessionId);
      await this.emit({ sessionId, type: 'minimax_code_session' });
      this.status('running');
      // session/load may replay historical updates before returning. Keep setup
      // notifications gated until the new prompt is about to start.
      this.acceptUpdates = true;
      const response = await this.client.request<MinimaxCodeAcpPromptResult>(
        'session/prompt',
        { prompt, sessionId },
        false,
      );
      await this.drainNotifications();
      await this.client.drain();
      await this.emit({ stopReason: response?.stopReason, type: 'minimax_code_prompt_completed' });
      await this.emitEvents(await this.pipeline.flush());
      this.status('idle');
    } catch (cause) {
      if (this.closedByHost) return;
      const error = wrapAuthError(cause);
      await this.emit({ message: error.message, type: 'minimax_code_error' });
      await this.emitEvents(await this.pipeline.flush());
      throw error;
    } finally {
      if (this.interruptTimer) clearTimeout(this.interruptTimer);
      this.client.close();
      this.status('closed');
    }
  }

  async interrupt(): Promise<void> {
    if (!this.session) {
      this.close();
      return;
    }
    this.client.notify('session/cancel', { sessionId: this.session });
    this.interruptTimer = setTimeout(() => this.close(), 2000);
    this.interruptTimer.unref?.();
  }

  close(): void {
    this.closedByHost = true;
    this.client.close();
  }

  private async resolvePrompt(): Promise<MinimaxCodeAcpPromptBlock[]> {
    const prompt = this.options.prompt;
    if (
      Array.isArray(prompt) &&
      prompt.every(
        (block) =>
          'type' in block && (block.type === 'text' || ('data' in block && block.type === 'image')),
      )
    ) {
      return prompt as MinimaxCodeAcpPromptBlock[];
    }
    return buildMinimaxCodeAcpPrompt(prompt as AgentPromptInput, this.options.inputOptions);
  }

  private async initialize(): Promise<MinimaxCodeAcpInitializeResult> {
    await this.client.start();
    const initialized = await this.client.request<MinimaxCodeAcpInitializeResult>('initialize', {
      clientCapabilities: { auth: { terminal: true } },
      clientInfo: {
        name: 'lobehub',
        title: 'LobeHub',
        version: this.options.clientVersion,
      },
      protocolVersion: ACP_PROTOCOL_VERSION,
    });
    if (
      typeof initialized?.protocolVersion === 'number' &&
      initialized.protocolVersion !== ACP_PROTOCOL_VERSION
    ) {
      throw new Error(
        `MiniMax Code ACP returned unsupported protocol version: ${initialized.protocolVersion}`,
      );
    }
    return initialized;
  }

  private async openSession(initialized: MinimaxCodeAcpInitializeResult): Promise<string> {
    const resumeSessionId = this.options.resumeSessionId;
    if (!resumeSessionId) {
      const sessionResult = await this.client.request<MinimaxCodeAcpSessionResult>('session/new', {
        cwd: this.options.cwd,
        mcpServers: [],
      });
      if (!sessionResult?.sessionId) throw new Error('MiniMax Code ACP returned no session id');
      return sessionResult.sessionId;
    }

    const canResume = initialized?.agentCapabilities?.sessionCapabilities?.resume !== undefined;
    const canLoad = initialized?.agentCapabilities?.loadSession === true;
    if (!canResume && !canLoad) {
      throw new Error('MiniMax Code ACP agent does not support resuming sessions');
    }

    try {
      if (canResume) {
        const sessionResult = await this.client.request<MinimaxCodeAcpSessionResult>(
          'session/resume',
          {
            cwd: this.options.cwd,
            mcpServers: [],
            sessionId: resumeSessionId,
          },
        );
        return sessionResult?.sessionId ?? resumeSessionId;
      }

      const sessionResult = await this.client.request<MinimaxCodeAcpSessionResult>('session/load', {
        cwd: this.options.cwd,
        mcpServers: [],
        sessionId: resumeSessionId,
      });
      return sessionResult?.sessionId ?? resumeSessionId;
    } catch (error) {
      throw new Error(
        `MiniMax Code could not resume session ${resumeSessionId}. ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  }

  private async handleRpcMessage(message: AcpRpcMessage): Promise<void> {
    if (message.method !== 'session/update') return;
    if (!this.acceptUpdates) return;

    this.lastSessionUpdateAt = Date.now();
    const update = (message.params as { update?: unknown } | undefined)?.update;
    if (!update || typeof update !== 'object') return;
    await this.emit(update as Record<string, unknown>);
  }

  private handleServerRequest(message: AcpRpcMessage): unknown {
    if (message.method === 'session/request_permission') {
      const params = message.params as { options?: unknown } | undefined;
      const options = Array.isArray(params?.options)
        ? params.options.map((value) => value as MinimaxCodeAcpPermissionOption | null)
        : [];
      const selected =
        options.find(
          (option) =>
            option?.kind === 'allow_always' ||
            option?.optionId === 'allow_always' ||
            option?.optionId === 'allow_session' ||
            option?.optionId === 'approve_for_session',
        ) ??
        options.find(
          (option) => option?.kind === 'allow_once' || option?.optionId === 'allow_once',
        );
      if (typeof selected?.optionId === 'string') {
        return { outcome: { optionId: selected.optionId, outcome: 'selected' } };
      }
      throw new AcpServerRequestError(-32_603, 'No safe permission option was offered');
    }
    throw new AcpServerRequestError(-32_601, `Unsupported ACP client request: ${message.method}`);
  }

  private async emit(payload: Record<string, unknown>): Promise<void> {
    await this.emitEvents(await this.pipeline.push(`${JSON.stringify(payload)}\n`));
  }

  private async emitEvents(events: AgentStreamEvent[]): Promise<void> {
    if (events.length) await this.options.onEvents(events);
  }

  private async drainNotifications(): Promise<void> {
    const deadline = Date.now() + NOTIFICATION_DRAIN_TIMEOUT_MS;
    let quietSince = Date.now();

    while (Date.now() < deadline) {
      await sleep(Math.min(NOTIFICATION_DRAIN_QUIET_MS, deadline - Date.now()));
      await this.client.drain();
      if (this.lastSessionUpdateAt > quietSince) {
        quietSince = this.lastSessionUpdateAt;
        continue;
      }
      if (Date.now() - quietSince >= NOTIFICATION_DRAIN_QUIET_MS) return;
    }
  }

  private status(state: HeterogeneousAgentRuntimeStatus['state']): void {
    this.options.onRuntimeStatus({
      activeTasks: [],
      lastEventAt: Date.now(),
      operationId: this.options.operationId,
      sessionId: this.options.sessionId,
      state,
      transport: TRANSPORT,
    });
  }
}
