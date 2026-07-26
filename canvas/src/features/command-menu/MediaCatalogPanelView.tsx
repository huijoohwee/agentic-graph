import React from 'react'
import { Box, Grid2X2, Image as ImageIcon, List, Mic2, Plus, Rows3 } from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { CommandMenuRichMediaItem } from '@/lib/command-menu/commandMenuRichMediaInventory'
import { readCommandMenuMediaNameDraft, type CommandMenuMediaNameDrafts } from '@/lib/command-menu/commandMenuMediaNameSync'
import type { UploadedMediaPanelItem } from '@/lib/storage/uploadedMediaPanelItems'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT,
  FloatingPanelCatalogHeader,
  FloatingPanelCatalogSearchControl,
  floatingPanelCatalogBodyClassName,
  floatingPanelCatalogSurfaceClassName,
  matchesFloatingPanelCatalogSearch,
  useFloatingPanelCatalogSearch,
} from '@/lib/ui/floatingPanelCatalogLayout'
import { MediaLightbox, type MediaLightboxPromptParameter, type MediaLightboxPromptParameters } from '@/lib/ui/MediaLightbox'
import { MEDIA_IMAGE_FORMAT_PREFERENCE_ATTR, MEDIA_VIDEO_FORMAT_PREFERENCE_ATTR } from '@/lib/media/mediaFormatPreference'
import { cn } from '@/lib/utils'
import { ImportUrlPrompt } from '@/features/toolbar/ImportUrlPrompt'
import { buildTimelineAnimationState } from '@/components/timeline/timelineAnimationEngine'
import type { MediaCatalogLayout, MediaCatalogSourceMetadataItem, MediaPanelActionSpec, UploadedMediaDescriptionDrafts, UploadedMediaFieldDrafts } from './mediaCatalogTypes'
import { getMediaNameSyncKey, type UploadedMediaDragMetadata } from './mediaCatalogShared'
import { MediaActionCard, MediaActionRow, MediaCandidateCard, MediaCandidateRow, MediaSourceMetadataCard, MediaSourceMetadataRow } from './mediaCatalogCandidateItems'
import { MediaActionListRow, MediaCandidateListRow, MediaSourceMetadataListRow, UploadedMediaListRow } from './mediaCatalogListItems'
import { UploadedMediaCard, UploadedMediaRow } from './mediaCatalogUploadedItems'
import { buildUploadedMediaInfoLabel, readUploadedMediaDescription, readUploadedMediaFieldText } from './mediaCatalogUploadedFields'
import { MediaCatalogRichMediaPreview } from './MediaCatalogRichMediaPreview'
import {
  readMediaCatalogMode,
  setMediaCatalogMode,
  subscribeMediaCatalogMode,
} from './mediaCatalogModeRuntime'
import { XrMediaLibraryPanel } from './XrMediaLibraryPanel'
import { MotionCapturePlatformProjection } from '@/features/three/MotionCapturePlatformProjection'
import { FlightSimTrainingSurfaceProjection } from '@/features/game-flight-sim/FlightSimTrainingSurfaceProjection'
import { VoiceStudioPanel } from '@/features/voice-studio/VoiceStudioPanel'
import {
  readXrSimulationWorkbenchOpenRevision,
  subscribeXrSimulationWorkbenchOpenRequest,
} from './xrSimulationWorkbenchOpenRequest'

