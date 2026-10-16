import { fs, path, readUtf8 } from './sourceFixture'

export const testFloatingPanelRemovesDesignLayersViewAfterWorkflowManagerConsolidation = () => {
  const root = process.cwd()
  const filePath = path.resolve(root, 'src', 'lib', 'toolbar', 'ToolbarToolMenu.impl.tsx'), xrSceneViewsPath = path.resolve(root, 'src', 'lib', 'toolbar', 'FloatingPanelXrSceneViews.tsx')
  const iconLibraryPath = path.resolve(root, 'src', 'features', 'panels', 'ui', 'mainPanelHelpIconLibrary.tsx')
  const floatingPanelTypesPath = path.resolve(root, 'src', 'hooks', 'store', 'store-types', 'graph-state-chat-import.ts')
  const uiSliceInitialStatePath = path.resolve(root, 'src', 'hooks', 'store', 'uiSliceInitialState.ts')
  const commandCatalogPanelPath = path.resolve(root, 'src', 'features', 'command-menu', 'CommandMenuCatalogPanel.tsx')
  const commandMenuDirectoryPath = path.resolve(root, 'src', 'features', 'command-menu')
  const inlineCommandCatalogPath = path.resolve(root, 'src', 'lib', 'command-menu', 'inlineCommandMenuCatalog.ts')
  const responsiveInlineIconBadgePath = path.resolve(root, 'src', 'lib', 'ui', 'ResponsiveInlineIconBadge.tsx'), floatingPanelCatalogLayoutPath = path.resolve(root, 'src', 'lib', 'ui', 'floatingPanelCatalogLayout.tsx')
  const mediaKindOverlayPath = path.resolve(root, 'src', 'lib', 'ui', 'MediaKindOverlay.tsx')
  const mediaKindOverlayIconPath = path.resolve(root, 'src', 'lib', 'ui', 'mediaKindOverlayIcon.ts')
  const mediaOverlayAppearancePath = path.resolve(root, 'src', 'lib', 'ui', 'mediaOverlayAppearance.ts')
  const mediaLightboxPath = path.resolve(root, 'src', 'lib', 'ui', 'MediaLightbox.tsx'), richMediaDirectSurfacePath = path.resolve(root, 'src', 'components', 'RichMediaPanelDirectMediaSurface.tsx')
  const mediaLightboxPromptParametersPath = path.resolve(root, 'src', 'lib', 'ui', 'mediaLightboxPromptParameters.ts')
  const uiBarrelPath = path.resolve(root, 'src', 'lib', 'ui', 'index.ts')
  const indexCssPath = path.resolve(root, 'src', 'index.css')
  const uploadedMediaPanelUploadPath = path.resolve(root, 'src', 'lib', 'storage', 'uploadedMediaPanelUpload.ts')
  const helpSectionsPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'HelpSections.tsx')
  const helpCommandMenuSectionPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'HelpCommandMenuSection.tsx')
  const helpCloudflareMediaSectionPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'HelpCloudflareMediaSection.tsx')
  const launcherPath = path.resolve(root, 'src', 'features', 'toolbar', 'ToolbarMenuLauncher.tsx')
  const typesPath = path.resolve(root, 'src', 'features', 'toolbar', 'ToolbarToolMenuTypes.ts')
  const text = readUtf8(filePath) + readUtf8(path.resolve(root, 'src/features/toolbar/FloatingPanelViewTabs.tsx')), xrSceneViewsText = readUtf8(xrSceneViewsPath)
  const iconLibraryText = readUtf8(iconLibraryPath)
  const floatingPanelTypesText = readUtf8(floatingPanelTypesPath)
  const uiSliceInitialStateText = readUtf8(uiSliceInitialStatePath)
  const commandCatalogReferenceText = readUtf8(commandCatalogPanelPath)
  const commandMenuFileNames = [
    'CommandMenuCatalogPanel.tsx',
    'MediaCatalogPanel.tsx',
    'MediaCatalogPanelView.tsx',
    'mediaCatalogActionSelection.ts',
    'mediaCatalogCandidateItems.tsx',
    'mediaCatalogListItems.tsx',
    'mediaCatalogShared.tsx',
    'mediaCatalogTypes.ts',
    'mediaCatalogUploadedFields.tsx',
    'mediaCatalogUploadedItems.tsx',
  ]
  const commandCatalogPanelText = commandMenuFileNames
    .map(fileName => readUtf8(path.resolve(commandMenuDirectoryPath, fileName)))
    .join('\n')
  const inlineCommandCatalogText = readUtf8(inlineCommandCatalogPath)
  const responsiveInlineIconBadgeText = readUtf8(responsiveInlineIconBadgePath), floatingPanelCatalogLayoutText = readUtf8(floatingPanelCatalogLayoutPath)
  const mediaKindOverlayText = readUtf8(mediaKindOverlayPath)
  const mediaKindOverlayIconText = readUtf8(mediaKindOverlayIconPath)
  const mediaOverlayAppearanceText = readUtf8(mediaOverlayAppearancePath)
  const mediaLightboxText = readUtf8(mediaLightboxPath), richMediaDirectSurfaceText = readUtf8(richMediaDirectSurfacePath)
  const mediaLightboxPromptParametersText = readUtf8(mediaLightboxPromptParametersPath)
  const uiBarrelText = readUtf8(uiBarrelPath)
  const indexCssText = readUtf8(indexCssPath)
  const uploadedMediaPanelUploadText = readUtf8(uploadedMediaPanelUploadPath)
  const helpSectionsText = readUtf8(helpSectionsPath)
  const helpCommandMenuSectionText = readUtf8(helpCommandMenuSectionPath)
  const helpCloudflareMediaSectionText = readUtf8(helpCloudflareMediaSectionPath)
  const launcherText = readUtf8(launcherPath)
  const typesText = readUtf8(typesPath)
  if (text.includes("view: 'designLayers'")) {
    throw new Error('Expected FloatingPanel to remove designLayers view after Workflow Manager consolidation')
  }
  if (!text.includes("view: 'view'")) {
    throw new Error('Expected FloatingPanel to expose a dedicated View tab beside Props Panel')
  }
  if (text.indexOf("view: 'media'") <= text.indexOf("view: 'view'")) {
    throw new Error('Expected FloatingPanel to place Media immediately after View in the primary view list')
  }
  if (!text.includes("floatingPanelView === 'view' && <WorkspaceDataViewFloatingPanelView />")) {
    throw new Error('Expected FloatingPanel to render the dedicated View settings surface')
  }
  if (!xrSceneViewsText.includes("view === 'media'") || !xrSceneViewsText.includes('<MediaCatalogPanelLazy />')) {
    throw new Error('Expected FloatingPanel to render the Media view')
  }
  const mediaViewIndex = text.indexOf("view: 'media'")
  const animationViewIndex = text.indexOf("view: 'animation'")
  const cameraViewIndex = text.indexOf("view: 'camera'")
  if (!(mediaViewIndex >= 0 && mediaViewIndex < animationViewIndex && animationViewIndex < cameraViewIndex)
    || !xrSceneViewsText.includes("view === 'animation'")
    || !xrSceneViewsText.includes('<XrAnimationFloatingPanelViewLazy />')) {
    throw new Error('Expected FloatingPanel Animation immediately after Media and before Camera with a lazy first-class render branch')
  }
  if (!iconLibraryText.includes('floatingPanel.media') || !iconLibraryText.includes('media: \'floatingPanel.media\'') || !iconLibraryText.includes('floatingPanel.animation') || !iconLibraryText.includes('animation: \'floatingPanel.animation\'')) {
    throw new Error('Expected FloatingPanel icon SSOT to include Media and Animation')
  }
  if (!floatingPanelTypesText.includes("| 'media'") || !floatingPanelTypesText.includes("| 'animation'")) {
    throw new Error('Expected FloatingPanel view type to include Media and Animation')
  }
  if (!uiSliceInitialStateText.includes("view === 'media'") || !uiSliceInitialStateText.includes("view === 'animation'")) {
    throw new Error('Expected FloatingPanel view setter whitelist to accept Media and Animation')
  }
  if (!helpSectionsText.includes('<HelpCommandMenuSection') || !helpCommandMenuSectionText.includes('<CommandMenuReferenceCatalog')) {
    throw new Error('Expected MainPanel Help to own the shared Command Menu reference catalog section')
  }
  if (!commandCatalogReferenceText.includes('INLINE_SLASH_COMMAND_ACTIONS') || !commandCatalogReferenceText.includes('INLINE_VARIABLE_COMMAND_ACTIONS') || !commandCatalogReferenceText.includes('INLINE_KEYWORD_COMMAND_ACTIONS')) {
    throw new Error('Expected Command Menu reference catalog to render from the shared inline command catalog')
  }
  if (!commandCatalogReferenceText.includes('data-kg-command-menu-reference-catalog') || !commandCatalogReferenceText.includes('data-kg-command-menu-prefix')) {
    throw new Error('Expected MainPanel Help Command Menu reference catalog to expose shared prefix rows for /, @, and # actions')
  }
  if (commandCatalogReferenceText.split('\n').length >= 600) {
    throw new Error('Expected CommandMenuCatalogPanel.tsx to stay below 600 lines and keep FloatingPanel Media in its dedicated owner')
  }
  for (const fileName of commandMenuFileNames) {
    const lineCount = readUtf8(path.resolve(commandMenuDirectoryPath, fileName)).split('\n').length
    if (lineCount >= 600) {
      throw new Error(`Expected features/command-menu/${fileName} to stay below 600 lines; got ${lineCount}`)
    }
  }
  if (!commandCatalogPanelText.includes('useCommandMenuRichMediaInventory') || !commandCatalogPanelText.includes('data-kg-media-panel') || !commandCatalogPanelText.includes('data-kg-media-list')) {
    throw new Error('Expected FloatingPanel Media to own the shared @ rich-media candidate list')
  }
  if (
    !commandCatalogPanelText.includes('data-kg-media-layout-selector')
    || !commandCatalogPanelText.includes('data-kg-media-layout-toggle')
    || !commandCatalogPanelText.includes('data-kg-media-search-toggle')
    || !commandCatalogPanelText.includes('data-kg-media-search-affordance')
    || !commandCatalogPanelText.includes('data-kg-media-search-overlay-anchor')
    || !commandCatalogPanelText.includes('data-kg-media-search-panel')
    || !commandCatalogPanelText.includes('data-kg-media-search-inline')
    || !commandCatalogPanelText.includes('data-kg-media-search-overlay')
    || !commandCatalogPanelText.includes('data-kg-media-search-expand-direction')
    || !commandCatalogPanelText.includes('data-kg-media-search-input')
    || commandCatalogPanelText.includes('title="@ media commands"')
    || commandCatalogPanelText.includes('<span>Search</span>')
    || !commandCatalogPanelText.includes('data-kg-media-grid')
    || !commandCatalogPanelText.includes('data-kg-media-list-layout')
    || !commandCatalogPanelText.includes('data-kg-media-card-layout')
    || !commandCatalogPanelText.includes('Card layout')
    || !commandCatalogPanelText.includes('MEDIA_COMPACT_LIST_ROW_LAYOUT')
    || !commandCatalogPanelText.includes('data-kg-media-list-row-layout={MEDIA_COMPACT_LIST_ROW_LAYOUT}')
    || !commandCatalogPanelText.includes('data-kg-media-list-view-row="1"')
    || !commandCatalogPanelText.includes('data-kg-media-list-row-layout="3-rows"')
    || !commandCatalogPanelText.includes('data-kg-media-list-row-section="title"')
    || !commandCatalogPanelText.includes('data-kg-media-list-row-section="meta"')
    || !commandCatalogPanelText.includes('data-kg-media-list-row-section="description"')
    || !commandCatalogPanelText.includes('MEDIA_LIST_THUMBNAIL_COLUMN_CLASSNAME')
    || !commandCatalogPanelText.includes('MEDIA_LIST_THUMBNAIL_FRAME_CLASSNAME')
    || !commandCatalogPanelText.includes("from '@/lib/ui/floatingPanelCatalogLayout'") || !commandCatalogPanelText.includes('floatingPanelCatalogThreeRowClassName')
    || !commandCatalogPanelText.includes('floatingPanelCatalogThreeRowThumbnailFrameClassName') || !floatingPanelCatalogLayoutText.includes('grid-cols-[6.875rem_minmax(0,1fr)]')
    || !floatingPanelCatalogLayoutText.includes('group relative inline-flex h-[4.625rem] w-[6.475rem]') || !floatingPanelCatalogLayoutText.includes('overflow-visible')
    || !commandCatalogPanelText.includes('MediaListThumbnailIconFrame')
    || !commandCatalogPanelText.includes("MediaDownloadOverlay, MediaInfoOverlay, MediaKindOverlay, MediaOpenLinkOverlay } from '@/lib/ui/MediaKindOverlay'")
    || !commandCatalogPanelText.includes("resolveMediaKindOverlayIcon } from '@/lib/ui/mediaKindOverlayIcon'")
    || !commandCatalogPanelText.includes("className={cn('group relative m-0 aspect-[16/9]")
    || !commandCatalogPanelText.includes("className={cn('group relative m-0 grid aspect-[16/9]")
    || !commandCatalogPanelText.includes('isOpenableMediaHref')
    || !commandCatalogPanelText.includes('readRichMediaOpenHref')
    || !commandCatalogPanelText.includes('MediaCandidateCard')
    || !commandCatalogPanelText.includes('UploadedMediaCard')
    || !commandCatalogPanelText.includes('<article')
    || !commandCatalogPanelText.includes('<figure')
  ) {
    throw new Error('Expected FloatingPanel Media to own a semantic grid/list layout selector, proportional media thumbnail lane, card layout, and 3-row list layout')
  }
  if (commandCatalogPanelText.includes('inline-flex h-8 w-14') || commandCatalogPanelText.includes('grid h-10 w-14')) {
    throw new Error('Expected FloatingPanel Media list thumbnails and command icons to reuse the shared proportional thumbnail lane')
  }
  if (
    commandCatalogPanelText.includes('<ResponsiveInlineIconBadge Icon={Icon} label={mediaKind')
    || commandCatalogPanelText.includes('<ResponsiveInlineIconBadge Icon={Icon} label={item.kind} />\n          <a')
    || commandCatalogPanelText.includes('<ResponsiveInlineIconBadge Icon={Icon} label={item.kind} />\n          <span')
    || commandCatalogPanelText.includes('<ResponsiveInlineIconBadge Icon={Icon} label={item.kind} />')
  ) {
    throw new Error('Expected FloatingPanel Media kind labels to consolidate into the shared thumbnail overlay icon instead of text chips')
  }
  if (
    commandCatalogPanelText.includes('function MediaKindBadge')
    || !commandCatalogPanelText.includes("ResponsiveInlineIconBadge } from '@/lib/ui/ResponsiveInlineIconBadge'")
    || !responsiveInlineIconBadgeText.includes('getChipClass')
    || !responsiveInlineIconBadgeText.includes('UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME')
    || !responsiveInlineIconBadgeText.includes("className={cn('h-3 w-3 shrink-0'")
    || !responsiveInlineIconBadgeText.includes('data-kg-responsive-inline-icon-badge')
  ) {
    throw new Error('Expected FloatingPanel Media kind chips to reuse the shared responsive inline icon badge while keeping tiny icons')
  }
  if (
    !mediaKindOverlayText.includes('export function MediaKindOverlay')
    || !mediaKindOverlayText.includes('export function MediaOpenLinkOverlay')
    || !mediaKindOverlayText.includes('export function MediaInfoOverlay')
    || !mediaKindOverlayText.includes('export function MediaDownloadOverlay')
    || !mediaKindOverlayText.includes('buildMarkdownMediaDownloadHref')
    || !mediaKindOverlayText.includes('deriveMarkdownMediaDownloadFilename')
    || !mediaKindOverlayText.includes('data-kg-media-kind-overlay-icon')
    || !mediaKindOverlayText.includes('data-kg-media-open-link-overlay')
    || !mediaKindOverlayText.includes('data-kg-media-info-overlay')
    || !mediaKindOverlayText.includes('data-kg-media-info-overlay-tooltip')
    || !mediaKindOverlayText.includes('data-kg-media-download-overlay')
    || !mediaKindOverlayIconText.includes('export function resolveMediaKindOverlayIcon')
    || !mediaKindOverlayIconText.includes('FileAudio')
    || !mediaKindOverlayIconText.includes('FileCode2')
    || !mediaOverlayAppearanceText.includes('export type MediaOverlayAppearance')
    || !mediaOverlayAppearanceText.includes('MEDIA_OVERLAY_HOVER_APPEAR_CLASSNAME')
    || !mediaOverlayAppearanceText.includes('group-hover:opacity-100')
    || !mediaKindOverlayText.includes('getMediaOverlayAppearanceClassName(appearance)')
    || !mediaKindOverlayText.includes('group-hover:block')
    || !mediaKindOverlayText.includes('group-focus:block')
    || !mediaKindOverlayText.includes('bottom-1 right-1')
    || !mediaKindOverlayText.includes('right-1 top-1')
    || !mediaKindOverlayText.includes('bottom-1 left-1')
    || !mediaKindOverlayText.includes('pointer-events-auto')
    || !mediaKindOverlayText.includes('ExternalLink')
    || !mediaKindOverlayText.includes('Download')
    || !mediaKindOverlayText.includes('Info')
    || !mediaKindOverlayText.includes('bg-[color:var(--kg-panel-bg)]/80')
    || !mediaKindOverlayText.includes('backdrop-blur-sm')
    || !mediaKindOverlayText.includes("Icon className=\"h-3 w-3\"")
    || !uiBarrelText.includes("export * from './MediaKindOverlay'")
    || !uiBarrelText.includes("export * from './mediaKindOverlayIcon'")
    || !uiBarrelText.includes("export * from './mediaOverlayAppearance'")
  ) {
    throw new Error('Expected Media kind and open-link overlays to be shared translucent UI utilities exported across agentic-graph')
  }
  if (
    !commandCatalogPanelText.includes('appearance="hover"')
    || commandCatalogPanelText.includes('opacity-0 transition-opacity group-hover:opacity-100')
  ) {
    throw new Error('Expected FloatingPanel Media thumbnail overlays to use the shared hover-appear overlay utility')
  }
  if (
    !commandCatalogPanelText.includes('MediaLightbox')
    || !commandCatalogPanelText.includes('handlePreviewUploadedMedia')
    || !commandCatalogPanelText.includes('onPreviewUploadedMedia={handlePreviewUploadedMedia}')
    || !commandCatalogPanelText.includes('onPreview={onPreviewUploadedMedia}')
    || !commandCatalogPanelText.includes('data-kg-media-thumbnail-fullscreen')
    || !commandCatalogPanelText.includes('MediaDownloadOverlay')
    || !mediaLightboxText.includes('PreviewOverlay')
    || !mediaLightboxText.includes('<RichMediaPanel') || !richMediaDirectSurfaceText.includes('ZoomPanViewport')
    || !mediaLightboxText.includes('data-kg-media-lightbox="1"')
    || !mediaLightboxText.includes('data-kg-media-lightbox-kind')
    || !mediaLightboxText.includes("'data-kg-media-lightbox-fullscreen': '1'")
    || !mediaLightboxText.includes('data-kg-media-lightbox-close="1"')
    || !mediaLightboxText.includes('data-kg-media-lightbox-video="1"')
    || !mediaLightboxText.includes('data-kg-media-lightbox-audio="1"')
    || !richMediaDirectSurfaceText.includes('LS_KEYS.previewZoomPanMedia')
    || !uiBarrelText.includes("export * from './MediaLightbox'")
  ) {
    throw new Error('Expected FloatingPanel Media thumbnail preview and Download Media to reuse shared preview and download utilities')
  }
  if (
    !commandCatalogPanelText.includes('data-kg-media-new-button')
    || !commandCatalogPanelText.includes('aria-label="New Media"')
    || !commandCatalogPanelText.includes('data-kg-media-upload-input')
    || !commandCatalogPanelText.includes('accept="image/*,audio/*,video/*"')
    || !commandCatalogPanelText.includes('MEDIA_LIBRARY_OPEN_TOP_EVENT')
    || !commandCatalogPanelText.includes('mediaListRef')
    || !commandCatalogPanelText.includes('openMediaLibraryTop')
    || !commandCatalogPanelText.includes('MEDIA_NEW_ACTIONS')
    || !commandCatalogPanelText.includes("label: 'Upload Media'")
    || !commandCatalogPanelText.includes("label: 'Import URL'")
    || !commandCatalogPanelText.includes('data-kg-media-import-url-prompt="1"')
    || !commandCatalogPanelText.includes("from '@/features/toolbar/ImportUrlPrompt'")
    || !commandCatalogPanelText.includes("from '@/lib/storage/uploadedMediaPanelImportUrl'")
    || !commandCatalogPanelText.includes("label: 'Generate Media'")
    || !commandCatalogPanelText.includes('generateLightboxOpen')
    || !commandCatalogPanelText.includes('buildMediaLightboxPromptParameters')
    || !commandCatalogPanelText.includes("from '@/lib/ui/mediaDragPayload'")
    || !commandCatalogPanelText.includes('writeMediaDragPayload(event.dataTransfer, payload)')
    || !commandCatalogPanelText.includes('data-kg-media-draggable="1"')
    || !inlineCommandCatalogText.includes("label: 'New Media'")
  ) {
    throw new Error('Expected FloatingPanel Media to expose New Media upload/generate choices while preserving shared upload and prompt-panel support')
  }
  if (
    !mediaLightboxText.includes('data-kg-media-lightbox-empty-output="1"')
    || !mediaLightboxText.includes('open={open && (hasMediaSource || editablePrompt)}')
    || !mediaLightboxPromptParametersText.includes('buildMediaLightboxPromptParameters')
    || !mediaLightboxPromptParametersText.includes('CHAT_BYTEPLUS_IMAGE_MODEL_OPTIONS')
    || !mediaLightboxPromptParametersText.includes('MEDIA_VARIATION_COUNT_PARAMETER_OPTIONS')
  ) {
    throw new Error('Expected shared MediaLightbox to support prompt-only generated media panels with reusable model and parameter controls')
  }
  if (!commandCatalogPanelText.includes('uploadFilesToUploadedMediaPanel') || !uploadedMediaPanelUploadText.includes('uploadMediaFileToAgenticGraphStorage') || !commandCatalogPanelText.includes('data-kg-media-upload-item') || !commandCatalogPanelText.includes('MediaOpenLinkOverlay')) {
    throw new Error('Expected FloatingPanel Media upload rows to reuse the Cloudflare media storage helper and expose synced links')
  }
  if (
    commandCatalogPanelText.includes('Open Cloudflare media link')
    || commandCatalogPanelText.includes('Open local media link')
    || commandCatalogPanelText.includes('Cloudflare media link')
    || commandCatalogPanelText.includes('Local media link')
    || commandCatalogPanelText.includes('>Open</a>')
  ) {
    throw new Error('Expected FloatingPanel Media open-link actions to consolidate into the shared thumbnail overlay instead of text links')
  }
  if (
    commandCatalogPanelText.includes('Cloudflare storage')
    || commandCatalogPanelText.includes('Local storage')
  ) {
    throw new Error('Expected FloatingPanel Media to remove stale storage status copy from uploaded media rows')
  }
  if (
    !commandCatalogPanelText.includes('MEDIA_DESCRIPTION_STORAGE_KEY')
    || !commandCatalogPanelText.includes('MEDIA_FIELDS_STORAGE_KEY')
    || !commandCatalogPanelText.includes('readUploadedMediaDescription')
    || !commandCatalogPanelText.includes('readUploadedMediaFieldText')
    || !commandCatalogPanelText.includes('buildUploadedMediaInfoLabel')
    || !commandCatalogPanelText.includes('handleUploadedMediaDescriptionChange')
    || !commandCatalogPanelText.includes('handleUploadedMediaFieldChange')
    || !commandCatalogPanelText.includes('data-kg-media-description-input')
    || !commandCatalogPanelText.includes('buildUploadedMediaDefaultFieldTokens')
    || !commandCatalogPanelText.includes('data-kg-media-field-tags-inline')
    || !commandCatalogPanelText.includes('data-kg-media-field-input')
    || !commandCatalogPanelText.includes('renderMarkdownSigilInlineText(normalizedValue)')
    || !commandCatalogPanelText.includes('UI_INLINE_CHIP_GROUP_CLASSNAME')
    || !indexCssText.includes('[data-kg-media-description-input]')
    || !indexCssText.includes('display: inline-block !important;')
    || !commandCatalogPanelText.includes('MediaInfoOverlay')
  ) {
    throw new Error('Expected FloatingPanel Media uploaded rows to expose editable descriptions, # metadata fields, and the shared info overlay')
  }
  if (
    commandCatalogPanelText.includes('data-kg-media-field-tags="1"')
    || commandCatalogPanelText.includes('data-kg-media-field-tag={')
    || commandCatalogPanelText.includes('data-kg-media-field-tag=')
    || commandCatalogPanelText.includes('DATA_VIEW_CHIP_ROW_CLASSNAME')
    || commandCatalogPanelText.includes('readInlineKeywordChipLabel')
    || commandCatalogPanelText.includes('readInlineKeywordChipToneValue')
    || commandCatalogPanelText.includes('UI_TEXT_TRUNCATE_CHIP')
    || commandCatalogPanelText.includes('splitInlineKeywordChipTokens')
    || commandCatalogPanelText.includes('resolveDataViewChipClass(tag)')
    || commandCatalogPanelText.includes('text-[11px] font-normal leading-5')
    || commandCatalogPanelText.includes("style={{ display: 'inline-flex' }}")
    || indexCssText.includes('[data-kg-media-field-tags-inline]')
  ) {
    throw new Error('Expected FloatingPanel Media uploaded # fields to delegate to the shared Markdown sigil utility without local chip/font/display overrides')
  }
  if (commandCatalogPanelText.includes('UploadedMediaFieldTags')) {
    throw new Error('Expected FloatingPanel Media uploaded # fields to inline-edit through the metadata row instead of a separate section')
  }
  if (
    commandCatalogPanelText.includes('data-kg-command-menu-cloudflare-media-service')
    || commandCatalogPanelText.includes('CLOUDFLARE_MEDIA_ASSET_SYNC_SERVICES')
  ) {
    throw new Error('Expected FloatingPanel Media to avoid Cloudflare storage configuration rows')
  }
  if (!helpSectionsText.includes('<HelpCloudflareMediaSection') || !helpCloudflareMediaSectionText.includes('data-kg-main-panel-cloudflare-media-service')) {
    throw new Error('Expected MainPanel Help to own the Cloudflare media runtime configuration rows')
  }
  if (
    !commandCatalogPanelText.includes('data-kg-command-menu-media-thumbnail')
    || !commandCatalogPanelText.includes('mediaListThumbnailFrameClassName')
    || !floatingPanelCatalogLayoutText.includes('rounded border')
    || !floatingPanelCatalogLayoutText.includes('UI_THEME_TOKENS.panel.border')
    || !floatingPanelCatalogLayoutText.includes('UI_THEME_TOKENS.input.bg')
    || !floatingPanelCatalogLayoutText.includes('shadow-none')
  ) {
    throw new Error('Expected FloatingPanel Media thumbnails to use the shared tokenized proportional thumbnail frame')
  }
  if (
    !commandCatalogPanelText.includes('data-kg-command-menu-media-name-input')
    || !commandCatalogPanelText.includes('renameCommandMenuRichMediaMarkdownHref')
    || !commandCatalogPanelText.includes("owner.type === 'graphNodeLabel'")
    || !commandCatalogPanelText.includes('setMarkdownDocument(markdownDocumentName, nextText')
  ) {
    throw new Error('Expected FloatingPanel Media names to be inline-editable through graph and markdown owners')
  }
  if (!commandCatalogPanelText.includes('KeyTypeValueHeader') || !commandCatalogPanelText.includes('KeyTypeValueStaticRow') || !commandCatalogPanelText.includes('KeyTypeValueSectionStack')) {
    throw new Error('Expected MainPanel Help Command Menu catalog to keep using shared KTV primitives')
  }
  if (commandCatalogPanelText.includes('data-kg-media-ktv-layout')) {
    throw new Error('Expected Media panel list mode to remove the legacy KTV three-column layout marker')
  }
  if (text.includes("floatingPanelView === 'designLayers'")) {
    throw new Error('Expected FloatingPanel to avoid rendering designLayers branch after consolidation')
  }
  if (text.includes("view: 'discovery'")) {
    throw new Error('Expected FloatingPanel to remove legacy discovery tab after Props Panel Discovery Widget consolidation')
  }
  if (text.includes("floatingPanelView === 'discovery'")) {
    throw new Error('Expected FloatingPanel to remove dedicated discovery branch after Props Panel Discovery Widget consolidation')
  }
  if (text.includes('normalizeRequestedFloatingPanelView')) {
    throw new Error('Expected FloatingPanel to remove legacy requested-view remapping after discovery consolidation')
  }
  if (launcherText.includes("'discovery'")) {
    throw new Error('Expected ToolbarMenuLauncher to remove legacy discovery requested-view support')
  }
  if (!launcherText.includes("tab === 'view'")) {
    throw new Error('Expected ToolbarMenuLauncher to route shared View requests into the FloatingPanel')
  }
  if (typesText.includes("'discovery'")) {
    throw new Error('Expected ToolbarToolMenuProps to remove legacy discovery requested-view type support')
  }
  if (!typesText.includes("import type { FloatingPanelView }") || !typesText.includes('requestedFloatingPanelView?: FloatingPanelView')) {
    throw new Error('Expected ToolbarToolMenuProps to use the shared FloatingPanelView type owner')
  }
}

