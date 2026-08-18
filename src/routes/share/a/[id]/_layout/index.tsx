'use client';

import { type PropsWithChildren } from 'react';
import { memo, Suspense } from 'react';
import { Outlet, useParams } from 'react-router';

import ShareShell from '@/business/client/features/ShareShell';
import Loading from '@/components/Loading/BrandTextLoading';
import { useSharedAgent } from '@/features/AgentShareVisitor/useSharedAgent';
import { RouteMetaBridge } from '@/features/RouteMeta';

const ShareAgentLayout = memo<PropsWithChildren>(({ children }) => {
  const { id } = useParams<{ id: string }>();

  const { error, isLoading } = useSharedAgent(id);

  return (
    <>
      <RouteMetaBridge />
      <ShareShell error={error} loading={!error && isLoading}>
        <Suspense fallback={<Loading debugId="share agent layout" />}>
          {children ?? <Outlet />}
        </Suspense>
      </ShareShell>
    </>
  );
});

export default ShareAgentLayout;