type MediaCatalogPanelViewProps = {
  catalogLayout: MediaCatalogLayout
  generateLightboxOpen: boolean
  generateMediaBusy: boolean
  generateMediaPrompt: string
  generatePromptParameters: readonly MediaLightboxPromptParameter[]
  generatedMediaItem: UploadedMediaPanelItem | null
  importUrlBusy: boolean
  importUrlDraft: string
  importUrlPromptOpen: boolean
  previewItem: UploadedMediaPanelItem | null
  mediaActions: readonly MediaPanelActionSpec[]
  mediaDescriptionDrafts: UploadedMediaDescriptionDrafts
  mediaFieldDrafts: UploadedMediaFieldDrafts
  mediaItems: CommandMenuRichMediaItem[]
  mediaListRef: React.RefObject<HTMLElement | null>
  mediaNameDrafts: CommandMenuMediaNameDrafts
  panelRef: React.RefObject<HTMLElement | null>
  panelTextClass: string
  sourceMetadataItem: MediaCatalogSourceMetadataItem | null
  uploadInputRef: React.RefObject<HTMLInputElement | null>
  uploadedMediaItems: UploadedMediaPanelItem[]
  onCloseGenerateLightbox: () => void
  onClosePreview: () => void
  onDeleteUploadedMedia: (item: UploadedMediaPanelItem) => void
  onDescriptionChange: (item: UploadedMediaPanelItem, nextDescription: string) => void
  onDragCommandMenuMedia: (event: React.DragEvent<HTMLElement>, item: CommandMenuRichMediaItem) => void
  onDragUploadedMedia: (event: React.DragEvent<HTMLElement>, item: UploadedMediaPanelItem, metadata?: UploadedMediaDragMetadata) => void
  onFieldChange: (item: UploadedMediaPanelItem, nextFieldText: string) => void
  onGeneratePromptChange: (nextPrompt: string) => void
  onGeneratePromptSubmit: (nextPrompt: string, parameters?: MediaLightboxPromptParameters) => void | Promise<void>
  onImportUrlChange: (nextUrl: string) => void
  onImportUrlConfirm: (url: string) => void
  onImportUrlPromptOpenChange: (open: boolean) => void
  onLayoutChange: (layout: MediaCatalogLayout) => void
  onMediaNameDraftChange: (item: CommandMenuRichMediaItem, nextName: string) => void
  onNameChange: (item: UploadedMediaPanelItem, nextName: string) => void
  onNewMedia: () => void
  onPreviewUploadedMedia: (item: UploadedMediaPanelItem) => void
  onRenameMedia: (item: CommandMenuRichMediaItem, nextName: string) => void
  onRenameUploadedMedia: (item: UploadedMediaPanelItem, nextName: string) => void
  onSelectMedia: (item: CommandMenuRichMediaItem) => void
  onSelectMediaAction: (action: MediaPanelActionSpec) => void
  onSelectUploadedMedia: (item: UploadedMediaPanelItem) => void
  onUploadMediaFiles: (files: FileList | null) => void
}

