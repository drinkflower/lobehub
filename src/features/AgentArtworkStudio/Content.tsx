'use client';

import type { AgentArtworkStyle } from '@lobechat/prompts';
import { toast } from '@lobehub/ui/base-ui';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { resolveAgentBackground } from '@/features/AgentProfileArtwork/utils';
import { ArtworkStudioContent, styleReferencesForArtworkStyle } from '@/features/ArtworkStudio';
import { DEFAULT_CHIEF_AGENT_ARTWORK } from '@/features/ChiefAgent/artwork';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { useAgentStore } from '@/store/agent';
import { agentArtworkSelectors, agentSelectors } from '@/store/agent/selectors';
import { useFileStore } from '@/store/file';

const MAX_AVATAR_SIZE = 1024 * 1024;

interface AgentArtworkStudioContentProps {
  agentId: string;
}

const AgentArtworkStudioContent = memo<AgentArtworkStudioContentProps>(({ agentId }) => {
  const { t } = useTranslation('setting');
  const appOrigin = useAppOrigin();
  const meta = useAgentStore(agentSelectors.getAgentMetaById(agentId));
  const systemRole = useAgentStore(
    (s) => agentSelectors.getAgentConfigById(agentId)(s)?.systemRole,
  );
  const generation = useAgentStore(agentArtworkSelectors.generationByAgentId(agentId));
  const generateAgentArtwork = useAgentStore((s) => s.generateAgentArtwork);
  const cancelAgentArtworkGeneration = useAgentStore((s) => s.cancelAgentArtworkGeneration);
  const updateAgentMetaById = useAgentStore((s) => s.updateAgentMetaById);
  const uploadWithProgress = useFileStore((s) => s.uploadWithProgress);

  const [uploading, setUploading] = useState(false);
  const [fullBody, setFullBody] = useState<string>();

  const generating = generation?.status === 'generating' && generation.kind === 'avatar';
  const generationFailed = generation?.status === 'error' && generation.kind === 'avatar';

  const generate = useCallback(
    async (nextStyle: AgentArtworkStyle) => {
      const commonInput = {
        description: meta.description,
        id: agentId,
        kind: 'avatar',
        name: meta.name,
        referenceImageUrl: resolveAgentBackground(meta.backgroundColor),
        style: nextStyle,
        styleReferenceImageUrls: styleReferencesForArtworkStyle(nextStyle, appOrigin),
        systemRole,
        title: meta.title,
      } as const;

      try {
        const fullBodyUrl = await generateAgentArtwork({
          ...commonInput,
          composition: 'fullBody',
          persist: false,
        });
        if (fullBodyUrl) setFullBody(fullBodyUrl);
        await generateAgentArtwork({ ...commonInput, composition: 'avatar' });
      } catch {
        // The Agent store owns the persistent error state rendered below.
      }
    },
    [
      agentId,
      appOrigin,
      generateAgentArtwork,
      meta.backgroundColor,
      meta.description,
      meta.name,
      meta.title,
      systemRole,
    ],
  );

  const upload = useCallback(
    async (file: File) => {
      if (file.size > MAX_AVATAR_SIZE) {
        toast.error(t('settingAgent.artwork.sizeExceeded'));
        return;
      }

      setUploading(true);
      try {
        const result = await uploadWithProgress({ file });
        if (!result?.url) throw new Error('Upload returned no URL');
        await updateAgentMetaById(agentId, { avatar: result.url });
      } catch (error) {
        console.error('Failed to upload agent avatar:', error);
        toast.error(t('settingAgent.artwork.uploadFailed'));
      } finally {
        setUploading(false);
      }
    },
    [agentId, t, updateAgentMetaById, uploadWithProgress],
  );

  return (
    <ArtworkStudioContent
      avatar={meta.avatar}
      diyHint={t('settingAgent.artwork.studio.diyHint')}
      fullBody={fullBody || DEFAULT_CHIEF_AGENT_ARTWORK.hero}
      generateHint={t('settingAgent.artwork.studio.generateHint')}
      generating={generating}
      generatingTitle={t('settingAgent.artwork.avatar.generating')}
      generationFailed={generationFailed}
      uploading={uploading}
      onCancel={() => void cancelAgentArtworkGeneration(agentId)}
      onGenerate={generate}
      onUpload={(file) => void upload(file)}
    />
  );
});

AgentArtworkStudioContent.displayName = 'AgentArtworkStudioContent';

export default AgentArtworkStudioContent;
