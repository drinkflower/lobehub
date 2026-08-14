import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { authedProcedure, router } from '@/libs/trpc/lambda';

export interface AgentShareBudgetInfo {
  budgetId: string;
  maxBudget: number;
  /** Available balance: max(0, maxBudget - spend - reserved). */
  remaining: number;
  reserved: number;
  spend: number;
}

/**
 * One-round-trip payload for the share budget transfer UI: the agent's share
 * budget plus the creator-side transfer capacity. All monetary fields are USD.
 */
export interface AgentShareBudgetOverview {
  hasActiveSubscription: boolean;
  /** Null before the creator's first transfer creates the budget. */
  shareBudget: AgentShareBudgetInfo | null;
  subscriptionAvailable: number;
}

/**
 * Business slot: creator-side funding of an agent's share budget. The
 * commercial implementation overrides this router; OSS deployments get safe
 * defaults — no budget data and an explicit failure on transfer attempts.
 */
export const agentShareBudgetRouter = router({
  getShareBudget: authedProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async () => null as AgentShareBudgetOverview | null),

  transferToShareBudget: authedProcedure
    .input(
      z.object({
        agentId: z.string(),
        /** Transfer amount in USD, deducted from the subscription budget. */
        amount: z.number().positive().finite(),
      }),
    )
    .mutation(async (): Promise<{ shareBudget: AgentShareBudgetInfo }> => {
      throw new TRPCError({
        code: 'NOT_IMPLEMENTED',
        message: 'Agent share budget is not available',
      });
    }),
});
