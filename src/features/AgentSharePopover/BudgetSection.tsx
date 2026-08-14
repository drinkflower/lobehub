'use client';

import { CREDITS_PER_DOLLAR } from '@lobechat/const/currency';
import { Flexbox, Skeleton, Text } from '@lobehub/ui';
import { Button, confirmModal, toast } from '@lobehub/ui/base-ui';
import { InputNumber } from 'antd';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { shareKeys } from '@/libs/swr/keys';
import { agentShareBudgetService } from '@/services/agentShareBudget';
import { formatIntergerNumber } from '@/utils/format';

import { Section, SettingRow } from './SectionLayout';

/** Budgets are stored in USD; the whole user-facing surface speaks credits. */
const toCredits = (usd: number) => Math.round(usd * CREDITS_PER_DOLLAR);

/**
 * Machine-readable PRECONDITION_FAILED messages from the cloud
 * AgentShareBudgetService, mapped to human-readable copy.
 */
const TRANSFER_ERROR_KEYS = {
  INSUFFICIENT_SUBSCRIPTION_BALANCE: 'share.budget.error.insufficient',
  NO_ACTIVE_SUBSCRIPTION: 'share.budget.error.noSubscription',
} as const;

interface BudgetSectionProps {
  agentId: string;
}

/**
 * Creator-side share budget: balance/consumption readout plus a one-way
 * transfer from the subscription budget (v1 has no transfer back). Renders
 * nothing when the business slot returns null (OSS deployments).
 */
const BudgetSection = memo<BudgetSectionProps>(({ agentId }) => {
  const { t } = useTranslation('agent');

  const {
    data: overview,
    isLoading,
    mutate,
  } = useSWR(
    shareKeys.agentShareBudget(agentId),
    () => agentShareBudgetService.getShareBudget(agentId),
    { revalidateOnFocus: false },
  );

  const [amount, setAmount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const doTransfer = useCallback(
    async (credits: number) => {
      setSubmitting(true);
      try {
        await agentShareBudgetService.transferToShareBudget(agentId, credits / CREDITS_PER_DOLLAR);
        // Revalidate instead of patching: the same response also carries the
        // decreased subscriptionAvailable.
        await mutate();
        setAmount(null);
        toast.success(t('share.budget.transferSuccess'));
      } catch (error) {
        const key =
          TRANSFER_ERROR_KEYS[(error as Error)?.message as keyof typeof TRANSFER_ERROR_KEYS];
        toast.error(t(key ?? 'share.budget.transferError'));
      } finally {
        setSubmitting(false);
      }
    },
    [agentId, mutate, t],
  );

  const handleTransferClick = useCallback(() => {
    if (!amount) return;
    const credits = Math.floor(amount);

    confirmModal({
      cancelText: t('cancel', { ns: 'common' }),
      content: (
        <Flexbox gap={12}>
          <Text>
            {t('share.budget.confirm.content', { amount: formatIntergerNumber(credits) })}
          </Text>
          <Flexbox as="ul" gap={8} style={{ margin: 0, paddingInlineStart: 20 }}>
            <li>{t('share.budget.confirm.rules.source')}</li>
            <li>{t('share.budget.confirm.rules.permanent')}</li>
            <li>{t('share.budget.confirm.rules.irreversible')}</li>
          </Flexbox>
        </Flexbox>
      ),
      okText: t('share.budget.confirm.ok'),
      onOk: () => {
        void doTransfer(credits);
      },
      title: t('share.budget.confirm.title'),
    });
  }, [amount, doTransfer, t]);

  if (isLoading) {
    return <Skeleton active paragraph={{ rows: 3 }} title={false} />;
  }

  // Business slot unavailable (OSS deployment) — hide the whole section.
  if (!overview) return null;

  const { hasActiveSubscription, shareBudget, subscriptionAvailable } = overview;
  const maxTransferableCredits = Math.floor(subscriptionAvailable * CREDITS_PER_DOLLAR);
  const canTransfer = hasActiveSubscription && maxTransferableCredits >= 1;

  return (
    <Section desc={t('share.budget.desc')} title={t('share.budget.title')}>
      <Flexbox gap={12}>
        <SettingRow label={t('share.budget.balance')}>
          <Text strong>{formatIntergerNumber(toCredits(shareBudget?.remaining ?? 0))}</Text>
        </SettingRow>
        <SettingRow label={t('share.budget.consumed')}>
          <Text type="secondary">{formatIntergerNumber(toCredits(shareBudget?.spend ?? 0))}</Text>
        </SettingRow>
        <Flexbox horizontal align="center" gap={8}>
          <InputNumber
            disabled={!canTransfer || submitting}
            max={Math.max(1, maxTransferableCredits)}
            min={1}
            placeholder={t('share.budget.amountPlaceholder')}
            precision={0}
            style={{ flex: 1 }}
            value={amount}
            onChange={(value) => setAmount(typeof value === 'number' ? value : null)}
          />
          <Button
            disabled={!canTransfer || !amount || amount > maxTransferableCredits}
            loading={submitting}
            onClick={handleTransferClick}
          >
            {t('share.budget.transfer')}
          </Button>
        </Flexbox>
        <Text fontSize={12} type="secondary">
          {hasActiveSubscription
            ? t('share.budget.availableToTransfer', {
                amount: formatIntergerNumber(maxTransferableCredits),
              })
            : t('share.budget.noSubscription')}
        </Text>
      </Flexbox>
    </Section>
  );
});

BudgetSection.displayName = 'AgentShareBudgetSection';

export default BudgetSection;
