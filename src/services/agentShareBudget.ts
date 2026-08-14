import { lambdaClient } from '@/libs/trpc/client';

/**
 * Creator-side share budget funding (business slot). On OSS deployments the
 * slot router returns null / rejects, so callers must treat a null overview
 * as "feature unavailable".
 */
class AgentShareBudgetService {
  async getShareBudget(agentId: string) {
    return lambdaClient.agentShareBudget.getShareBudget.query({ agentId });
  }

  async transferToShareBudget(agentId: string, amount: number) {
    return lambdaClient.agentShareBudget.transferToShareBudget.mutate({ agentId, amount });
  }
}

export const agentShareBudgetService = new AgentShareBudgetService();