export const testWorkflowManagerConsolidatedEntriesReuseGraphFieldsRightPane = () => {
  const root = process.cwd()
  const storyboardWidgetGraphTabPath = path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'StoryboardWidgetGraphTab.tsx')
  const graphFieldsViewPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'GraphFieldsView.tsx')
  const graphFieldsCommandsPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'graph-fields', 'graphFieldsEntryCommands.ts')
  const graphTabText = readUtf8(storyboardWidgetGraphTabPath)
  const graphFieldsText = readUtf8(graphFieldsViewPath)
  const graphFieldsCommandsText = readUtf8(graphFieldsCommandsPath)

  if (!graphTabText.includes('entryShortcutLabels={WORKFLOW_MANAGER_GRAPH_FIELDS_COMMAND_ENTRY_LABELS}')) {
    throw new Error('Expected Workflow Manager to pass consolidated workflow shortcut labels into GraphFieldsView')
  }
  if (!graphTabText.includes('GRAPH_FIELDS_COMMAND_ENTRY_LABELS')) {
    throw new Error('Expected non-workflow graph tab to reuse shared Graph Fields command entry labels')
  }
  if (!graphTabText.includes('entryOpenRequest={entryOpenRequest}')) {
    throw new Error('Expected Workflow Manager to pass entry open requests into GraphFieldsView')
  }
  if (!graphFieldsText.includes('resolveGraphFieldsEntryCommandTarget')) {
    throw new Error('Expected GraphFieldsView to route entry commands through the shared Graph Fields command helper')
  }
  if (!graphFieldsText.includes('isGraphFieldsSelectionInspectorEntryLabel')) {
    throw new Error('Expected GraphFieldsView to detect selection-inspector entry requests inside the shared Graph Fields pane model')
  }
  if (!graphFieldsText.includes('GraphRecordSelectionInspectorLazy')) {
    throw new Error('Expected GraphFieldsView to reuse the shared selection inspector inside the existing settings pane')
  }
  if (!graphFieldsText.includes('handledEntryOpenTokenRef')) {
    throw new Error('Expected GraphFieldsView entry-open handling to dedupe repeated request tokens and avoid runtime update loops')
  }
  if (!graphFieldsCommandsText.includes('WORKFLOW_MANAGER_GRAPH_FIELDS_COMMAND_ENTRY_LABELS') || !graphFieldsCommandsText.includes('resolveGraphFieldsEntryCommandTarget')) {
    throw new Error('Expected Graph Fields command helper to own workflow labels and target routing')
  }
  if (!graphFieldsCommandsText.includes('isGraphFieldsSelectionInspectorEntryLabel')) {
    throw new Error('Expected Graph Fields command helper to centralize selection-inspector entry detection')
  }
  if (!graphFieldsCommandsText.includes('INLINE_MEDIA_COMMAND_ENTRY_LABELS')) {
    throw new Error('Expected Graph Fields command helper to reuse shared media command labels')
  }
  if (!graphFieldsCommandsText.includes("label.includes('image')") || !graphFieldsCommandsText.includes("label.includes('video')")) {
    throw new Error('Expected Graph Fields command helper to route image/video command entries')
  }
  if (!graphFieldsText.includes('entryOpenRequest?:')) {
    throw new Error('Expected GraphFieldsView to accept consolidated entry open requests')
  }
  if (!graphFieldsText.includes('setSelectedFieldId(target.id)')) {
    throw new Error('Expected GraphFieldsView to open right-pane Field Settings by selecting a target field')
  }
  if (!graphFieldsText.includes('graphFields:entryOpen:')) {
    throw new Error('Expected GraphFieldsView consolidated entry-open path to provide visible toast confirmation')
  }
  if (!graphFieldsText.includes('scrollIntoView')) {
    throw new Error('Expected GraphFieldsView consolidated entry-open path to move focus toward right-pane Field Settings')
  }
}

