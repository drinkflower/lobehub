import { Bot } from 'lucide-react';

// Imported from the hook file directly: this module is loaded eagerly by the
// router configs, so it must not pull the page chunk in via the feature barrel.
import { useSharedAgent } from '@/features/AgentShareVisitor/useSharedAgent';
import { usePublishDynamicRouteMeta } from '@/features/RouteMeta/usePublishDynamicRouteMeta';
import type { DynamicRouteMetaProps } from '@/spa/router/routeMeta';
import { routeMeta } from '@/spa/router/routeMeta';

const ShareAgentDynamicMeta = ({ onResolve, params }: DynamicRouteMetaProps) => {
  const { data } = useSharedAgent(params.id);

  usePublishDynamicRouteMeta(
    {
      title: data?.agentMeta.title || undefined,
    },
    onResolve,
  );

  return null;
};

export const shareAgentRouteMeta = routeMeta({
  DynamicMeta: ShareAgentDynamicMeta,
  icon: Bot,
  titleKey: 'navigation.chat',
});
