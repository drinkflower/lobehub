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

    border-radius: calc(${cssVar.borderRadiusLG} - 1px);

    background: color-mix(in srgb, ${cssVar.colorBgContainer} 88%, transparent);
    backdrop-filter: blur(12px);
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
    width: 176px;
  `,
  outputPreviewFullBody: css`
    aspect-ratio: 3 / 4;
    height: 176px;
  `,
  previewBodyImage: css`
    width: 100%;
    height: 100%;
    object-fit: contain;
  `,
  sectionTitle: css`
    font-weight: 500;
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
  /** Copy under the "make your own" heading — names the subject being dressed. */
  diyHint: string;
  /** Current or freshly generated full-body artwork. */
  fullBody?: string | null;
  /** Copy under the "generate with AI" heading. */
  generateHint: string;
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
    diyHint,
    generateHint,
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

    const renderGenerationOverlay = (composition: AgentArtworkComposition) =>
      generating && (generatingTarget === composition || generatingTarget === 'both') ? (
        <Center className={styles.generationOverlay}>
          <Flexbox align={'center'} gap={10}>
            <NeuralNetworkLoading size={32} />
            <Flexbox align={'center'} gap={4}>
              <Text className={styles.sectionTitle}>{generatingTitle}</Text>
              <Text className={styles.hint} style={{ textAlign: 'center' }}>
                {t('artworkStudio.generatingHint')}
              </Text>
              <Button
                size={'small'}
                style={{ marginBlockStart: 4 }}
                type={'fill'}
                onClick={onCancel}
              >
                {t('artworkStudio.cancel')}
              </Button>
            </Flexbox>
          </Flexbox>
        </Center>
      ) : null;

    return (
      <Flexbox gap={20} padding={24}>
        <Flexbox horizontal align={'flex-start'} justify={'space-between'}>
          <Flexbox gap={4}>
            <Text className={styles.sectionTitle}>{t('artworkStudio.generateTitle')}</Text>
            <Text className={styles.hint}>{generateHint}</Text>
          </Flexbox>
        </Flexbox>

        <Flexbox gap={8}>
          <Flexbox gap={2}>
            <Text className={styles.sectionTitle}>{t('artworkStudio.composition.title')}</Text>
            <Text className={styles.hint}>{t('artworkStudio.composition.hint')}</Text>
          </Flexbox>
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
                  size={148}
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
                <Text className={styles.sectionTitle}>
                  {t('artworkStudio.composition.fullBody')}
                </Text>
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
            </Flexbox>
          </div>
          <Text className={styles.hint}>{diyHint}</Text>
        </Flexbox>

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
                type={'primary'}
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
              type={'primary'}
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