export const testGraphFieldsResponsiveSizingOwnersStayShared = () => {
  const root = process.cwd()
  const responsiveCssPath = path.resolve(root, 'src', 'styles', 'responsive-toolbar.css')
  const responsiveElementClassesPath = path.resolve(root, 'src', 'lib', 'ui', 'responsiveElementClasses.ts')
  const fieldLayoutPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'graph-fields', 'FieldLayoutSection.tsx')
  const fieldEndpointsPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'graph-fields', 'FieldEndpointsAndCardinalitySection.tsx')
  const fieldSamplesPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'graph-fields', 'FieldSamplesPanel.tsx')
  const graphFieldIconsPath = path.resolve(root, 'src', 'features', 'graph-fields', 'ui', 'graphFieldIcons.tsx')

  const responsiveCss = readUtf8(responsiveCssPath)
  const responsiveElementClasses = readUtf8(responsiveElementClassesPath)
  const fieldLayout = readUtf8(fieldLayoutPath)
  const fieldEndpoints = readUtf8(fieldEndpointsPath)
  const fieldSamples = readUtf8(fieldSamplesPath)
  const graphFieldIcons = readUtf8(graphFieldIconsPath)

  if (
    !responsiveElementClasses.includes('UI_RESPONSIVE_GRAPH_FIELDS_OWNER_VALUE_CLASSNAME') ||
    !responsiveElementClasses.includes('UI_RESPONSIVE_WIDE_PANEL_HEADER_SECONDARY_CLASSNAME') ||
    !responsiveCss.includes('.kg-graph-fields-owner-value') ||
    !responsiveCss.includes('--kg-graph-fields-owner-value-width') ||
    !responsiveCss.includes('.kg-responsive-panel-header-secondary--wide') ||
    !fieldLayout.includes('UI_RESPONSIVE_GRAPH_FIELDS_OWNER_VALUE_CLASSNAME') ||
    !fieldEndpoints.includes('UI_RESPONSIVE_GRAPH_FIELDS_OWNER_VALUE_CLASSNAME') ||
    !fieldSamples.includes('UI_RESPONSIVE_WIDE_PANEL_HEADER_SECONDARY_CLASSNAME') ||
    !graphFieldIcons.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !graphFieldIcons.includes('graphFieldIconDefaultClassName') ||
    fieldSamples.includes('max-w-[65%]') ||
    [fieldLayout, fieldEndpoints].some(text => text.includes('w-40 truncate')) ||
    graphFieldIcons.includes('w-4 h-4') ||
    graphFieldIcons.includes('h-4 w-4') ||
    graphFieldIcons.includes('16px')
  ) {
    throw new Error('Expected Graph Fields owner-key, samples header widths, and default icon glyphs to reuse shared responsive owners')
  }
}