export function MediaCatalogPanelView({
  catalogLayout,
  generateLightboxOpen,
  generateMediaBusy,
  generateMediaPrompt,
  generatePromptParameters,
  generatedMediaItem,
  importUrlBusy,
  importUrlDraft,
  importUrlPromptOpen,
  previewItem,
  mediaActions,
  mediaDescriptionDrafts,
  mediaFieldDrafts,
  mediaItems,
  mediaListRef,
  mediaNameDrafts,
  panelRef,
  panelTextClass,
  sourceMetadataItem,
  uploadInputRef,
  uploadedMediaItems,
  onCloseGenerateLightbox,
  onClosePreview,
  onDeleteUploadedMedia,
  onDescriptionChange,
  onDragCommandMenuMedia,
  onDragUploadedMedia,
  onFieldChange,
  onGeneratePromptChange,
  onGeneratePromptSubmit,
  onImportUrlChange,
  onImportUrlConfirm,
  onImportUrlPromptOpenChange,
  onLayoutChange,
  onMediaNameDraftChange,
  onNameChange,
  onNewMedia,
  onPreviewUploadedMedia,
  onRenameMedia,
  onRenameUploadedMedia,
  onSelectMedia,
  onSelectMediaAction,
  onSelectUploadedMedia,
  onUploadMediaFiles,
}: MediaCatalogPanelViewProps) {
  const search = useFloatingPanelCatalogSearch()
  const xrSurfaceActive = useGraphStore(state => state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr')
  const xrSimulationWorkbenchOpenRevision = React.useSyncExternalStore(
    subscribeXrSimulationWorkbenchOpenRequest,
    readXrSimulationWorkbenchOpenRevision,
    readXrSimulationWorkbenchOpenRevision,
  )
  const catalogMode = React.useSyncExternalStore(
    subscribeMediaCatalogMode,
    readMediaCatalogMode,
    readMediaCatalogMode,
  )
  React.useEffect(() => {
    if (xrSurfaceActive) setMediaCatalogMode('xr-3d')
  }, [xrSurfaceActive])
  React.useEffect(() => {
    if (xrSurfaceActive && xrSimulationWorkbenchOpenRevision > 0) setMediaCatalogMode('xr-3d')
  }, [xrSimulationWorkbenchOpenRevision, xrSurfaceActive])
  const mediaItemCount = uploadedMediaItems.length + mediaItems.length + mediaActions.length + (sourceMetadataItem ? 1 : 0)
  const normalizedSearchQuery = search.normalizedSearchQuery
  const visibleSourceMetadataItem = sourceMetadataItem && matchesMediaSourceMetadataSearch(sourceMetadataItem, normalizedSearchQuery) ? sourceMetadataItem : null
  const visibleUploadedMediaItems = React.useMemo(
    () => uploadedMediaItems.filter(item => matchesUploadedMediaSearch(item, normalizedSearchQuery, buildUploadedMediaInfoLabel(item), readUploadedMediaDescription(mediaDescriptionDrafts, item), readUploadedMediaFieldText(mediaFieldDrafts, item))),
    [mediaDescriptionDrafts, mediaFieldDrafts, normalizedSearchQuery, uploadedMediaItems],
  )
  const visibleMediaItems = React.useMemo(
    () => mediaItems.filter(item => matchesCommandMediaSearch(item, readCommandMenuMediaNameDraft(mediaNameDrafts, getMediaNameSyncKey(item)) || item.label, normalizedSearchQuery)),
    [mediaItems, mediaNameDrafts, normalizedSearchQuery],
  )
  const visibleMediaActions = React.useMemo(
    () => mediaActions.filter(action => matchesMediaActionSearch(action, normalizedSearchQuery)),
    [mediaActions, normalizedSearchQuery],
  )
  const animationState = React.useMemo(() => buildTimelineAnimationState({
    active: mediaItemCount > 0,
    itemCount: mediaItemCount,
    progress: mediaItemCount > 0 ? Math.min(1, mediaItemCount / 12) : 0,
    surface: 'floating-media',
  }), [mediaItemCount])
  const { style: animationStyle, ...animationAttributes } = animationState.attributes
  return (
    <section
      className={floatingPanelCatalogSurfaceClassName(panelTextClass)}
      aria-label="Media"
      data-kg-floating-panel-catalog-list="media"
      data-kg-media-layout={catalogLayout}
      data-kg-media-list-layout={catalogLayout === 'list' ? FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT : undefined}
      data-kg-media-card-layout={catalogLayout === 'card' ? '3-rows' : undefined}
      data-kg-media-grid-layout={catalogLayout === 'grid' ? '1' : undefined}
      data-kg-media-panel="1"
      data-kg-media-catalog-mode={catalogMode}
      data-kg-media-image-format-preference={MEDIA_IMAGE_FORMAT_PREFERENCE_ATTR}
      data-kg-media-video-format-preference={MEDIA_VIDEO_FORMAT_PREFERENCE_ATTR}
      {...animationAttributes}
      style={animationStyle}
    >
      <MediaLightbox
        open={generateLightboxOpen}
        src={generatedMediaItem?.linkUrl || ''}
        alt={generatedMediaItem?.name || 'Generated media output'}
        kind={generatedMediaItem?.kind || 'image'}
        title="Generate Media"
        descriptionLabel="Prompt"
        promptValue={generateMediaPrompt}
        promptPlaceholder="Describe the media to generate"
        promptSubmitLabel="Generate media"
        promptSubmitting={generateMediaBusy}
        promptParameters={generatePromptParameters}
        onPromptChange={onGeneratePromptChange}
        onPromptSubmit={onGeneratePromptSubmit}
        onClose={() => onCloseGenerateLightbox()}
      />
      <FloatingPanelCatalogHeader
        title="Media"
        subtitle={catalogMode === 'voice-studio' ? '/voice.studio · clone, dictate, create' : catalogMode === 'xr-3d' ? '3D for XR · environments, subjects, and props' : '@ image, audio, video, and rich media'}
        actionsLabel="Media actions"
        dataAttributes={{ 'data-kg-media-catalog-header': '1' }}
        actions={(
          <>
            {catalogMode === 'media' ? <input
              ref={uploadInputRef}
              type="file"
              accept="image/*,audio/*,video/*"
              multiple
              className="sr-only"
              aria-label="New Media upload"
              data-kg-media-upload-input="1"
              onChange={event => {
                void onUploadMediaFiles(event.currentTarget.files)
                event.currentTarget.value = ''
              }}
            /> : null}
            {catalogMode === 'media' ? <button
              type="button"
              className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded border px-1 text-xs font-semibold', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
              title="New Media"
              aria-label="New Media"
              data-kg-media-new-button="1"
              onClick={onNewMedia}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden />
            </button> : null}
            <nav
              className={cn('ml-1 inline-flex h-6 items-center overflow-hidden rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
              aria-label="Media catalog mode"
              data-kg-media-mode-switcher="header-icons"
            >
              <button
                type="button"
                className={cn('inline-flex h-full w-6 items-center justify-center border-0 px-0', catalogMode === 'media' ? UI_THEME_TOKENS.button.activeBg : UI_THEME_TOKENS.button.hoverBg)}
                title="Media"
                aria-label="Show media library"
                aria-pressed={catalogMode === 'media'}
                data-kg-media-library-toggle="1"
                onClick={() => setMediaCatalogMode('media')}
              >
                <ImageIcon className="size-3.5" strokeWidth={1.7} aria-hidden />
              </button>
              <button
                type="button"
                className={cn('inline-flex h-full w-6 items-center justify-center border-0 border-l px-0', UI_THEME_TOKENS.panel.border, catalogMode === 'xr-3d' ? UI_THEME_TOKENS.button.activeBg : UI_THEME_TOKENS.button.hoverBg)}
                title="3D for XR"
                aria-label="Show 3D assets for XR"
                aria-pressed={catalogMode === 'xr-3d'}
                data-kg-media-3d-toggle="1"
                onClick={() => setMediaCatalogMode('xr-3d')}
              >
                <Box className="size-3.5" strokeWidth={1.7} aria-hidden />
              </button>
              <button
                type="button"
                className={cn('inline-flex h-full w-6 items-center justify-center border-0 border-l px-0', UI_THEME_TOKENS.panel.border, catalogMode === 'voice-studio' ? UI_THEME_TOKENS.button.activeBg : UI_THEME_TOKENS.button.hoverBg)}
                title="AI Voice Studio"
                aria-label="Show AI Voice Studio"
                aria-pressed={catalogMode === 'voice-studio'}
                data-kg-media-voice-toggle="1"
                onClick={() => setMediaCatalogMode('voice-studio')}
              >
                <Mic2 className="size-3.5" strokeWidth={1.7} aria-hidden />
              </button>
            </nav>
            {catalogMode === 'media' ? <section className={cn('inline-flex h-6 items-center overflow-hidden rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)} role="group" aria-label="Media layout" data-kg-media-layout-selector="1">
              {([
                { layout: 'list' as const, label: 'List layout', Icon: List },
                { layout: 'card' as const, label: 'Card layout', Icon: Rows3 },
                { layout: 'grid' as const, label: 'Grid layout', Icon: Grid2X2 },
              ]).map(option => {
                const Icon = option.Icon
                return (
                  <button
                    key={option.layout}
                    type="button"
                    className={cn(
                      'inline-flex h-full w-6 items-center justify-center border-0 px-0',
                      catalogLayout === option.layout ? 'bg-black/10 dark:bg-white/15' : UI_THEME_TOKENS.button.hoverBg,
                      UI_THEME_TOKENS.text.secondary,
                    )}
                    title={option.label}
                    aria-label={option.label}
                    aria-pressed={catalogLayout === option.layout}
                    data-kg-media-layout-toggle={option.layout}
                    onClick={() => onLayoutChange(option.layout)}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden />
                  </button>
                )
              })}
            </section> : null}
          </>
        )}
        searchControl={catalogMode === 'voice-studio' ? null : (
          <FloatingPanelCatalogSearchControl
            state={search}
            id="kg-media-catalog-search"
            buttonLabel="Search media"
            panelLabel="Search media catalog"
            placeholder={catalogMode === 'xr-3d' ? 'Search 3D XR library' : 'Search media'}
            affordanceDataAttributes={{
              'data-kg-media-search-affordance': '1',
              'data-kg-media-search-overlay-anchor': '1',
            }}
            panelDataAttributes={{
              'data-kg-media-search-panel': 'overlay',
              'data-kg-media-search-inline': '1',
              'data-kg-media-search-overlay': '1',
              'data-kg-media-search-expand-direction': 'down',
            }}
            inputDataAttributes={{ 'data-kg-media-search-input': '1' }}
            clearDataAttributes={{ 'data-kg-media-search-clear': '1' }}
            toggleDataAttributes={{ 'data-kg-media-search-toggle': '1' }}
          />
        )}
      />
      <section ref={panelRef} className={floatingPanelCatalogBodyClassName(catalogMode === 'media' && previewItem ? 'overflow-hidden' : undefined)} data-kg-floating-panel-catalog-body="media">
        {catalogMode !== 'voice-studio' ? <><FlightSimTrainingSurfaceProjection surface="media" /><MotionCapturePlatformProjection variant="media" /></> : null}
        {catalogMode === 'voice-studio' ? (
          <VoiceStudioPanel />
        ) : catalogMode === 'xr-3d' ? (
          <XrMediaLibraryPanel searchText={normalizedSearchQuery} />
        ) : previewItem ? (
          <MediaCatalogRichMediaPreview
            item={previewItem}
            items={visibleUploadedMediaItems}
            onClose={onClosePreview}
            onNavigate={onPreviewUploadedMedia}
          />
        ) : (
          <>
        {importUrlPromptOpen ? (
          <section
            className={cn('mb-2 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
            aria-label="Import media URL"
            data-kg-media-import-url-prompt="1"
          >
            <ImportUrlPrompt
              urlDraft={importUrlDraft}
              onChange={onImportUrlChange}
              onConfirm={url => {
                void onImportUrlConfirm(url)
              }}
              onCancel={() => {
                if (importUrlBusy) return
                onImportUrlPromptOpenChange(false)
              }}
              confirmLabel={importUrlBusy ? 'Importing…' : 'Import URL'}
              autoFocus
            />
          </section>
        ) : null}
        <section ref={mediaListRef} tabIndex={-1} data-kg-media-list="1">
          {catalogLayout === 'list' ? (
            <section
              className="grid min-w-0 gap-1"
              aria-label="Media list"
              data-kg-floating-panel-catalog-list-rows={FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT}
              data-kg-media-list-rows={FLOATING_PANEL_CATALOG_COMPACT_ROW_LAYOUT}
              data-kg-media-list-view="1"
            >
              {visibleSourceMetadataItem ? <MediaSourceMetadataListRow item={visibleSourceMetadataItem} /> : null}
              {visibleUploadedMediaItems.map(item => (
                <UploadedMediaListRow
                  key={item.id}
                  item={item}
                  infoLabel={buildUploadedMediaInfoLabel(item)}
                  onDelete={onDeleteUploadedMedia}
                  onDragStart={onDragUploadedMedia}
                  onSelect={onSelectUploadedMedia}
                  onPreview={onPreviewUploadedMedia}
                />
              ))}
              {visibleMediaItems.map(item => (
                <MediaCandidateListRow
                  key={item.key}
                  item={item}
                  displayName={readCommandMenuMediaNameDraft(mediaNameDrafts, getMediaNameSyncKey(item)) || item.label}
                  onDragStart={onDragCommandMenuMedia}
                  onSelect={onSelectMedia}
                />
              ))}
              {visibleMediaActions.map(action => (
                <MediaActionListRow
                  key={action.id}
                  action={action}
                  onSelect={onSelectMediaAction}
                />
              ))}
            </section>
          ) : catalogLayout === 'card' ? (
            <section className="grid min-w-0 gap-2" aria-label="Media card layout" data-kg-media-card-rows="3">
            {visibleSourceMetadataItem ? <MediaSourceMetadataRow item={visibleSourceMetadataItem} /> : null}
            {visibleUploadedMediaItems.map(item => (
              <UploadedMediaRow
                key={item.id}
                item={item}
                description={readUploadedMediaDescription(mediaDescriptionDrafts, item)}
                fieldText={readUploadedMediaFieldText(mediaFieldDrafts, item)}
                infoLabel={buildUploadedMediaInfoLabel(item)}
                onDelete={onDeleteUploadedMedia}
                onDescriptionChange={onDescriptionChange}
                onDragStart={onDragUploadedMedia}
                onFieldChange={onFieldChange}
                onNameChange={onNameChange}
                onRename={onRenameUploadedMedia}
                onSelect={onSelectUploadedMedia}
                onPreview={onPreviewUploadedMedia}
              />
            ))}
            {visibleMediaItems.map(item => (
              <MediaCandidateRow
                key={item.key}
                item={item}
                displayName={readCommandMenuMediaNameDraft(mediaNameDrafts, getMediaNameSyncKey(item)) || item.label}
                onDragStart={onDragCommandMenuMedia}
                onSelect={onSelectMedia}
                onNameDraftChange={onMediaNameDraftChange}
                onRename={onRenameMedia}
              />
            ))}
            {visibleMediaActions.map(action => (
              <MediaActionRow
                key={action.id}
                action={action}
                onSelect={onSelectMediaAction}
              />
            ))}
            </section>
          ) : (
            <section className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Media grid" data-kg-media-grid="1">
            {visibleSourceMetadataItem ? <MediaSourceMetadataCard item={visibleSourceMetadataItem} /> : null}
            {visibleUploadedMediaItems.map(item => (
              <UploadedMediaCard
                key={item.id}
                item={item}
                description={readUploadedMediaDescription(mediaDescriptionDrafts, item)}
                fieldText={readUploadedMediaFieldText(mediaFieldDrafts, item)}
                infoLabel={buildUploadedMediaInfoLabel(item)}
                onDelete={onDeleteUploadedMedia}
                onDescriptionChange={onDescriptionChange}
                onDragStart={onDragUploadedMedia}
                onFieldChange={onFieldChange}
                onNameChange={onNameChange}
                onRename={onRenameUploadedMedia}
                onSelect={onSelectUploadedMedia}
                onPreview={onPreviewUploadedMedia}
              />
            ))}
            {visibleMediaItems.map(item => (
              <MediaCandidateCard
                key={item.key}
                item={item}
                displayName={readCommandMenuMediaNameDraft(mediaNameDrafts, getMediaNameSyncKey(item)) || item.label}
                onDragStart={onDragCommandMenuMedia}
                onSelect={onSelectMedia}
                onNameDraftChange={onMediaNameDraftChange}
                onRename={onRenameMedia}
              />
            ))}
            {visibleMediaActions.map(action => (
              <MediaActionCard
                key={action.id}
                action={action}
                onSelect={onSelectMediaAction}
              />
            ))}
            </section>
          )}
        </section>
          </>
        )}
      </section>
    </section>
  )
}

function matchesMediaCatalogSearch(searchText: string, values: readonly unknown[]): boolean {
  return matchesFloatingPanelCatalogSearch(searchText, values)
}

function matchesMediaSourceMetadataSearch(item: MediaCatalogSourceMetadataItem, searchText: string): boolean {
  return matchesMediaCatalogSearch(searchText, [
    item.name,
    item.sourceUrl,
    item.mimeHint,
    item.importMode,
    item.summary?.mimeType,
    item.summary?.formatName,
    item.summary?.primaryAudioCodec,
    item.summary?.primaryVideoCodec,
    item.summary?.status,
    item.summary?.durationSeconds,
    item.byteSize,
  ])
}

function matchesUploadedMediaSearch(item: UploadedMediaPanelItem, searchText: string, infoLabel: string, description: string, fieldText: string): boolean {
  return matchesMediaCatalogSearch(searchText, [item.name, item.kind, item.linkUrl, item.status, infoLabel, description, fieldText, item.storage?.objectKey, item.storage?.contentType])
}

function matchesCommandMediaSearch(item: CommandMenuRichMediaItem, displayName: string, searchText: string): boolean {
  return matchesMediaCatalogSearch(searchText, [displayName, item.label, item.kind, item.src, item.openUrl, item.thumbnailUrl])
}

function matchesMediaActionSearch(action: MediaPanelActionSpec, searchText: string): boolean {
  return matchesMediaCatalogSearch(searchText, [action.label, action.description, action.kind, action.id])
}
