import React from 'react'
import { useSvgSurfaceZoomRuntime, type SvgSurfaceFitMode } from '@/components/GraphCanvas/hooks/useSvgSurfaceZoomRuntime'
import { postprocessMermaidSvg, renderPlainMermaidSvgCached } from '@/lib/mermaid/mermaidSvg'
import { normalizeMermaidCodeForRuntime } from 'grph-shared/markdown/mermaidInput'
import { applyPlainMermaidDiagramSelection } from '@/features/markdown/ui/PlainMermaidDiagram'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { Canvas2dRendererId } from '@/lib/config.render'

export type InteractiveMermaidSelectionRow = {
  key: string
  labels: readonly string[]
  kind?: string
  lineNumber?: number
}

type InteractiveMermaidRowAnnotation = {
  key: string
  label: string
  kind?: string
  lineNumber?: number
}

const INTERACTIVE_MERMAID_SELECTABLE_SELECTOR = 'circle,rect,path,text,tspan,g'
const INTERACTIVE_MERMAID_GROUP_TEXT_LABEL_MAX_CHARS = 160
const INTERACTIVE_MERMAID_GROUP_TEXT_LABEL_MAX_SELECTABLE = 18
const INTERACTIVE_MERMAID_ANNOTATION_SCOPE_MAX_SELECTABLE = 28