export const testGraphEditorToolRailResponsiveGlyphsStayShared = () => {
  const root = process.cwd()
  const graphEditorToolRailPath = path.resolve(root, 'src', 'features', 'graph-editor', 'GraphEditorToolRail.tsx')
  const responsiveElementClassesPath = path.resolve(root, 'src', 'lib', 'ui', 'responsiveElementClasses.ts')
  const responsiveCssPath = path.resolve(root, 'src', 'styles', 'responsive-toolbar.css')

  const graphEditorToolRail = readUtf8(graphEditorToolRailPath)
  const responsiveElementClasses = readUtf8(responsiveElementClassesPath)
  const responsiveCss = readUtf8(responsiveCssPath)

  if (
    !responsiveElementClasses.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !responsiveCss.includes('.kg-default-glyph') ||
    !graphEditorToolRail.includes('UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME') ||
    !graphEditorToolRail.includes('graphEditorToolRailIconClassName') ||
    !graphEditorToolRail.includes('UI_RESPONSIVE_MENU_ROW_CLASSNAME') ||
    graphEditorToolRail.includes('className="h-4 w-4"') ||
    graphEditorToolRail.includes("className='h-4 w-4'") ||
    graphEditorToolRail.includes('className="w-4 h-4"') ||
    graphEditorToolRail.includes("className='w-4 h-4'")
  ) {
    throw new Error('Expected graph-editor rail tool icons to reuse the shared responsive default glyph owner')
  }
}

