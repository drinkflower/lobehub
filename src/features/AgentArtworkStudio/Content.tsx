'use client';

import type { AgentArtworkComposition, AgentArtworkStyle } from '@lobechat/prompts';
import { toast } from '@lobehub/ui/base-ui';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { resolveAgentBackground } from '@/features/AgentProfileArtwork/utils';
import { ArtworkStudioContent, styleReferencesForArtworkStyle } from '@/features/ArtworkStudio';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { cutOutFullBodyArtwork } from '@/services/artworkGeneration';
import { useAgentStore } from '@/store/agent';
import { agentArtworkSelectors, agentSelectors } from '@/store/agent/selectors';
import { useFileStore } from '@/store/file';

import { generateCharacterSet } from './generateCharacterSet';

const MAX_AVATAR_SIZE = 1024 * 1024;

interface AgentArtworkStudioContentProps {
  agentId: string;
}

/**
 * Image models return an opaque JPEG, so the generated full-body artwork is cut
 * out and re-uploaded as a transparent PNG before it is stored — the home
 * surface composites it over its own background. A failed cut-out keeps the
 * original artwork rather than blocking the result.
 */
const useTransparentFullBody = () => {
  const uploadWithProgress = useFileStore((s) => s.uploadWithProgress);

  return useCallback(
    async (url: string) => {
      const file = await cutOutFullBodyArtwork(url);
      if (!file) return url;

      try {
        const result = await uploadWithProgress({ file });

        return result?.url || url;
      } catch (error) {
        console.error('Failed to upload the transparent full-body artwork:', error);

        return url;
      }
    },
    [uploadWithProgress],
  );
};

const AgentArtworkStudioContent = memo<AgentArtworkStudioContentProps>(({ agentId }) => {
  const { t } = useTranslation('setting');
  const appOrigin = useAppOrigin();
  const meta = useAgentStore(agentSelectors.getAgentMetaById(agentId));
  const fullBody = useAgentStore(agentSelectors.getAgentFullBodyArtworkById(agentId));
  const metadata = useAgentStore(agentSelectors.getAgentMetadataById(agentId));
  const systemRole = useAgentStore(
    (s) => agentSelectors.getAgentConfigById(agentId)(s)?.systemRole,
  );
  const generation = useAgentStore(agentArtworkSelectors.generationByAgentId(agentId));
  const generateAgentArtwork = useAgentStore((s) => s.generateAgentArtwork);
  const cancelAgentArtworkGeneration = useAgentStore((s) => s.cancelAgentArtworkGeneration);
  const updateAgentMetaById = useAgentStore((s) => s.updateAgentMetaById);
  const uploadWithProgress = useFileStore((s) => s.uploadWithProgress);
  const toTransparentFullBody = useTransparentFullBody();

  const [uploading, setUploading] = useState(false);
  const [generatingTarget, setGeneratingTarget] = useState<AgentArtworkComposition | 'both'>();

  const generating = generation?.status === 'generating' && generation.kind === 'avatar';
  const generationFailed = generation?.status === 'error' && generation.kind === 'avatar';

  const saveFullBodyArtwork = useCallback(
    (url: string) =>
      updateAgentMetaById(agentId, { metadata: { ...metadata, fullBodyArtwork: url } }),
    [agentId, metadata, updateAgentMetaById],
  );

  const generate = useCallback(
    async (
      nextStyle: AgentArtworkStyle,
      composition?: AgentArtworkComposition,
      direction?: string,
    ) => {
      const commonInput = {
        description: meta.description,
        id: agentId,
        kind: 'avatar',
        name: meta.name,
        direction,
        referenceImageUrl: resolveAgentBackground(meta.backgroundColor),
        style: nextStyle,
        styleReferenceImageUrls: styleReferencesForArtworkStyle(nextStyle, appOrigin),
        systemRole,
        title: meta.title,
      } as const;

      setGeneratingTarget(composition ?? 'both');
      try {
        const result = await generateCharacterSet({
          composition,
          currentAvatarUrl: meta.avatar,
          generate: generateAgentArtwork,
          input: commonInput,
        });
        if (result.fullBodyUrl) {
          await saveFullBodyArtwork(await toTransparentFullBody(result.fullBodyUrl));
        }
      } catch {
        // The Agent store owns the persistent error state rendered below.
      } finally {
        setGeneratingTarget(undefined);
      }
    },
    [
      agentId,
      appOrigin,
      generateAgentArtwork,
      meta.backgroundColor,
      meta.description,
      meta.avatar,
      meta.name,
      meta.title,
      saveFullBodyArtwork,
      systemRole,
      toTransparentFullBody,
    ],
  );

  const upload = useCallback(
    async (file: File, composition: AgentArtworkComposition) => {
      if (file.size > MAX_AVATAR_SIZE) {
        toast.error(t('settingAgent.artwork.sizeExceeded'));
        return;
      }

      setUploading(true);
      try {
        const result = await uploadWithProgress({ file });
        if (!result?.url) throw new Error('Upload returned no URL');
        await cancelAgentArtworkGeneration(agentId);
        if (composition === 'avatar') await updateAgentMetaById(agentId, { avatar: result.url });
        else await saveFullBodyArtwork(result.url);
      } catch (error) {
        console.error('Failed to upload agent avatar:', error);
        toast.error(t('settingAgent.artwork.uploadFailed'));
      } finally {
        setUploading(false);
      }
    },
    [
      agentId,
      cancelAgentArtworkGeneration,
      saveFullBodyArtwork,
      t,
      updateAgentMetaById,
      uploadWithProgress,
    ],
  );

  return (
    <ArtworkStudioContent
      avatar={meta.avatar}
      fullBody={fullBody}
      generating={generating}
      generatingTarget={generatingTarget}
      generatingTitle={t('settingAgent.artwork.avatar.generating')}
      generationFailed={generationFailed}
      uploading={uploading}
      onCancel={() => void cancelAgentArtworkGeneration(agentId)}
      onGenerate={generate}
      onUpload={(file, composition) => void upload(file, composition)}
    />
  );
});

AgentArtworkStudioContent.displayName = 'AgentArtworkStudioContent';

export default AgentArtworkStudioContent;
