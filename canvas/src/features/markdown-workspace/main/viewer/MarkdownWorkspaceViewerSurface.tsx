import React from 'react'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { TranscriptFrameSourceContext, timestampLinkSeconds } from '@/lib/rich-media/videoTimestampLink'
import { selectSavedVideoFrame } from '@/lib/rich-media/savedVideoFrameSelection'
import MarkdownPreview from '@/features/markdown/ui/MarkdownPreview'
import {
  UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES,
  UI_VIEW_EDIT_SURFACE_VIEWER_CLASS_NAME,
} from '@/lib/ui/surfaceClasses'

type MarkdownPreviewProps = React.ComponentPropsWithoutRef<typeof MarkdownPreview>
type ViewerDataAttributes = Record<`data-${string}`, string | undefined>

export type MarkdownWorkspaceViewerSurfaceProps = Omit<
  MarkdownPreviewProps,
  | 'forbidCopy'
  | 'markdownPresentationMode'
  | 'previewOverlayPortalTarget'
  | 'previewOverlayScope'
  | 'previewScrollable'
  | 'showSidebar'
  | 'viewMode'
> & {
  ariaLabel?: string
  className?: string
  dataAttributes?: ViewerDataAttributes
}

export const MarkdownWorkspaceViewerSurface = React.forwardRef<
  HTMLElement,
  MarkdownWorkspaceViewerSurfaceProps
>(function MarkdownWorkspaceViewerSurface(
  {
    ariaLabel = 'Editor Workspace Viewer',
    className = '',
    dataAttributes,
    ...previewProps
  },
  ref,
) {
  const path = previewProps.activeDocumentPath
  const [owner, setOwner] = React.useState<{ path: string; source: string }>()
  React.useEffect(() => {
    if (!/(?:\.video-agent\.md|\/transcript\.md|\/video-sequence\.timeline\.md)$/i.test(path)) return
    let active = true
    const folder = path.slice(0, path.lastIndexOf('/') + 1)
    void getWorkspaceFs().then(fs => fs.readFileText(folder + 'source.json')).then(raw => {
      if (!active || !raw) return
      const manifest = JSON.parse(raw)
      if (typeof manifest.sourceUrl === 'string' && manifest.schemaVersion?.endsWith(':source-manifest'))
        setOwner({ path, source: manifest.sourceUrl })
    }).catch(() => {})
    return () => { active = false }
  }, [path])
  const source = owner?.path === path ? owner.source : ''
  return (
    <TranscriptFrameSourceContext.Provider value={source}>
      <section
        onClickCapture={event => {
          if (!source || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          const link = event.target instanceof Element && event.target.closest('a[href]')
          if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('data-saved-frame-cue')) return
          const seconds = timestampLinkSeconds(link.href, source)
          if (seconds === null) return
          event.preventDefault()
          event.stopPropagation()
          void selectSavedVideoFrame({ sourceUrl: source, seconds, documentPath: path })
        }}
        aria-label={ariaLabel}
        className={`${UI_VIEW_EDIT_SURFACE_VIEWER_CLASS_NAME} ${className}`.trim()}
        {...UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES}
        {...dataAttributes}
      >
        <MarkdownPreview
          ref={ref}
          {...previewProps}
          markdownPresentationMode={false}
          previewOverlayScope="container"
          previewOverlayPortalTarget={null}
          previewScrollable
          showSidebar={false}
          viewMode="viewer"
          forbidCopy={false}
        />
      </section>
    </TranscriptFrameSourceContext.Provider>
  )
})
