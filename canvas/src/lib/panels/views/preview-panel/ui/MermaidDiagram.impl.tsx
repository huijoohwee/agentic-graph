import React from 'react'
import { startPointerDrag } from 'grph-shared/dom/pointerDrag'
import { normalizeMermaidCodeForRuntime } from 'grph-shared/markdown/mermaidInput'
import type { MermaidInitConfig } from '@/features/panels/views/preview-panel/ui/mermaidConfig'
import { LS_KEYS } from '@/lib/config'
import PreviewOverlay from '@/features/panels/views/preview-panel/ui/PreviewOverlay'
import ZoomPanViewport from '@/features/panels/views/preview-panel/ui/ZoomPanViewport'
import { emitMainPanelOpen } from '@/features/panels/utils/useMainPanelRect'
import { useGraphStore } from '@/hooks/useGraphStore'
import { emitHashChange } from '@/lib/browser/hashChangeEvents'
import { renderMermaidWithRuntime } from '@/lib/mermaid/mermaidRuntime'
import { postprocessMermaidSvg } from '@/lib/mermaid/mermaidSvg'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
const MERMAID_TOAST_DEDUPE_MS = 1500

const buildMermaidConfig = (opts: {
  rootThemeMode: 'light' | 'dark'
  frontmatterConfig: MermaidInitConfig | null
}): MermaidInitConfig => {
  const themeFromUi = opts.rootThemeMode === 'dark' ? 'dark' : 'default'
  const fmRaw = opts.frontmatterConfig || {}
  const fm = { ...fmRaw } as Record<string, unknown>
  if ('securityLevel' in fm) delete fm.securityLevel
  const themeVariables =
    fm && typeof fm.themeVariables === 'object' && fm.themeVariables != null && !Array.isArray(fm.themeVariables)
      ? (fm.themeVariables as Record<string, unknown>)
      : null
  const requestedTheme = typeof fm.theme === 'string' ? (fm.theme as string) : ''
  const theme = themeVariables ? 'base' : (requestedTheme || themeFromUi)
  return {
    securityLevel: 'loose',
    theme,
    ...(Object.keys(fm).length ? fm : {}),
    ...(themeVariables ? { themeVariables: { darkMode: opts.rootThemeMode === 'dark', ...themeVariables } } : {}),
  }
}
export function MermaidDiagram({
  code,
  highlightClass,
  frontmatterConfig,
  rootThemeMode,
  overlayScope = 'viewport',
  overlayPortalTarget,
  variant = 'default',
  enablePanZoom = false,
  wheelZoomRequiresModifier,
  wheelZoomBehavior,
}: {
  code: string
  highlightClass: string
  frontmatterConfig: MermaidInitConfig | null
  rootThemeMode: 'light' | 'dark'
  overlayScope?: 'viewport' | 'container'
  overlayPortalTarget?: HTMLElement | null
  variant?: 'default' | 'codeblock'
  enablePanZoom?: boolean
  wheelZoomRequiresModifier?: boolean
  wheelZoomBehavior?: 'modifier' | 'always' | 'active'
}) {
  const figureRef = React.useRef<HTMLElement | null>(null)
  const containerRef = React.useRef<HTMLElement | null>(null)
  const codeblockSvgRef = React.useRef<SVGSVGElement | null>(null)
  const codeblockViewBoxRef = React.useRef<{ x: number; y: number; w: number; h: number; baseW: number; baseH: number } | null>(null)
  const codeblockPointerRef = React.useRef<{ active: boolean; startX: number; startY: number; baseX: number; baseY: number } | null>(null)
  const codeblockWheelActiveRef = React.useRef(false)
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, '_')
  const [error, setError] = React.useState<string | null>(null)
  const [svg, setSvg] = React.useState('')
  const [svgTightSize, setSvgTightSize] = React.useState<{ w: number; h: number } | null>(null)
  const [codeblockFrameWidthPx, setCodeblockFrameWidthPx] = React.useState<number>(0)
  const [isFullscreenOpen, setIsFullscreenOpen] = React.useState(false)
  const setMermaidFocus = useGraphStore(s => s.setMarkdownPreviewMermaidFocus)
  const upsertUiToast = useGraphStore(s => s.upsertUiToast)
  const dragRef = React.useRef<{ x: number; y: number } | null>(null)
  const didDragRef = React.useRef(false)
  const lastErrorToastKeyRef = React.useRef<string>('')

  const config = React.useMemo(
    () => buildMermaidConfig({ rootThemeMode, frontmatterConfig }),
    [frontmatterConfig, rootThemeMode],
  )

  React.useEffect(() => {
    if (variant !== 'codeblock') return
    const el = figureRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      try {
        const rect = el.getBoundingClientRect()
        const w = Number.isFinite(rect.width) ? rect.width : 0
        setCodeblockFrameWidthPx(prev => (Math.abs(prev - w) < 1 ? prev : w))
      } catch {
        void 0
      }
    })
    try {
      ro.observe(el)
    } catch {
      void 0
    }
    return () => {
      try {
        ro.disconnect()
      } catch {
        void 0
      }
    }
  }, [variant])

  const codeblockFrameHeightPx = React.useMemo(() => {
    if (variant !== 'codeblock') return null
    const content = svgTightSize
    const w = Number.isFinite(codeblockFrameWidthPx) ? codeblockFrameWidthPx : 0
    const maxH = 480
    const minH = 160
    if (!content || content.w <= 0 || content.h <= 0 || w <= 0) return maxH
    const ideal = Math.round((content.h / content.w) * w)
    return Math.max(minH, Math.min(maxH, ideal))
  }, [codeblockFrameWidthPx, svgTightSize, variant])

  const applyCodeblockViewBox = React.useCallback((vb: { x: number; y: number; w: number; h: number }) => {
    const svgEl = codeblockSvgRef.current
    if (!svgEl) return
    svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
    const prev = codeblockViewBoxRef.current
    if (!prev) return
    codeblockViewBoxRef.current = { ...prev, x: vb.x, y: vb.y, w: vb.w, h: vb.h }
  }, [])

  const getCodeblockRect = React.useCallback(() => {
    const svgEl = codeblockSvgRef.current
    if (!svgEl) return null
    const rect = svgEl.getBoundingClientRect()
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) return null
    return rect
  }, [])

  const handleCodeblockWheel = React.useCallback(
    (event: React.WheelEvent) => {
      if (!(enablePanZoom && variant === 'codeblock')) return
      const vb = codeblockViewBoxRef.current
      if (!vb) return

      const isModifierZoom = event.altKey
      const behavior = wheelZoomBehavior || (wheelZoomRequiresModifier ? 'modifier' : 'always')
      const allowZoom =
        behavior === 'always'
          ? true
          : behavior === 'modifier'
          ? isModifierZoom
          : codeblockWheelActiveRef.current || isModifierZoom
      if (!allowZoom) return

      event.preventDefault()
      try {
        event.stopPropagation()
      } catch {
        void 0
      }

      const rect = getCodeblockRect()
      if (!rect) return
      const sx = (event.clientX - rect.left) / rect.width
      const sy = (event.clientY - rect.top) / rect.height
      const focusX = vb.x + sx * vb.w
      const focusY = vb.y + sy * vb.h

      const wheelSpeed = 0.002
      const rawFactor = Math.exp(-event.deltaY * wheelSpeed)
      const nextZoom = Math.max(0.25, Math.min(8, vb.baseW / (vb.w / rawFactor)))
      const nextW = vb.baseW / nextZoom
      const nextH = vb.baseH / nextZoom
      const nextX = focusX - sx * nextW
      const nextY = focusY - sy * nextH
      applyCodeblockViewBox({ x: nextX, y: nextY, w: nextW, h: nextH })
    },
    [applyCodeblockViewBox, enablePanZoom, getCodeblockRect, variant, wheelZoomBehavior, wheelZoomRequiresModifier],
  )

  const handleCodeblockPointerDown = React.useCallback(
    (event: React.PointerEvent) => {
      if (!(enablePanZoom && variant === 'codeblock')) return
      if (event.button !== 0) return
      const vb = codeblockViewBoxRef.current
      if (!vb) return
      codeblockWheelActiveRef.current = true
      codeblockPointerRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        baseX: vb.x,
        baseY: vb.y,
      }

      startPointerDrag({
        ev: event.nativeEvent,
        cursor: 'grabbing',
        shouldStart: down => {
          if (!(enablePanZoom && variant === 'codeblock')) return false
          if (down.pointerType === 'mouse' && down.button !== 0) return false
          return true
        },
        onMove: mv => {
          if (!(enablePanZoom && variant === 'codeblock')) return
          const st = codeblockPointerRef.current
          const vbNow = codeblockViewBoxRef.current
          if (!st || !st.active || !vbNow) return
          const rect = getCodeblockRect()
          if (!rect) return
          const dx = mv.clientX - st.startX
          const dy = mv.clientY - st.startY
          if (Math.abs(dx) + Math.abs(dy) >= 3) didDragRef.current = true
          const unitsPerPxX = vbNow.w / rect.width
          const unitsPerPxY = vbNow.h / rect.height
          const nextX = st.baseX - dx * unitsPerPxX
          const nextY = st.baseY - dy * unitsPerPxY
          applyCodeblockViewBox({ x: nextX, y: nextY, w: vbNow.w, h: vbNow.h })
        },
        onEnd: () => {
          codeblockPointerRef.current = null
          codeblockWheelActiveRef.current = false
        },
        onCancel: () => {
          codeblockPointerRef.current = null
          codeblockWheelActiveRef.current = false
        },
      })
    },
    [applyCodeblockViewBox, enablePanZoom, getCodeblockRect, variant],
  )

  React.useEffect(() => {
    if (!error) return
    const message = String(error || '').trim()
    if (!message) return
    const key = message
    if (lastErrorToastKeyRef.current === key) return
    const now = Date.now()
    // Reuse the bounded visible-toast owner; dismissed errors retain no second cache.
    if (useGraphStore.getState().uiToasts.some(toast =>
      toast.id.startsWith('mermaid-render-error-') && toast.message === `Mermaid render failed: ${message}`
      && now >= toast.createdAtMs && now - toast.createdAtMs < MERMAID_TOAST_DEDUPE_MS)) return
    lastErrorToastKeyRef.current = key
    upsertUiToast({
      id: `mermaid-render-error-${id}`,
      kind: 'warning',
      message: `Mermaid render failed: ${message}`,
      ttlMs: 6000,
    })
  }, [error, id, upsertUiToast])

  React.useEffect(() => {
    let cancelled = false
    const host = containerRef.current
    if (!host) return
    host.innerHTML = ''
    setError(null)
    setSvg('')
    setSvgTightSize(null)
    codeblockSvgRef.current = null
    codeblockViewBoxRef.current = null
    const captureClick = (event: MouseEvent) => {
      try {
        const target = event.target as Element | null
        const anchor = target ? target.closest('a') : null
        if (!anchor) return
        const href = String(anchor.getAttribute('href') || anchor.getAttribute('xlink:href') || '').trim()
        if (!href) return
        if (href.startsWith('#') && typeof window !== 'undefined') {
          const rawId = href.slice(1)
          const id = (() => {
            try {
              return decodeURIComponent(rawId)
            } catch {
              return rawId
            }
          })()
          const nextHash = `#${encodeURIComponent(id)}`
          const shouldDispatchHashChange = String(window.location.hash || '') === nextHash
          event.preventDefault()
          event.stopPropagation()
          ;(event as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
          try {
            window.location.hash = nextHash
          } catch {
            void 0
          }
          if (shouldDispatchHashChange) {
            emitHashChange()
          }
          return
        }
        event.preventDefault()
        event.stopPropagation()
        ;(event as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      } catch {
        void 0
      }
    }
    host.addEventListener('click', captureClick, true)
    void (async () => {
      const renderId = `m_${id}`
      try {
        const trimmedCode = String(code || '').trim()
        if (!trimmedCode) {
          setError('Mermaid diagram code is empty')
          return
        }
        if (/^<\s*(svg|div|span)\b/i.test(trimmedCode)) {
          setError('Mermaid diagram code is not a Mermaid definition')
          return
        }
        const normalizedCode = normalizeMermaidCodeForRuntime(trimmedCode)
        const out = await renderMermaidWithRuntime({
          renderId,
          code: normalizedCode,
          config,
        })
        if (cancelled) return
        const processed = postprocessMermaidSvg(out.svg)
        const nextSvg = processed.svg
        const renderError = processed.error
        if (renderError) {
          setError(renderError)
          return
        }
        host.innerHTML = nextSvg
        setSvg(nextSvg)
        lastErrorToastKeyRef.current = ''
        try {
          const svgEl = host.querySelector('svg') as SVGSVGElement | null
          if (svgEl) {
            const parseSvgBounds = (rawSvg: string): { x: number; y: number; w: number; h: number } | null => {
              if (typeof window === 'undefined') return null
              try {
                const doc = new window.DOMParser().parseFromString(String(rawSvg || ''), 'image/svg+xml')
                const root = doc.querySelector('svg')
                if (!root) return null
                const viewBox = String(root.getAttribute('viewBox') || '').trim()
                if (viewBox) {
                  const parts = viewBox.split(/[\s,]+/g).map(value => Number.parseFloat(value))
                  if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
                    return { x: parts[0]!, y: parts[1]!, w: parts[2]!, h: parts[3]! }
                  }
                }
                const parseDim = (value: string | null): number => {
                  if (!value) return NaN
                  const trimmed = String(value).trim()
                  if (!trimmed || trimmed.includes('%')) return NaN
                  const numeric = Number.parseFloat(trimmed)
                  return Number.isFinite(numeric) ? numeric : NaN
                }
                const width = parseDim(root.getAttribute('width'))
                const height = parseDim(root.getAttribute('height'))
                if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
                  return { x: 0, y: 0, w: width, h: height }
                }
                return null
              } catch {
                return null
              }
            }
            codeblockSvgRef.current = svgEl
            try {
              svgEl.style.maxWidth = 'none'
              svgEl.style.maxHeight = 'none'
              ;(svgEl.style as unknown as { shapeRendering?: string }).shapeRendering = 'geometricPrecision'
              ;(svgEl.style as unknown as { textRendering?: string }).textRendering = 'geometricPrecision'
              svgEl.style.width = '100%'
              svgEl.style.height = '100%'
              svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet')
            } catch {
              void 0
            }
            const rawBounds = parseSvgBounds(nextSvg)
            if (rawBounds) {
              const pad = Math.max(24, Math.round(Math.max(rawBounds.w, rawBounds.h) * 0.08))
              let vw = rawBounds.w + pad * 2
              let vh = rawBounds.h + pad * 2
              const minW = 360
              const minH = 240
              if (vw < minW) vw = minW
              if (vh < minH) vh = minH
              const vx = rawBounds.x - (vw - rawBounds.w) / 2
              const vy = rawBounds.y - (vh - rawBounds.h) / 2
              svgEl.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`)
              codeblockViewBoxRef.current = { x: vx, y: vy, w: vw, h: vh, baseW: vw, baseH: vh }
              setSvgTightSize({ w: vw, h: vh })
            }
          }
        } catch {
          void 0
        }
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg || 'Mermaid render failed')
      }
    })()
    return () => {
      cancelled = true
      try {
        host.removeEventListener('click', captureClick, true)
      } catch {
        void 0
      }
    }
  }, [code, config, id])

  const getSvgSize = React.useCallback((raw: string): { w: number; h: number } => {
    if (svgTightSize) return svgTightSize
    try {
      const doc = new window.DOMParser().parseFromString(String(raw || ''), 'image/svg+xml')
      const el = doc.querySelector('svg')
      if (!el) return { w: 800, h: 600 }
      const vb = el.getAttribute('viewBox')
      if (vb) {
        const parts = vb.trim().split(/[\s,]+/g).map(x => Number.parseFloat(x))
        const w = parts.length === 4 ? parts[2] : NaN
        const h = parts.length === 4 ? parts[3] : NaN
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { w, h }
      }
      const parseDim = (v: string | null): number => {
        if (!v) return NaN
        const n = Number.parseFloat(v)
        return Number.isFinite(n) ? n : NaN
      }
      const w = parseDim(el.getAttribute('width'))
      const h = parseDim(el.getAttribute('height'))
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { w, h }
      return { w: 800, h: 600 }
    } catch {
      return { w: 800, h: 600 }
    }
  }, [svgTightSize])

  if (error) return null

  const handleClick = (event: React.MouseEvent) => {
    try {
      const target = event.target as Element | null
      if (target) {
        const anchor = target.closest('a')
        const href = anchor?.getAttribute('href') || anchor?.getAttribute('xlink:href') || ''
        if (href.trim().startsWith('#')) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
      }
    } catch {
      void 0
    }
  }

  const handleDoubleClick = (event: React.MouseEvent) => {
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }
    try {
      const target = event.target as Element | null
      if (target) {
        const anchor = target.closest('a')
        const href = anchor?.getAttribute('href') || anchor?.getAttribute('xlink:href') || ''
        if (href.trim().startsWith('#')) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
      }
    } catch {
      void 0
    }
    if (overlayScope === 'container') {
      if (!svg) return
      setIsFullscreenOpen(true)
      return
    }
    try {
      setMermaidFocus({
        code: String(code || ''),
        frontmatterConfig: frontmatterConfig,
      })
    } catch {
      void 0
    }
    try {
      emitMainPanelOpen({ tab: 'preview' as const })
    } catch {
      void 0
    }
  }

  const handlePointerDown = (event: React.PointerEvent) => {
    dragRef.current = { x: event.clientX, y: event.clientY }
    didDragRef.current = false
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    const st = dragRef.current
    if (!st) return
    const dx = event.clientX - st.x
    const dy = event.clientY - st.y
    if (Math.abs(dx) + Math.abs(dy) >= 4) didDragRef.current = true
  }

  const handlePointerUp = () => {
    dragRef.current = null
  }

  return (
    <>
      <figure
        ref={figureRef}
        className={[
          variant === 'codeblock'
            ? 'm-0 p-0 rounded-none border-0 bg-transparent overflow-y-auto overflow-x-hidden w-full shrink-0'
            : `mt-3 mb-3 p-3 rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} overflow-auto`,
          highlightClass,
        ].filter(Boolean).join(' ')}
        style={
          variant === 'codeblock'
            ? ({ height: `${Math.max(120, Math.floor(codeblockFrameHeightPx ?? 480))}px` } as React.CSSProperties)
            : undefined
        }
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="figure"
        aria-label="Mermaid diagram"
      >
        <section
          ref={containerRef}
          className="mermaid-container w-full h-full flex items-center justify-center"
          style={enablePanZoom && variant === 'codeblock' ? ({ touchAction: 'none' } as React.CSSProperties) : undefined}
          onWheel={enablePanZoom && variant === 'codeblock' ? handleCodeblockWheel : undefined}
          onPointerDown={enablePanZoom && variant === 'codeblock' ? handleCodeblockPointerDown : undefined}
          onPointerLeave={enablePanZoom && variant === 'codeblock' ? (() => { codeblockWheelActiveRef.current = false }) : undefined}
        />
        <figcaption className="sr-only">Mermaid diagram visualization</figcaption>
      </figure>
      {overlayScope === 'container' && (
        <PreviewOverlay
          open={isFullscreenOpen && !!svg}
          onClose={() => setIsFullscreenOpen(false)}
          scope={overlayScope}
          portalTarget={overlayPortalTarget}
        >
          <ZoomPanViewport
            open={isFullscreenOpen && !!svg}
            storageKey={LS_KEYS.previewZoomPanMermaid}
            getContentSize={() => getSvgSize(svg)}
            fitOnOpen
          >
            <section
              onClick={event => {
                try {
                  const target = event.target as Element | null
                  const anchor = target ? target.closest('a') : null
                  const href = String(anchor?.getAttribute('href') || anchor?.getAttribute('xlink:href') || '').trim()
                  if (!href || !href.startsWith('#') || typeof window === 'undefined') return
                  const rawId = href.slice(1)
                  const id = (() => {
                    try {
                      return decodeURIComponent(rawId)
                    } catch {
                      return rawId
                    }
                  })()
                  const nextHash = `#${encodeURIComponent(id)}`
                  const shouldDispatchHashChange = String(window.location.hash || '') === nextHash
                  event.preventDefault()
                  event.stopPropagation()
                  setIsFullscreenOpen(false)
                  try {
                    window.location.hash = nextHash
                  } catch {
                    void 0
                  }
                  if (shouldDispatchHashChange) {
                    emitHashChange()
                  }
                } catch {
                  void 0
                }
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </ZoomPanViewport>
        </PreviewOverlay>
      )}
    </>
  )
}
