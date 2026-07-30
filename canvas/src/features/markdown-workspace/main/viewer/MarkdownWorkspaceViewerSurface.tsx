import React from 'react'
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
  return (
    <section
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
  )
})
