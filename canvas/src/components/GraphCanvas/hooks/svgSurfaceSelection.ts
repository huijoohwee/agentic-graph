export type SvgElementSelectionController = {
  cleanup: () => void
  clearSelectedElement: () => void
  setSelectedElementByLabel: (label: string | null | undefined, options?: { notify?: boolean }) => void
}

export type SvgElementSelectionOptions = {
  readSelectedElementLabel?: (args: {
    svgEl: SVGSVGElement
    target: Element
    candidate: Element
  }) => string
  resolveSelectedElementByLabel?: (args: {
    svgEl: SVGSVGElement
    label: string
  }) => Element | null
  readSelectedElementPeers?: (args: {
    svgEl: SVGSVGElement
    selectedElement: Element
    label: string
  }) => Element[]
  onSelectedElementLabelChange?: (label: string) => void
}

const readSvgElementLabel = (element: Element | null): string => {
  if (!element) return ''
  const label =
    element.getAttribute('aria-label') ||
    element.getAttribute('data-id') ||
    element.getAttribute('id') ||
    element.textContent ||
    ''
  return String(label).replace(/\s+/g, ' ').trim()
}

const normalizeSvgComparableLabel = (value: string | null | undefined): string => {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

const SVG_SELECTABLE_ELEMENT_SELECTOR = 'text, tspan, circle, rect, path, g'
const SVG_LABEL_PREFERRED_ELEMENT_SELECTOR = 'text, tspan, [aria-label], [data-id], [id]'
const SVG_DIMMABLE_ELEMENT_SELECTOR = 'text, tspan, circle, rect, path'
const SVG_DIRECT_SELECTION_TARGET_SELECTOR = '[data-kg-svg-selection-target="1"], [data-kg-mermaid-row-target="1"]'
const SVG_NEAREST_DIRECT_SELECTION_RADIUS_PX = 12

const readSvgSelectionCandidates = (svgEl: SVGSVGElement): Element[] => {
  const contentEl = svgEl.querySelector('[data-kg-svg-zoom-content="1"]') || svgEl
  return Array.from(contentEl.querySelectorAll(SVG_SELECTABLE_ELEMENT_SELECTOR)).filter(element => {
    return element.closest('[data-kg-svg-viewport-hitbox="1"]') == null
  })
}

const findSvgSelectionCandidateByLabel = (svgEl: SVGSVGElement, label: string | null | undefined): Element | null => {
  const normalized = normalizeSvgComparableLabel(label)
  if (!normalized) return null
  const candidates = readSvgSelectionCandidates(svgEl)
  const exact = candidates.find(element => normalizeSvgComparableLabel(readSvgElementLabel(element)) === normalized)
  if (exact) return exact
  const preferred = candidates.filter(element => element.matches(SVG_LABEL_PREFERRED_ELEMENT_SELECTOR))
  return preferred.find(element => normalizeSvgComparableLabel(readSvgElementLabel(element)).includes(normalized)) || null
}

const readSvgRectDistance = (rect: DOMRect, x: number, y: number): number => {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
  return Math.hypot(dx, dy)
}

const findNearestSvgSelectionTarget = (
  svgEl: SVGSVGElement,
  clientX: number,
  clientY: number,
): Element | null => {
  const contentEl = svgEl.querySelector('[data-kg-svg-zoom-content="1"]') || svgEl
  let best: { element: Element; distance: number; area: number } | null = null
  for (const element of Array.from(contentEl.querySelectorAll(SVG_DIRECT_SELECTION_TARGET_SELECTOR))) {
    if (element.closest('[data-kg-svg-viewport-hitbox="1"]')) continue
    if (element.tagName.toLowerCase() === 'path') continue
    const rect = element.getBoundingClientRect()
    if (
      !Number.isFinite(rect.left) ||
      !Number.isFinite(rect.top) ||
      !Number.isFinite(rect.width) ||
      !Number.isFinite(rect.height) ||
      rect.width <= 0 ||
      rect.height <= 0
    ) continue
    const distance = readSvgRectDistance(rect, clientX, clientY)
    if (distance > SVG_NEAREST_DIRECT_SELECTION_RADIUS_PX) continue
    const area = Math.max(1, rect.width * rect.height)
    if (!best || distance < best.distance || (distance === best.distance && area < best.area)) {
      best = { element, distance, area }
    }
  }
  return best?.element || null
}

const resolveSvgSelectionClickCandidate = (
  svgEl: SVGSVGElement,
  target: Element | null,
  event: MouseEvent,
): Element | null => {
  const directTarget = target?.closest(SVG_DIRECT_SELECTION_TARGET_SELECTOR)
  if (directTarget instanceof Element && directTarget.closest('[data-kg-svg-zoom-content="1"]')) return directTarget
  const candidate = target?.closest(SVG_SELECTABLE_ELEMENT_SELECTOR)
  if (candidate instanceof Element && candidate.closest('[data-kg-svg-zoom-content="1"]')) return candidate
  return findNearestSvgSelectionTarget(svgEl, event.clientX, event.clientY)
}

const updateSvgSelectionDimming = (
  svgEl: SVGSVGElement,
  selectedEl: Element | null,
  selectedPeers: ReadonlyArray<Element> = [],
): void => {
  svgEl.querySelectorAll('[data-kg-svg-dimmed="1"]').forEach(element => {
    element.removeAttribute('data-kg-svg-dimmed')
  })
  if (!selectedEl) {
    svgEl.removeAttribute('data-kg-svg-has-selection')
    return
  }
  svgEl.setAttribute('data-kg-svg-has-selection', '1')
  const selectedElements = [selectedEl, ...selectedPeers].filter((element): element is Element => element instanceof Element)
  const contentEl = svgEl.querySelector('[data-kg-svg-zoom-content="1"]') || svgEl
  Array.from(contentEl.querySelectorAll(SVG_DIMMABLE_ELEMENT_SELECTOR)).forEach(element => {
    if (element.closest('[data-kg-svg-viewport-hitbox="1"]')) return
    if (
      selectedElements.some(selected => {
        return element === selected || selected.contains(element) || element.contains(selected)
      })
    ) return
    element.setAttribute('data-kg-svg-dimmed', '1')
  })
}

export const installSvgElementSelection = (args: SvgElementSelectionOptions & { svgEl: SVGSVGElement }): SvgElementSelectionController => {
  let selectedEl: Element | null = null
  const readSelectionPeers = (el: Element | null, label: string): Element[] => {
    if (!el || !label) return []
    return args.readSelectedElementPeers?.({
      svgEl: args.svgEl,
      selectedElement: el,
      label,
    }) || []
  }
  const setSelected = (el: Element | null, labelOverride?: string, notify = true) => {
    const label = String(labelOverride || readSvgElementLabel(el)).replace(/\s+/g, ' ').trim()
    if (selectedEl === el) {
      updateSvgSelectionDimming(args.svgEl, selectedEl, readSelectionPeers(selectedEl, label))
      args.svgEl.setAttribute('data-kg-svg-selected-label', label)
      if (notify) args.onSelectedElementLabelChange?.(label)
      return
    }
    if (selectedEl) selectedEl.removeAttribute('data-kg-svg-selected')
    selectedEl = el
    if (selectedEl) selectedEl.setAttribute('data-kg-svg-selected', '1')
    updateSvgSelectionDimming(args.svgEl, selectedEl, readSelectionPeers(selectedEl, label))
    args.svgEl.setAttribute('data-kg-svg-selected-label', label)
    if (notify) args.onSelectedElementLabelChange?.(label)
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null
    const candidate = resolveSvgSelectionClickCandidate(args.svgEl, target, event)
    if (!candidate || candidate.closest('[data-kg-svg-viewport-hitbox="1"]')) {
      setSelected(null)
      return
    }
    const label = args.readSelectedElementLabel?.({ svgEl: args.svgEl, target: target || candidate, candidate }) || readSvgElementLabel(candidate)
    setSelected(candidate, label)
  }

  args.svgEl.addEventListener('click', onClick)
  return {
    cleanup: () => {
      args.svgEl.removeEventListener('click', onClick)
      if (selectedEl) selectedEl.removeAttribute('data-kg-svg-selected')
      updateSvgSelectionDimming(args.svgEl, null)
    },
    clearSelectedElement: () => setSelected(null),
    setSelectedElementByLabel: (label, options) => {
      const normalizedLabel = String(label || '').replace(/\s+/g, ' ').trim()
      const candidate =
        args.resolveSelectedElementByLabel?.({ svgEl: args.svgEl, label: normalizedLabel }) ||
        findSvgSelectionCandidateByLabel(args.svgEl, normalizedLabel)
      setSelected(candidate, normalizedLabel, options?.notify !== false)
    },
  }
}

