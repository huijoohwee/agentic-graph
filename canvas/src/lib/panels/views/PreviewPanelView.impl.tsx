import React from 'react'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { MainPanelIconButton } from '@/features/panels/ui/MainPanelIconButton'
import { useGraphStore } from '@/hooks/useGraphStore'
import { splitMermaidIntoDiagrams } from 'grph-shared/markdown/mermaidBlocks'
import {
  type MermaidInitConfig,
  useRootThemeMode,
} from '@/features/panels/views/preview-panel/ui/mermaidConfig'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_COPY } from '@/lib/config'
import RichMediaPanel from '@/components/RichMediaPanel'
import { buildStaticRichMediaPanelOverlayState, commitRichMediaPanelChange } from '@/lib/render/richMediaSsot'
import { PANEL_FRAME_EMBEDDED_SURFACE_STYLE } from '@/lib/ui/panelFrame'
import {
  type CommandMenuRichMediaItem,
  useCommandMenuRichMediaInventory,
} from '@/lib/command-menu/commandMenuRichMediaInventory'

const previewEmptyStateClassName = `w-full h-full flex items-center justify-center ${UI_THEME_TOKENS.text.tertiary}`
const previewActionButtonClassName = `px-2 py-1 rounded border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg} ${UI_THEME_TOKENS.text.primary} ${UI_THEME_TOKENS.button.hoverBg}`
const previewPanelHeaderClassName = `shrink-0 border-b ${UI_THEME_TOKENS.panel.divider} bg-[color:var(--kg-panel-bg)]/60`
export const PREVIEW_PANEL_MEDIA_FRAME_CLASS_NAME = `kg-preview-panel-media-frame rounded border ${UI_THEME_TOKENS.panel.border}`
const PREVIEW_PANEL_EMBED_FRAME_CLASS_NAME = `${PREVIEW_PANEL_MEDIA_FRAME_CLASS_NAME} bg-black/5`
const MermaidDiagramLazy = React.lazy(() =>
  import('@/lib/panels/views/preview-panel/ui/MermaidDiagram.impl').then(mod => ({ default: mod.MermaidDiagram })),
)