export const testWorkflowManagerNonWorkflowListsReuseGraphFieldsRightPane = () => {
  const root = process.cwd()
  const storyboardWidgetGraphTabPath = path.resolve(root, 'src', 'features', 'storyboard-widget-manager', 'StoryboardWidgetGraphTab.tsx')
  const graphFieldsViewPath = path.resolve(root, 'src', 'features', 'panels', 'views', 'GraphFieldsView.tsx')
  const graphTabText = readUtf8(storyboardWidgetGraphTabPath)
  const graphFieldsText = readUtf8(graphFieldsViewPath)
  if (!graphTabText.includes('aria-label="Graph Fields and Field Settings"')) {
    throw new Error('Expected non-workflow Workflow Manager surface to include embedded Graph Fields right pane')
  }
  if (!graphTabText.includes('const GRAPH_FIELDS_SHORTCUT_LABELS = [')) {
    throw new Error('Expected non-workflow Workflow Manager to define Graph Fields shortcut labels')
  }
  if (!graphTabText.includes("'Node'") || !graphTabText.includes("'Edges'") || !graphTabText.includes("'Clusters'") || !graphTabText.includes("'Renderer'") || !graphTabText.includes("'Layer Mode'")) {
    throw new Error('Expected non-workflow shortcut list to cover Node/Edges/Clusters/Renderer/Layer Mode')
  }
  if (!graphTabText.includes('entryShortcutLabels={GRAPH_FIELDS_SHORTCUT_LABELS}')) {
    throw new Error('Expected non-workflow Workflow Manager to pass shortcut labels into GraphFieldsView')
  }
  if (!graphFieldsText.includes('aria-label="Graph Fields entry shortcuts"')) {
    throw new Error('Expected GraphFieldsView to render shortcut buttons within Graph Fields surface')
  }
  if (!graphFieldsText.includes("key={`entry-shortcut:${label}:${index}`}")) {
    throw new Error('Expected GraphFieldsView shortcut buttons to use stable per-entry keys instead of label-only keys')
  }
  if (!graphFieldsText.includes('onClick={() => onEntryShortcutClick(label)}')) {
    throw new Error('Expected GraphFieldsView shortcut clicks to route through the shared right-pane open handler')
  }
}
