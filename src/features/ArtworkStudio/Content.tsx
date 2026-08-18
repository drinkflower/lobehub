'use client';

import { imageUrl } from '@lobechat/const';
import type { AgentArtworkComposition, AgentArtworkStyle } from '@lobechat/prompts';
import { AGENT_ARTWORK_STYLES } from '@lobechat/prompts';
import { Alert, Avatar, Center, Flexbox, Icon, Text } from '@lobehub/ui';
import { Button, useModalContext } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  Check,
  CircleUserRound,
  PersonStanding,
  SettingsIcon,
  UploadIcon,
  WandSparkles,
} from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { avatarRemountKey, openFilePicker } from '@/features/AgentProfileArtwork/utils';
import { CHIEF_AGENT_ARTWORKS, DEFAULT_CHIEF_AGENT_ARTWORK } from '@/features/ChiefAgent/artwork';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useAiInfraStore } from '@/store/aiInfra';
import { aiProviderSelectors } from '@/store/aiInfra/selectors';

const GALLERY_STYLES = AGENT_ARTWORK_STYLES;
const LOBE_STYLE_PREVIEW =
  CHIEF_AGENT_ARTWORKS.find((item) => item.id === 'sienna')?.avatar ??
  DEFAULT_CHIEF_AGENT_ARTWORK.avatar;

/** Both slots share this height so the two cards read as one row. */
const PREVIEW_HEIGHT = 200;
/** Keeps the avatar's inset inside its slot proportional to the slot itself. */
const AVATAR_SIZE = PREVIEW_HEIGHT - 32;

const styles = createStaticStyles(({ css }) => ({
  galleryCheck: css`
    position: absolute;
    z-index: 1;
    inset-block-start: 6px;
    inset-inline-end: 6px;

    width: 20px;
    height: 20px;
    border-radius: 50%;

    color: ${cssVar.colorTextLightSolid};

    background: ${cssVar.colorPrimary};
  `,
  galleryGrid: css`
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    align-items: start;
  `,
  galleryItem: css`
    cursor: pointer;

    width: 100%;
    padding: 4px;
    border: 1px solid transparent;
    border-radius: ${cssVar.borderRadiusLG};

    transition:
      border-color ${cssVar.motionDurationFast},
      background ${cssVar.motionDurationFast};

    &:hover img {
      filter: brightness(1.06);
    }
  `,
  galleryItemActive: css`
    border-color: ${cssVar.colorPrimary};
    background: ${cssVar.colorFillTertiary};
  `,
  galleryLabel: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;

    height: 36px;

    font-size: 12px;
    line-height: 18px;
    color: ${cssVar.colorTextSecondary};
    text-align: center;
  `,
  galleryThumb: css`
    aspect-ratio: 1;
    width: 100%;
    border-radius: ${cssVar.borderRadiusLG};

    object-fit: cover;

    transition: filter ${cssVar.motionDurationFast};
  `,
  galleryThumbWrap: css`
    position: relative;
  `,
  generationOverlay: css`
    position: absolute;
    z-index: 2;
    inset: 0;

    padding: 12px;
    border-radius: calc(${cssVar.borderRadiusLG} - 1px);

    background: color-mix(in srgb, ${cssVar.colorBgContainer} 88%, transparent);
    backdrop-filter: blur(12px);
  `,
  generationOverlayTitle: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;

    font-size: 13px;
    font-weight: 500;
    line-height: 18px;
    text-align: center;
  `,
  hint: css`
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  noModelBlock: css`
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorFillQuaternary};
  `,
  outputCard: css`
    cursor: pointer;
    padding-block: 0;
    padding-inline: 8px;
  `,
  outputActions: css`
    width: 100%;
    max-width: ${PREVIEW_HEIGHT}px;
  `,
  outputGrid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
  `,
  outputPreview: css`
    position: relative;

    overflow: hidden;

    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
  `,
  outputPreviewAvatar: css`
    aspect-ratio: 1;
    height: ${PREVIEW_HEIGHT}px;
  `,
  outputPreviewFullBody: css`
    aspect-ratio: 3 / 4;
    height: ${PREVIEW_HEIGHT}px;
  `,
  previewBodyImage: css`
    width: 100%;
    height: 100%;
    object-fit: contain;
  `,
  sectionTitle: css`
    font-weight: 500;
  `,
  uploadSpec: css`
    font-size: 12px;
    line-height: 16px;
    color: ${cssVar.colorTextQuaternary};
    text-align: center;
  `,
  visuallyHiddenInput: css`
    pointer-events: none;

    position: fixed;

    overflow: hidden;

    width: 1px;
    height: 1px;

    opacity: 0;
  `,
}));