const normalizeInteractiveMermaidLabel = (value: string | null | undefined): string => {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const labelsMatch = (text: string | null | undefined, labels: readonly string[]): boolean => {
  const normalizedText = normalizeInteractiveMermaidLabel(text)
  if (!normalizedText) return false
  return labels.some(label => {
    const normalizedLabel = normalizeInteractiveMermaidLabel(label)
    if (!normalizedLabel) return false
    return normalizedText === normalizedLabel || normalizedText.includes(normalizedLabel) || normalizedLabel.includes(normalizedText)
  })
}

const pushUniqueInteractiveMermaidLabel = (out: string[], seen: Set<string>, value: unknown): void => {
  const label = String(value || '').replace(/\s+/g, ' ').trim()
  const normalized = normalizeInteractiveMermaidLabel(label)
  if (!label || !normalized || seen.has(normalized)) return
  seen.add(normalized)
  out.push(label)
}

const readElementClassTokens = (element: Element): string[] => {
  const className = element.getAttribute('class') || ''
  return className.split(/\s+/g).map(token => token.trim()).filter(Boolean)
}

const readElementIdTokens = (id: string | null | undefined): string[] => {
  const raw = String(id || '').trim()
  if (!raw) return []
  const out = [raw]
  const withoutTextSuffix = raw.replace(/-text$/i, '')
  if (withoutTextSuffix !== raw) out.push(withoutTextSuffix)
  const mermaidSuffix = withoutTextSuffix.replace(/^kg-mermaid-[^-]+-/i, '')
  if (mermaidSuffix && mermaidSuffix !== withoutTextSuffix) out.push(mermaidSuffix)
  return out
}

const readElementLabelCandidates = (element: Element | null | undefined): string[] => {
  if (!element) return []
  const out: string[] = []
  const seen = new Set<string>()
  pushUniqueInteractiveMermaidLabel(out, seen, element.getAttribute('data-kg-mermaid-row-key'))
  pushUniqueInteractiveMermaidLabel(out, seen, element.getAttribute('data-kg-mermaid-row-label'))
  pushUniqueInteractiveMermaidLabel(out, seen, element.getAttribute('aria-label'))
  pushUniqueInteractiveMermaidLabel(out, seen, element.getAttribute('data-id'))
  for (const token of readElementIdTokens(element.getAttribute('id'))) {
    pushUniqueInteractiveMermaidLabel(out, seen, token)
  }
  for (const token of readElementClassTokens(element)) {
    pushUniqueInteractiveMermaidLabel(out, seen, token)
  }
  const tagName = element.tagName.toLowerCase()
  const shouldReadText =
    tagName === 'text' ||
    tagName === 'tspan' ||
    tagName === 'title' ||
    tagName === 'desc' ||
    (tagName === 'g' &&
      (element.textContent || '').replace(/\s+/g, ' ').trim().length <= INTERACTIVE_MERMAID_GROUP_TEXT_LABEL_MAX_CHARS &&
      element.querySelectorAll(INTERACTIVE_MERMAID_SELECTABLE_SELECTOR).length <= INTERACTIVE_MERMAID_GROUP_TEXT_LABEL_MAX_SELECTABLE)
  if (shouldReadText) {
    pushUniqueInteractiveMermaidLabel(out, seen, element.textContent)
  }
  return out
}

const deriveInteractiveMermaidClassAliases = (element: Element): string[] => {
  const out: string[] = []
  const push = (value: string) => {
    if (!value || out.includes(value)) return
    out.push(value)
  }
  for (const token of readElementClassTokens(element)) {
    const branchLabel = token.match(/^branch-label(\d+)$/i)
    if (branchLabel) {
      push(`branch:${branchLabel[1]}`)
      push(`label:${branchLabel[1]}`)
      push(`arrow:${branchLabel[1]}`)
      continue
    }
    const branchLabelBkg = token.match(/^label(\d+)$/i)
    if (branchLabelBkg) {
      push(`label:${branchLabelBkg[1]}`)
      continue
    }
    const branchArrow = token.match(/^arrow(\d+)$/i)
    if (branchArrow) {
      push(`arrow:${branchArrow[1]}`)
      push(`branch:${branchArrow[1]}`)
      continue
    }
    const sectionTitle = token.match(/^sectionTitle(\d+)$/i)
    if (sectionTitle) {
      push(`section:${sectionTitle[1]}`)
      continue
    }
    const sectionBand = token.match(/^section(\d+)$/i)
    if (sectionBand) {
      push(`section:${sectionBand[1]}`)
      continue
    }
    const taskText = token.match(/^taskText(?:Outside(?:Right|Left)?|Inside)?(\d+)$/i)
    if (taskText) {
      push(`task:${taskText[1]}`)
      continue
    }
    const taskShape = token.match(/^(?:task|crit|active|done|milestone)(\d+)$/i)
    if (taskShape) push(`task:${taskShape[1]}`)
  }
  return out
}

const readElementRowKey = (element: Element | null | undefined): string => {
  let current: Element | null | undefined = element
  while (current) {
    const key = String(current.getAttribute('data-kg-mermaid-row-key') || '').trim()
    if (key) return key
    current = current.parentElement
  }
  return ''
}

const readElementLabel = (element: Element | null | undefined): string => {
  if (!element) return ''
  const rowKey = readElementRowKey(element)
  if (rowKey) return rowKey
  return readElementLabelCandidates(element)[0] || ''
}

const findSelectionElement = (svgEl: SVGSVGElement, labels: readonly string[]): Element | null => {
  const content = svgEl.querySelector('[data-kg-svg-zoom-content="1"]') || svgEl
  const candidates = Array.from(content.querySelectorAll('text,tspan,title,desc,[aria-label],[data-id],[id],rect,path,circle,g'))
  for (const element of candidates) {
    if (element.closest('[data-kg-svg-viewport-hitbox="1"]')) continue
    if (readElementLabelCandidates(element).some(label => labelsMatch(label, labels))) return element
  }
  return null
}

const readRowPrimaryLabel = (row: InteractiveMermaidSelectionRow): string => {
  return row.labels.find(label => String(label || '').trim()) || row.key
}

const readInteractiveMermaidRowAnnotation = (element: Element): InteractiveMermaidRowAnnotation | null => {
  const key = String(element.getAttribute('data-kg-mermaid-row-key') || '').trim()
  if (!key) return null
  const rawLineNumber = Number(element.getAttribute('data-kg-mermaid-row-line'))
  return {
    key,
    label: String(element.getAttribute('data-kg-mermaid-row-label') || key).trim() || key,
    kind: String(element.getAttribute('data-kg-mermaid-row-kind') || '').trim() || undefined,
    lineNumber: Number.isFinite(rawLineNumber) ? rawLineNumber : undefined,
  }
}

const writeInteractiveMermaidRowAnnotation = (
  element: Element,
  annotation: InteractiveMermaidRowAnnotation,
): void => {
  element.setAttribute('data-kg-mermaid-row-key', annotation.key)
  element.setAttribute('data-kg-mermaid-row-label', annotation.label)
  if (annotation.kind) element.setAttribute('data-kg-mermaid-row-kind', annotation.kind)
  if (typeof annotation.lineNumber === 'number') element.setAttribute('data-kg-mermaid-row-line', String(annotation.lineNumber))
  element.setAttribute('data-kg-mermaid-row-target', '1')
  element.setAttribute('aria-label', annotation.label)
  element.setAttribute('style', `${element.getAttribute('style') || ''};cursor:pointer;`.replace(/^;/, ''))
}

const writeCompatibleInteractiveMermaidRowAnnotation = (
  element: Element,
  annotation: InteractiveMermaidRowAnnotation,
): void => {
  const existing = readInteractiveMermaidRowAnnotation(element)
  if (existing && existing.key !== annotation.key) return
  writeInteractiveMermaidRowAnnotation(element, annotation)
}

const readSelectableDescendantCount = (element: Element): number =>
  element.querySelectorAll(INTERACTIVE_MERMAID_SELECTABLE_SELECTOR).length

const readBoundedInteractiveMermaidAnnotationScope = (element: Element): Element | null => {
  let current = element.parentElement
  while (current && current.tagName.toLowerCase() !== 'svg') {
    if (
      current.tagName.toLowerCase() === 'g' &&
      readSelectableDescendantCount(current) <= INTERACTIVE_MERMAID_ANNOTATION_SCOPE_MAX_SELECTABLE
    ) {
      return current
    }
    current = current.parentElement
  }
  const parent = element.parentElement
  if (
    parent &&
    parent.tagName.toLowerCase() !== 'svg' &&
    readSelectableDescendantCount(parent) <= INTERACTIVE_MERMAID_ANNOTATION_SCOPE_MAX_SELECTABLE
  ) {
    return parent
  }
  return null
}

const annotateInteractiveMermaidScope = (
  scope: Element,
  annotation: InteractiveMermaidRowAnnotation,
): void => {
  if (scope.closest('[data-kg-svg-viewport-hitbox="1"]')) return
  if (scope.matches(INTERACTIVE_MERMAID_SELECTABLE_SELECTOR)) {
    writeCompatibleInteractiveMermaidRowAnnotation(scope, annotation)
  }
  for (const child of Array.from(scope.querySelectorAll(INTERACTIVE_MERMAID_SELECTABLE_SELECTOR))) {
    if (child.closest('[data-kg-svg-viewport-hitbox="1"]')) continue
    writeCompatibleInteractiveMermaidRowAnnotation(child, annotation)
  }
}

const rowMatchesElement = (row: InteractiveMermaidSelectionRow, element: Element): boolean => {
  const rowLabels = [row.key, ...row.labels].map(label => normalizeInteractiveMermaidLabel(label)).filter(Boolean)
  if (!rowLabels.length) return false
  return readElementLabelCandidates(element)
    .some(candidate => rowLabels.includes(normalizeInteractiveMermaidLabel(candidate)))
}

const findRowElement = (
  svgEl: SVGSVGElement,
  row: InteractiveMermaidSelectionRow | null | undefined,
): Element | null => {
  if (!row) return null
  const content = svgEl.querySelector('[data-kg-svg-zoom-content="1"]') || svgEl
  const tagged = Array.from(content.querySelectorAll('[data-kg-mermaid-row-key]'))
    .find(element => element.getAttribute('data-kg-mermaid-row-key') === row.key)
  if (tagged) return tagged
  return Array.from(content.querySelectorAll('circle,rect,path,text,tspan,g'))
    .find(element => !element.closest('[data-kg-svg-viewport-hitbox="1"]') && rowMatchesElement(row, element)) || null
}

const readRowPeerElements = (
  svgEl: SVGSVGElement,
  row: InteractiveMermaidSelectionRow | null | undefined,
): Element[] => {
  if (!row) return []
  const content = svgEl.querySelector('[data-kg-svg-zoom-content="1"]') || svgEl
  return Array.from(content.querySelectorAll('[data-kg-mermaid-row-key]'))
    .filter(element => element.getAttribute('data-kg-mermaid-row-key') === row.key)
}

const resolveSelectionRowByLabel = (
  rows: readonly InteractiveMermaidSelectionRow[],
  label: string | null | undefined,
): InteractiveMermaidSelectionRow | null => {
  const normalized = normalizeInteractiveMermaidLabel(label)
  if (!normalized) return null
  return rows.find(row => normalizeInteractiveMermaidLabel(row.key) === normalized) ||
    rows.find(row => labelsMatch(label, [row.key, ...row.labels])) ||
    null
}

const propagateInteractiveMermaidRowAnnotations = (root: Element): void => {
  const selectable = Array.from(root.querySelectorAll(INTERACTIVE_MERMAID_SELECTABLE_SELECTOR))
  for (const element of selectable) {
    const annotation = readInteractiveMermaidRowAnnotation(element)
    if (!annotation || element.tagName.toLowerCase() !== 'g') continue
    for (const child of Array.from(element.children)) {
      if (!child.matches(INTERACTIVE_MERMAID_SELECTABLE_SELECTOR)) continue
      if (child.closest('[data-kg-svg-viewport-hitbox="1"]')) continue
      if (readInteractiveMermaidRowAnnotation(child)) continue
      writeInteractiveMermaidRowAnnotation(child, annotation)
    }
  }

  const aliasMap = new Map<string, InteractiveMermaidRowAnnotation | null>()
  for (const element of selectable) {
    const annotation = readInteractiveMermaidRowAnnotation(element)
    if (!annotation) continue
    for (const alias of deriveInteractiveMermaidClassAliases(element)) {
      const existing = aliasMap.get(alias)
      if (existing === null) continue
      if (existing && existing.key !== annotation.key) {
        aliasMap.set(alias, null)
        continue
      }
      aliasMap.set(alias, annotation)
    }
  }

  for (const element of selectable) {
    if (element.closest('[data-kg-svg-viewport-hitbox="1"]')) continue
    if (readInteractiveMermaidRowAnnotation(element)) continue
    for (const alias of deriveInteractiveMermaidClassAliases(element)) {
      const annotation = aliasMap.get(alias)
      if (!annotation) continue
      writeCompatibleInteractiveMermaidRowAnnotation(element, annotation)
      break
    }
  }
}

const propagateInteractiveMermaidScopedAnnotations = (root: Element): void => {
  const annotated = Array.from(root.querySelectorAll('[data-kg-mermaid-row-key]'))
  for (const element of annotated) {
    const annotation = readInteractiveMermaidRowAnnotation(element)
    if (!annotation || element.closest('[data-kg-svg-viewport-hitbox="1"]')) continue
    const scope = readBoundedInteractiveMermaidAnnotationScope(element)
    if (scope) annotateInteractiveMermaidScope(scope, annotation)
  }
}

export const annotateInteractiveMermaidSelectionRows = (
  svg: string,
  rows: readonly InteractiveMermaidSelectionRow[],
): string => {
  const usableRows = rows.filter(row => row.key && row.labels.some(label => String(label || '').trim()))
  if (!svg || !usableRows.length || typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return svg
  try {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const root = doc.documentElement
    if (!root || root.tagName.toLowerCase() !== 'svg') return svg
    const candidates = Array.from(root.querySelectorAll(INTERACTIVE_MERMAID_SELECTABLE_SELECTOR))
    for (const element of candidates) {
      if (element.closest('[data-kg-svg-viewport-hitbox="1"]')) continue
      const row = usableRows.find(candidate => rowMatchesElement(candidate, element))
      if (!row) continue
      writeInteractiveMermaidRowAnnotation(element, {
        key: row.key,
        label: readRowPrimaryLabel(row),
        kind: row.kind,
        lineNumber: row.lineNumber,
      })
    }
    propagateInteractiveMermaidScopedAnnotations(root)
    propagateInteractiveMermaidRowAnnotations(root)
    return new XMLSerializer().serializeToString(root)
  } catch {
    return svg
  }
}

export function InteractiveMermaidDiagram({
  code,
  rootThemeMode,
  selectedLabels = [],
  selectionRows = [],
  selectedRowKey = '',
  dimUnselected = false,
  rendererId = 'gitGraph',
  svgSurfaceKey = rendererId,
  ariaLabel = `${rendererId} diagram`,
  svgFitMode = 'auto',
  onSelectedLabelChange,
  onSelectedRowKeyChange,
}: {
  code: string
  rootThemeMode: 'light' | 'dark'
  selectedLabels?: readonly string[]
  selectionRows?: readonly InteractiveMermaidSelectionRow[]
  selectedRowKey?: string
  dimUnselected?: boolean
  rendererId?: Canvas2dRendererId
  ariaLabel?: string
  svgSurfaceKey?: string
  svgFitMode?: SvgSurfaceFitMode
  onSelectedLabelChange?: (label: string) => void
  onSelectedRowKeyChange?: (key: string | null) => void
}) {
  const rootRef = React.useRef<HTMLElement | null>(null)
  const svgHostRef = React.useRef<HTMLElement | null>(null)
  const [baseSvg, setBaseSvg] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const upsertUiToast = useGraphStore(state => state.upsertUiToast)
  const annotatedSvg = React.useMemo(
    () => annotateInteractiveMermaidSelectionRows(baseSvg, selectionRows),
    [baseSvg, selectionRows],
  )
  const selectedSvg = React.useMemo(
    () => applyPlainMermaidDiagramSelection(annotatedSvg, selectedLabels, dimUnselected),
    [annotatedSvg, dimUnselected, selectedLabels],
  )
  const selectedElementLabel = selectedRowKey || selectedLabels.find(label => String(label || '').trim()) || ''
  const selectionRowsRef = React.useRef(selectionRows)
  React.useEffect(() => {
    selectionRowsRef.current = selectionRows
  }, [selectionRows])
  const resolveSelectedElementByLabel = React.useCallback(({ svgEl, label }: {
    svgEl: SVGSVGElement
    label: string
  }) => {
    const row = resolveSelectionRowByLabel(selectionRowsRef.current, label)
    return findRowElement(svgEl, row) || findSelectionElement(
      svgEl,
      selectedLabels.length ? selectedLabels : [label],
    )
  }, [selectedLabels])
  const readSelectedElementLabel = React.useCallback(({ candidate }: {
    svgEl: SVGSVGElement
    target: Element
    candidate: Element
  }) => {
    return readElementLabel(candidate)
  }, [])
  const readSelectedElementPeers = React.useCallback(({ svgEl, label }: {
    svgEl: SVGSVGElement
    selectedElement: Element
    label: string
  }) => {
    return readRowPeerElements(svgEl, resolveSelectionRowByLabel(selectionRowsRef.current, label))
  }, [])
  const handleSelectedElementLabelChange = React.useCallback((label: string) => {
    const row = resolveSelectionRowByLabel(selectionRowsRef.current, label)
    if (row) {
      if (onSelectedRowKeyChange) {
        onSelectedRowKeyChange(row.key)
        return
      }
      onSelectedLabelChange?.(label)
      return
    }
    if (!String(label || '').trim()) {
      if (onSelectedRowKeyChange) {
        onSelectedRowKeyChange(null)
        return
      }
    }
    onSelectedLabelChange?.(label)
  }, [onSelectedLabelChange, onSelectedRowKeyChange])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const normalized = normalizeMermaidCodeForRuntime(String(code || '').trim())
        if (!normalized) {
          if (!cancelled) {
            setError('Mermaid diagram code is empty')
            setBaseSvg('')
          }
          return
        }
        const out = await renderPlainMermaidSvgCached({
          code: normalized,
          theme: rootThemeMode === 'dark' ? 'dark' : 'light',
        })
        if (cancelled) return
        const processed = postprocessMermaidSvg(out.svg)
        if (processed.error) {
          setError(processed.error)
          setBaseSvg('')
          return
        }
        setError(null)
        setBaseSvg(processed.svg)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setBaseSvg('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, rootThemeMode])

  React.useEffect(() => {
    const message = String(error || '').trim()
    if (!message) return
    upsertUiToast({
      id: `mermaid-diagram-render-error:${rendererId}`,
      kind: 'error',
      message,
      ttlMs: 6000,
      dismissible: true,
    })
  }, [error, rendererId, upsertUiToast])

  React.useLayoutEffect(() => {
    const svg = svgHostRef.current?.querySelector('svg')
    if (!svg) return
    svg.setAttribute('aria-label', ariaLabel)
    svg.removeAttribute('aria-labelledby')
  }, [ariaLabel, selectedSvg])

  useSvgSurfaceZoomRuntime({
    active: !!selectedSvg && !error,
    rootRef,
    svgHostRef,
    svgMarkup: selectedSvg,
    rendererId,
    graphData: null,
    graphDataRevision: selectedSvg.length,
    svgSurfaceKey,
    svgFitMode,
    selectedElementLabel,
    resolveSelectedElementByLabel,
    readSelectedElementLabel,
    readSelectedElementPeers,
    onSelectedElementLabelChange: handleSelectedElementLabelChange,
  })

  if (error) {
    return (
      <section className="sr-only" role="status" aria-live="polite">
        Mermaid diagram error surfaced in notifications.
      </section>
    )
  }

  if (!selectedSvg) return null

  return (
    <section
      ref={rootRef}
      className="relative h-full min-h-40 min-w-0 overflow-hidden"
      aria-label={ariaLabel}
      data-kg-interactive-svg-diagram-surface="1"
      data-kg-interactive-svg-diagram-renderer={rendererId}
      data-kg-interactive-svg-diagram-key={svgSurfaceKey || undefined}
    >
      <style>
        {`
          [data-kg-interactive-svg-diagram-surface="1"] svg {
            display: block;
            width: 100%;
            height: 100%;
            max-width: none;
            overflow: hidden;
            touch-action: none;
          }
          [data-kg-interactive-svg-diagram-surface="1"] [data-kg-svg-dimmed="1"] {
            opacity: 0.22;
          }
          [data-kg-interactive-svg-diagram-surface="1"] [data-kg-svg-selected="1"] {
            opacity: 1 !important;
            filter: drop-shadow(0 0 4px rgba(37,99,235,.55));
          }
        `}
      </style>
      <section
        ref={svgHostRef}
        className="absolute inset-0 h-full w-full overflow-hidden"
        dangerouslySetInnerHTML={{ __html: selectedSvg }}
      />
    </section>
  )
}
