import type { ModelRuntimeHooks } from '@lobechat/model-runtime';

/**
 * Extra request context forwarded to the business hooks factory. All fields are
 * optional; the OSS implementation ignores them entirely.
 */
export interface BusinessModelRuntimeContext {
  /**
   * When set, the request runs on behalf of a shared agent: business
   * implementations may bill the consumption to the agent's share budget
   * instead of the executing user.
   */
  agentShare?: {
    agentId: string;
  };
  /** OAuth client id when the request was authenticated via an OIDC access token. */
  oidcClientId?: string;
}

export function getBusinessModelRuntimeHooks(
  _userId: string,
  _provider: string,
  _workspaceId?: string,
  _context?: BusinessModelRuntimeContext,
): ModelRuntimeHooks | undefined {
  return undefined;
}