export interface ArtworkStudioContentProps {
  /** Current avatar url; falsy renders the empty avatar placeholder. */
  avatar?: string | null;
  /** Current or freshly generated full-body artwork. */
  fullBody?: string | null;
  generating?: boolean;
  generatingTarget?: AgentArtworkComposition | 'both';
  /** Headline shown over the preview while a generation runs. */
  generatingTitle: string;
  /** True when the last generation attempt failed and can be retried. */
  generationFailed?: boolean;
  onCancel: () => void;
  onGenerate: (style: AgentArtworkStyle, composition?: AgentArtworkComposition) => void;
  onUpload: (file: File, composition: AgentArtworkComposition) => void;
  uploading?: boolean;
}

/**
 * Artwork workshop shared by every subject that can own one (Agents, workspaces).
 * The same underlying image is shown in its two product crops so users can
 * choose the intended generation composition without hiding either result.
 */
const ArtworkStudioContent = memo<ArtworkStudioContentProps>(
  ({
    avatar,
    fullBody,
    generatingTitle,
    generating,
    generatingTarget,
    generationFailed,
    onCancel,
    onGenerate,
    onUpload,
    uploading,
  }) => {
    const { t } = useTranslation('setting');
    const { close } = useModalContext();
    const navigate = useWorkspaceAwareNavigate();
    const canGenerate = useAiInfraStore(
      (state) => aiProviderSelectors.enabledImageModelList(state).length > 0,
    );

    const avatarInputRef = useRef<HTMLInputElement>(null);
    const fullBodyInputRef = useRef<HTMLInputElement>(null);
    const [style, setStyle] = useState<AgentArtworkStyle>('anime');
    const selectStyle = useCallback((next: AgentArtworkStyle) => setStyle(next), []);

    const keySelect = useCallback(
      (next: AgentArtworkStyle) => (event: { key: string; preventDefault: () => void }) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setStyle(next);
        }
      },
      [],
    );

    const isGenerating = (composition: AgentArtworkComposition) =>
      !!generating && (generatingTarget === composition || generatingTarget === 'both');

    // The slot is only ~200px wide, so the overlay carries the headline and the
    // cancel affordance; the duration hint sits under the row where it has space.
    const renderGenerationOverlay = (composition: AgentArtworkComposition) =>
      isGenerating(composition) ? (
        <Center className={styles.generationOverlay} gap={8}>
          <NeuralNetworkLoading size={28} />
          <Text className={styles.generationOverlayTitle}>{generatingTitle}</Text>
          <Button size={'small'} type={'fill'} onClick={onCancel}>
            {t('artworkStudio.cancel')}
          </Button>
        </Center>
      ) : null;

    return (
      <Flexbox gap={20} padding={24}>
        <div className={styles.outputGrid}>
          <Flexbox
            align={'center'}
            className={styles.outputCard}
            gap={10}
            role={'button'}
            tabIndex={0}
            onClick={() => avatarInputRef.current && openFilePicker(avatarInputRef.current)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (avatarInputRef.current) openFilePicker(avatarInputRef.current);
              }
            }}
          >
            <Flexbox horizontal align={'center'} gap={6}>
              <Icon icon={CircleUserRound} size={16} />
              <Text className={styles.sectionTitle}>{t('artworkStudio.composition.avatar')}</Text>
            </Flexbox>
            <Center className={`${styles.outputPreview} ${styles.outputPreviewAvatar}`}>
              <Avatar
                avatar={avatar || undefined}
                key={avatarRemountKey(avatar)}
                shape={'square'}
                size={AVATAR_SIZE}
              />
              {renderGenerationOverlay('avatar')}
            </Center>
            <Flexbox horizontal className={styles.outputActions} gap={8}>
              <Button icon={UploadIcon} loading={uploading} size={'small'} style={{ flex: 1 }}>
                {t('artworkStudio.upload')}
              </Button>
              <Button
                icon={WandSparkles}
                size={'small'}
                style={{ flex: 1 }}
                onClick={(event) => {
                  event.stopPropagation();
                  onGenerate(style, 'avatar');
                }}
              >
                {t('artworkStudio.generate.avatar')}
              </Button>
            </Flexbox>
            <Text className={styles.uploadSpec}>{t('artworkStudio.uploadSpec.avatar')}</Text>
          </Flexbox>
          <Flexbox
            align={'center'}
            className={styles.outputCard}
            gap={10}
            role={'button'}
            tabIndex={0}
            onClick={() => fullBodyInputRef.current && openFilePicker(fullBodyInputRef.current)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (fullBodyInputRef.current) openFilePicker(fullBodyInputRef.current);
              }
            }}
          >
            <Flexbox horizontal align={'center'} gap={6}>
              <Icon icon={PersonStanding} size={16} />
              <Text className={styles.sectionTitle}>{t('artworkStudio.composition.fullBody')}</Text>
            </Flexbox>
            <Center className={`${styles.outputPreview} ${styles.outputPreviewFullBody}`}>
              {fullBody ? (
                <img
                  alt={t('artworkStudio.preview.fullBody')}
                  className={styles.previewBodyImage}
                  src={fullBody}
                />
              ) : (
                <Icon icon={PersonStanding} size={64} />
              )}
              {renderGenerationOverlay('fullBody')}
            </Center>
            <Flexbox horizontal className={styles.outputActions} gap={8}>
              <Button icon={UploadIcon} loading={uploading} size={'small'} style={{ flex: 1 }}>
                {t('artworkStudio.upload')}
              </Button>
              <Button
                icon={WandSparkles}
                size={'small'}
                style={{ flex: 1 }}
                onClick={(event) => {
                  event.stopPropagation();
                  onGenerate(style, 'fullBody');
                }}
              >
                {t('artworkStudio.generate.fullBody')}
              </Button>
            </Flexbox>
            <Text className={styles.uploadSpec}>{t('artworkStudio.uploadSpec.fullBody')}</Text>
          </Flexbox>
        </div>

        {generating ? (
          <Text className={styles.hint} style={{ textAlign: 'center' }}>
            {t('artworkStudio.generatingHint')}
          </Text>
        ) : null}

        {canGenerate ? (
          <>
            <Flexbox gap={8}>
              <Text className={styles.sectionTitle}>{t('artworkStudio.style.title')}</Text>
              <div className={styles.galleryGrid}>
                {GALLERY_STYLES.map((item) => (
                  <Flexbox
                    className={`${styles.galleryItem} ${style === item ? styles.galleryItemActive : ''}`}
                    gap={6}
                    key={item}
                    role={'button'}
                    tabIndex={0}
                    onClick={() => selectStyle(item)}
                    onKeyDown={keySelect(item)}
                  >
                    <div className={styles.galleryThumbWrap}>
                      <img
                        alt={t(`artworkStudio.style.${item}`)}
                        className={styles.galleryThumb}
                        src={
                          item === 'lobe'
                            ? LOBE_STYLE_PREVIEW
                            : imageUrl(`agent-artwork-styles/style-${item}.webp`)
                        }
                      />
                      {style === item ? (
                        <Center className={styles.galleryCheck}>
                          <Icon icon={Check} size={13} />
                        </Center>
                      ) : null}
                    </div>
                    <Text ellipsis className={styles.galleryLabel}>
                      {t(`artworkStudio.style.${item}`)}
                    </Text>
                  </Flexbox>
                ))}
              </div>
            </Flexbox>

            <Flexbox gap={8}>
              <Button
                disabled={generating}
                icon={WandSparkles}
                type={'fill'}
                onClick={() => onGenerate(style)}
              >
                {t('artworkStudio.generate.characterSet')}
              </Button>
              {generationFailed ? (
                <Alert showIcon title={t('artworkStudio.generateFailed')} type={'error'} />
              ) : null}
            </Flexbox>
          </>
        ) : (
          <Center className={styles.noModelBlock} flex={1} gap={12} padding={24}>
            <Text className={styles.hint} style={{ textAlign: 'center' }}>
              {t('artworkStudio.noModel')}
            </Text>
            <Button
              icon={SettingsIcon}
              type={'fill'}
              onClick={() => {
                close();
                navigate('/settings/provider/all');
              }}
            >
              {t('artworkStudio.enableModel')}
            </Button>
          </Center>
        )}

        <input
          accept="image/*"
          aria-label={t('artworkStudio.upload')}
          className={styles.visuallyHiddenInput}
          ref={avatarInputRef}
          tabIndex={-1}
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onUpload(file, 'avatar');
          }}
        />
        <input
          accept="image/*"
          aria-label={t('artworkStudio.upload')}
          className={styles.visuallyHiddenInput}
          ref={fullBodyInputRef}
          tabIndex={-1}
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onUpload(file, 'fullBody');
          }}
        />
      </Flexbox>
    );
  },
);

ArtworkStudioContent.displayName = 'ArtworkStudioContent';

export default ArtworkStudioContent;
