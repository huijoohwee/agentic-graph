import React from 'react'
import { resetGlobalUserSelectLock } from '@/lib/canvas/interaction-user-select'
import { readBrowserLocationHash, subscribeHashChange } from '@/lib/browser/hashChangeEvents'
import { useDocumentInsights } from '@/features/markdown-workspace/documentInsightsRuntime'
import { useTextSelectionMatchHighlights } from '@/lib/ui/textSelectionMatchHighlights'
import { buildSemanticTextHighlightOverlayStyle, getSemanticHighlightSurfaceAttributes, getSemanticHighlightSurfaceClassName, SEMANTIC_HIGHLIGHT_SURFACES } from '@/lib/ui/semanticHighlight'

type Props = React.HTMLAttributes<HTMLElement> & {
  rootRef: (el: HTMLElement | null) => void
  activeDocumentPath: string
  markdownTextHighlight: boolean
  forbidCopy?: boolean
  markdownCardPreviewMode?: boolean
}

/** One scroll owner for source navigation, native selection and keyword overlays. */
export function MarkdownPreviewScrollSurface({ rootRef, activeDocumentPath, markdownTextHighlight, markdownCardPreviewMode, forbidCopy, children, ...attributes }: Props) {
  const blockCopy = React.useCallback((event: React.ClipboardEvent<HTMLElement>) => {
    if (!forbidCopy) return
    event.preventDefault()
  }, [forbidCopy])
  const blockCopyKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (!forbidCopy) return
    const key = String(event.key || '').toLowerCase()
    const mod = event.metaKey || event.ctrlKey
    if (!mod) return
    if (key !== 'c' && key !== 'x') return
    event.preventDefault()
  }, [forbidCopy])
  const resetUserSelectLockIfNeeded = React.useCallback(() => {
    try {
      resetGlobalUserSelectLock()
    } catch {
      void 0
    }
  }, [])

  const scrollRootRef = React.useRef<HTMLElement | null>(null)
  const handleScrollRootRef = React.useCallback(
    (el: HTMLElement | null) => {
      scrollRootRef.current = el
      rootRef(el)
    },
    [rootRef],
  )
  const insights = useDocumentInsights()
  const selectionMatchRects = useTextSelectionMatchHighlights({
    rootRef: scrollRootRef,
    resetKey: activeDocumentPath,
    phrase: markdownTextHighlight && insights.source?.key === activeDocumentPath ? insights.keyword : null,
    enabled: !markdownCardPreviewMode,
  })

  React.useEffect(() => {
    const tryScrollToHash = () => {
      const hash = readBrowserLocationHash()
      if (!hash || !hash.startsWith('#')) return
      const id = (() => {
        const raw = hash.slice(1)
        try {
          return decodeURIComponent(raw)
        } catch {
          return raw
        }
      })()
      if (!id) return
      const el = document.getElementById(id)
      const root = scrollRootRef.current
      if (!el || !root) return
      if (!root.contains(el)) return
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } catch {
        try {
          el.scrollIntoView()
        } catch {
          void 0
        }
      }
    }

    tryScrollToHash()

    return subscribeHashChange(() => {
      tryScrollToHash()
    })
  }, [activeDocumentPath])

  React.useEffect(() => {
    const root = scrollRootRef.current
    if (!root) return
    const hash = readBrowserLocationHash()
    if (hash && hash.startsWith('#')) return
    try {
      root.scrollTop = 0
    } catch {
      void 0
    }
  }, [activeDocumentPath])

  return <section {...attributes} ref={handleScrollRootRef}
    onPointerDownCapture={resetUserSelectLockIfNeeded}
    onMouseDownCapture={resetUserSelectLockIfNeeded}
    onMouseUpCapture={resetUserSelectLockIfNeeded}
    onDoubleClickCapture={resetUserSelectLockIfNeeded}
    onCopy={blockCopy} onCut={blockCopy} onKeyDown={blockCopyKeyDown}
  >
      <section
        aria-hidden="true"
        className="pointer-events-none select-none absolute left-0 top-0 z-10"
        data-kg-selection-match-overlay="true"
        {...getSemanticHighlightSurfaceAttributes(SEMANTIC_HIGHLIGHT_SURFACES.selectionMatch)}
      >
        {selectionMatchRects.map(rect => (
          <span
            key={rect.id}
            className={`absolute select-none ${getSemanticHighlightSurfaceClassName(SEMANTIC_HIGHLIGHT_SURFACES.selectionMatch)}`}
            data-kg-selection-match-highlight="true"
            {...getSemanticHighlightSurfaceAttributes(SEMANTIC_HIGHLIGHT_SURFACES.selectionMatch)}
            style={buildSemanticTextHighlightOverlayStyle(rect)}
          />
        ))}
      </section>
    {children}
  </section>
}