export default function PreviewPanelView() {
  const markdownText = useGraphStore(s => s.markdownDocumentText || '')
  const mermaidFocusCode = useGraphStore(s => s.markdownPreviewMermaidFocusCode || '')
  const mermaidFocusConfig = useGraphStore(s => s.markdownPreviewMermaidFocusConfig || null)
  const setMermaidFocus = useGraphStore(s => s.setMarkdownPreviewMermaidFocus)
  const activeMediaKey = useGraphStore(s => s.markdownPreviewActiveMediaKey || null)
  const setActiveMediaKey = useGraphStore(s => s.setMarkdownPreviewActiveMediaKey)
  const updateNode = useGraphStore(s => s.updateNode)
  const typography = usePanelTypography()
  const frontmatterModeEnabled = useGraphStore(s => s.frontmatterModeEnabled || false)
  const rootThemeMode = useRootThemeMode()
  const {
    items: mediaItems,
    mermaidFrontmatterConfig,
    frontmatterMermaidCode,
    frontmatterMermaidDiagrams,
  } = useCommandMenuRichMediaInventory()

  const hasMarkdown = !!(markdownText && markdownText.trim())
  const [overlayPortalTarget, setOverlayPortalTarget] = React.useState<HTMLElement | null>(null)
  const [loadedEmbedKey, setLoadedEmbedKey] = React.useState<string>('')
  const setOverlayPortalRef = React.useCallback((el: HTMLElement | null) => {
    setOverlayPortalTarget(prev => (prev === el ? prev : el))
  }, [])

  React.useEffect(() => {
    return () => {
      setMermaidFocus(null)
      setActiveMediaKey(null)
    }
  }, [setActiveMediaKey, setMermaidFocus])

  React.useEffect(() => {
    setLoadedEmbedKey(prev => (activeMediaKey ? (prev === activeMediaKey ? prev : '') : ''))
  }, [activeMediaKey])

  React.useEffect(() => {
    if (!frontmatterModeEnabled) return
    if (!frontmatterMermaidCode) return
    const current = String(mermaidFocusCode || '').trim()
    const next = String(frontmatterMermaidDiagrams[0] || '').trim()
    if (!next) return
    if (current === next) return
    setActiveMediaKey(null)
    setMermaidFocus({
      code: next,
      frontmatterConfig: mermaidFrontmatterConfig,
    })
  }, [
    frontmatterModeEnabled,
    frontmatterMermaidCode,
    frontmatterMermaidDiagrams,
    mermaidFocusCode,
    mermaidFrontmatterConfig,
    setActiveMediaKey,
    setMermaidFocus,
  ])

  const hasMermaidFocus = !!mermaidFocusCode

  const activeMediaFromKey = React.useMemo(
    () => (activeMediaKey ? mediaItems.find(m => m.key === activeMediaKey) || null : null),
    [activeMediaKey, mediaItems],
  )

  const activeMedia = hasMermaidFocus || frontmatterModeEnabled ? null : activeMediaFromKey || mediaItems[0] || null
  const previewPanelState = React.useMemo<CommandMenuRichMediaItem['panel'] | null>(() => {
    if (!activeMedia || activeMedia.kind === 'mermaid') return null
    if (activeMedia.panel) return activeMedia.panel
    return buildStaticRichMediaPanelOverlayState({ renderKind: activeMedia.kind })
  }, [activeMedia])

  const renderActiveMedia = () => {
    if (!activeMedia) {
      return (
        <section className={previewEmptyStateClassName}>
          Select a Mermaid diagram or rich media item.
        </section>
      )
    }

    if (!activeMedia.src && !activeMedia.srcDoc && activeMedia.kind !== 'mermaid') {
      return (
        <section className={previewEmptyStateClassName}>
          Selected media has no preview source.
        </section>
      )
    }

    const isRichMediaPanelKind = activeMedia.kind !== 'mermaid'

    if (isRichMediaPanelKind) {
      const richMediaKind = activeMedia.kind === 'image' || activeMedia.kind === 'video' || activeMedia.kind === 'audio' || activeMedia.kind === 'model'
        ? activeMedia.kind
        : 'iframe'
      const richMediaTitle = activeMedia.panelTitle || activeMedia.alt || activeMedia.label
      const richMediaOpenUrl = activeMedia.openUrl || activeMedia.src
      const richMediaNeedsExplicitLoad = richMediaKind === 'iframe' && !String(activeMedia.srcDoc || '').trim()
      const richMediaLoaded = !richMediaNeedsExplicitLoad || loadedEmbedKey === activeMedia.key
      const frameClass = richMediaKind === 'iframe' ? PREVIEW_PANEL_EMBED_FRAME_CLASS_NAME : PREVIEW_PANEL_MEDIA_FRAME_CLASS_NAME
      return (
        <section className="w-full h-full flex items-center justify-center">
          <section className={frameClass}>
            {richMediaLoaded ? (
              <RichMediaPanel
                title={richMediaTitle}
                url={activeMedia.src}
                srcDoc={activeMedia.srcDoc}
                openUrl={richMediaOpenUrl}
                kind={richMediaKind}
                interactive={richMediaKind !== 'image'}
                panel={previewPanelState || undefined}
                onPanelChange={next => {
                  if (!activeMedia?.nodeId || !activeMedia.panel) return
                  commitRichMediaPanelChange({
                    nodeId: activeMedia.nodeId,
                    next,
                    updateNode: (id, patch) => updateNode(id, patch as Partial<import('@/lib/graph/types').GraphNode>),
                  })
                }}
                style={PANEL_FRAME_EMBEDDED_SURFACE_STYLE}
              />
            ) : (
              <section className="w-full h-full flex items-center justify-center">
                <section className="flex items-center gap-2">
                  <MainPanelIconButton iconKey="action.run" label={UI_COPY.markdownMediaLoadEmbedLabel}
                    className={previewActionButtonClassName} onClick={() => setLoadedEmbedKey(activeMedia.key)} />
                  <a className="underline" href={richMediaOpenUrl} target="_blank" rel="noreferrer">
                    {UI_COPY.markdownMediaOpenInNewTabLabel}
                  </a>
                </section>
              </section>
            )}
          </section>
        </section>
      )
    }

    return null
  }

  return (
    <section className="h-full min-h-0 min-w-0" aria-label="Selected media preview">
      <section ref={setOverlayPortalRef} className="h-full min-h-0 flex flex-col overflow-hidden relative">
        {!hasMarkdown && mediaItems.length === 0 ? (
          <section className={['px-2 py-2', UI_THEME_TOKENS.text.secondary, typography.panelTextClass].join(' ')}>
            No markdown loaded.
          </section>
        ) : (
          <section className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <header className={previewPanelHeaderClassName}>
              <section className="px-2 py-1 flex items-center justify-between">
                <section className={['font-medium', UI_THEME_TOKENS.text.primary, typography.panelTextClass].join(' ')}>
                  Selected media
                </section>
                <section className={`${typography.microLabelClass} ${UI_THEME_TOKENS.text.tertiary}`}>
                  Select from Media below
                </section>
              </section>
            </header>
            <section className={`flex-1 min-h-0 ${UI_THEME_TOKENS.panel.bg}`}>
              {hasMermaidFocus ? (
                <section className="w-full h-full flex items-center justify-center">
                  <section className={PREVIEW_PANEL_MEDIA_FRAME_CLASS_NAME}>
                    <section className="w-full h-full overflow-auto">
                      {splitMermaidIntoDiagrams(mermaidFocusCode).map((code, i) => (
                        <React.Suspense key={i} fallback={null}>
                          <MermaidDiagramLazy
                            code={code}
                            highlightClass=""
                            frontmatterConfig={
                              (mermaidFocusConfig as MermaidInitConfig | null) || mermaidFrontmatterConfig
                            }
                            rootThemeMode={rootThemeMode}
                            overlayScope="container"
                            overlayPortalTarget={overlayPortalTarget}
                          />
                        </React.Suspense>
                      ))}
                    </section>
                  </section>
                </section>
              ) : (
                renderActiveMedia()
              )}
            </section>
          </section>
        )}
      </section>
    </section>
  )
}
