import { JSDOM } from 'jsdom'
import { sanitizeNodeTestFlags } from '@/tests/lib/sanitizeNodeTestFlags'

export type JsdomHarnessEnv = {
  dom: JSDOM
  restore: () => void
}

const activeAnimationFrameTimeoutSets = new Set<Set<ReturnType<typeof setTimeout>>>()
const activeJsdomHarnessStack: Array<{ window: Window; document: Document }> = []
let activeJsdomWindow: Window | null = null
let activeJsdomDocument: Document | null = null

const syncActiveJsdomGlobals = (): void => {
  const current = activeJsdomHarnessStack[activeJsdomHarnessStack.length - 1] || null
  activeJsdomWindow = current?.window || null
  activeJsdomDocument = current?.document || null
}

export const resetJsdomHarnessAnimationFramesForTests = (): void => {
  for (const timeouts of activeAnimationFrameTimeoutSets) {
    for (const timeout of timeouts) clearTimeout(timeout)
    timeouts.clear()
  }
}

export const restoreActiveJsdomGlobalsForTests = (): void => {
  if (!activeJsdomWindow || !activeJsdomDocument) return
  const g = globalThis as typeof globalThis & {
    window?: Window
    document?: Document
    Node?: typeof Node
    Element?: typeof Element
    HTMLElement?: typeof HTMLElement
    Event?: typeof Event
    CustomEvent?: typeof CustomEvent
    Range?: typeof Range
    NodeFilter?: typeof NodeFilter
    DOMParser?: typeof DOMParser
    HTMLIFrameElement?: typeof HTMLIFrameElement
    requestAnimationFrame?: (cb: FrameRequestCallback) => number
    cancelAnimationFrame?: (id: number) => void
  }
  const windowConstructors = activeJsdomWindow as unknown as Pick<
    typeof globalThis,
    'Node' | 'Element' | 'HTMLElement' | 'Range' | 'DOMParser'
  >
  const windowEventConstructors = activeJsdomWindow as unknown as {
    Event: typeof Event
    CustomEvent: typeof CustomEvent
  }
  ;(g as { window?: unknown }).window = activeJsdomWindow
  g.document = activeJsdomDocument
  g.Node = windowConstructors.Node
  g.Element = windowConstructors.Element
  g.HTMLElement = windowConstructors.HTMLElement
  g.Event = windowEventConstructors.Event
  g.CustomEvent = windowEventConstructors.CustomEvent
  g.Range = windowConstructors.Range
  g.NodeFilter = (activeJsdomWindow as unknown as { NodeFilter?: typeof NodeFilter }).NodeFilter as typeof NodeFilter
  g.DOMParser = windowConstructors.DOMParser
  g.HTMLIFrameElement =
    (activeJsdomWindow as unknown as { HTMLIFrameElement?: typeof HTMLIFrameElement }).HTMLIFrameElement as
      typeof HTMLIFrameElement
  if (typeof activeJsdomWindow.requestAnimationFrame === 'function') {
    g.requestAnimationFrame = activeJsdomWindow.requestAnimationFrame.bind(activeJsdomWindow)
  }
  if (typeof activeJsdomWindow.cancelAnimationFrame === 'function') {
    g.cancelAnimationFrame = activeJsdomWindow.cancelAnimationFrame.bind(activeJsdomWindow)
  }
}

export const initJsdomHarness = (html: string = '<!doctype html><html><body></body></html>'): JsdomHarnessEnv => {
  sanitizeNodeTestFlags()
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    contentType: 'text/html',
    pretendToBeVisual: true,
  })

  const g = globalThis as typeof globalThis
  const originalIsReactActEnvironment = (g as unknown as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT

  const originalWindow = (g as { window?: unknown }).window as Window | undefined
  const originalDocument = (g as { document?: unknown }).document as Document | undefined
  const originalNode = (g as { Node?: typeof Node }).Node
  const originalElement = (g as { Element?: typeof Element }).Element
  const originalHTMLElement = (g as { HTMLElement?: typeof HTMLElement }).HTMLElement
  const originalEvent = (g as { Event?: typeof Event }).Event
  const originalCustomEvent = (g as { CustomEvent?: typeof CustomEvent }).CustomEvent
  const originalRange = (g as { Range?: typeof Range }).Range
  const originalNodeFilter = (g as { NodeFilter?: typeof NodeFilter }).NodeFilter
  const originalDomParser = (g as { DOMParser?: typeof DOMParser }).DOMParser
  const originalHtmlIFrameElement = (g as { HTMLIFrameElement?: typeof HTMLIFrameElement }).HTMLIFrameElement
  const originalObjectProtoHtmlIFrameElementDesc = Object.getOwnPropertyDescriptor(Object.prototype, 'HTMLIFrameElement')
  const originalDocumentProtoActiveElementDesc = Object.getOwnPropertyDescriptor(dom.window.Document.prototype, 'activeElement')
  const originalDocumentActiveElementDesc = Object.getOwnPropertyDescriptor(dom.window.document, 'activeElement')
  const rangePrototype = (dom.window as unknown as { Range?: { prototype?: Record<string, unknown> } }).Range?.prototype
  const originalRangeGetBoundingClientRectDesc = rangePrototype
    ? Object.getOwnPropertyDescriptor(rangePrototype, 'getBoundingClientRect')
    : undefined
  const originalRangeGetClientRectsDesc = rangePrototype
    ? Object.getOwnPropertyDescriptor(rangePrototype, 'getClientRects')
    : undefined
  const originalResizeObserver = (g as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
  const originalRequestAnimationFrame = (g as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame
  const originalCancelAnimationFrame = (g as unknown as { cancelAnimationFrame?: unknown }).cancelAnimationFrame
  const originalMermaidStub = (g as unknown as { __KG_TEST_MERMAID_API__?: unknown }).__KG_TEST_MERMAID_API__
  let iframeWindowPatchObserver: MutationObserver | null = null

  ;(g as { window: Window }).window = dom.window as unknown as Window
  ;(g as { document: Document }).document = dom.window.document as unknown as Document
  ;(g as { Node: typeof Node }).Node = dom.window.Node as unknown as typeof Node
  ;(g as { Element: typeof Element }).Element = dom.window.Element as unknown as typeof Element
  ;(g as { HTMLElement: typeof HTMLElement }).HTMLElement = dom.window.HTMLElement as unknown as typeof HTMLElement
  ;(g as { Event: typeof Event }).Event = dom.window.Event as unknown as typeof Event
  ;(g as { CustomEvent: typeof CustomEvent }).CustomEvent =
    dom.window.CustomEvent as unknown as typeof CustomEvent
  ;(g as { Range: typeof Range }).Range = dom.window.Range as unknown as typeof Range
  ;(g as unknown as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT = true
  activeJsdomHarnessStack.push({
    window: dom.window as unknown as Window,
    document: dom.window.document as unknown as Document,
  })
  syncActiveJsdomGlobals()

  try {
    const patchLegacyInputEventMethods = (proto: Record<string, unknown> | undefined) => {
      if (!proto) return
      if (typeof proto.attachEvent !== 'function') {
        proto.attachEvent = () => void 0
      }
      if (typeof proto.detachEvent !== 'function') {
        proto.detachEvent = () => void 0
      }
    }
    patchLegacyInputEventMethods((dom.window.Element as unknown as { prototype?: Record<string, unknown> }).prototype)
    patchLegacyInputEventMethods((dom.window.HTMLElement as unknown as { prototype?: Record<string, unknown> }).prototype)
    patchLegacyInputEventMethods((dom.window as unknown as { HTMLInputElement?: { prototype?: Record<string, unknown> } }).HTMLInputElement?.prototype)
    patchLegacyInputEventMethods((dom.window as unknown as { HTMLTextAreaElement?: { prototype?: Record<string, unknown> } }).HTMLTextAreaElement?.prototype)
    patchLegacyInputEventMethods((dom.window as unknown as { HTMLSelectElement?: { prototype?: Record<string, unknown> } }).HTMLSelectElement?.prototype)
  } catch {
    void 0
  }

  try {
    const proto = (dom.window as unknown as { HTMLCanvasElement?: { prototype?: { getContext?: unknown } } }).HTMLCanvasElement?.prototype
    if (proto) {
      ;(proto as unknown as { getContext?: unknown }).getContext = (() => {
        const noop = () => void 0
        return {
          canvas: null,
          clearRect: noop,
          fillRect: noop,
          strokeRect: noop,
          beginPath: noop,
          closePath: noop,
          moveTo: noop,
          lineTo: noop,
          rect: noop,
          arc: noop,
          clip: noop,
          stroke: noop,
          fill: noop,
          fillText: noop,
          measureText: (text: string) => ({ width: String(text || '').length * 6 }),
          save: noop,
          restore: noop,
          translate: noop,
          scale: noop,
          setTransform: noop,
          resetTransform: noop,
          createLinearGradient: () => ({ addColorStop: noop }),
          createRadialGradient: () => ({ addColorStop: noop }),
          createPattern: () => null,
          drawImage: noop,
          getImageData: () => ({ data: new Uint8ClampedArray(0) }),
          putImageData: noop,
          globalAlpha: 1,
          fillStyle: '#000',
          strokeStyle: '#000',
          lineWidth: 1,
          font: '12px sans-serif',
          textBaseline: 'alphabetic',
          textAlign: 'start',
        } as unknown
      }) as unknown
    }
  } catch {
    void 0
  }

  try {
    const proto = rangePrototype as unknown as {
      getBoundingClientRect?: unknown
      getClientRects?: unknown
    } | undefined
    const createZeroRect = (): DOMRect => {
      const RectCtor = (dom.window as unknown as { DOMRect?: typeof DOMRect }).DOMRect
      if (typeof RectCtor === 'function') return new RectCtor(0, 0, 0, 0)
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      } as unknown as DOMRect
    }
    const createEmptyRectList = (): DOMRectList => {
      const rects: DOMRect[] = []
      return Object.assign(rects, { item: () => null }) as unknown as DOMRectList
    }
    if (proto && typeof proto.getBoundingClientRect !== 'function') {
      Object.defineProperty(proto, 'getBoundingClientRect', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: createZeroRect,
      })
    }
    if (proto && typeof proto.getClientRects !== 'function') {
      Object.defineProperty(proto, 'getClientRects', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: createEmptyRectList,
      })
    }
  } catch {
    void 0
  }
  const nodeFilter = (dom.window as unknown as { NodeFilter?: typeof NodeFilter }).NodeFilter
  const polyfillNodeFilter = (nodeFilter ||
    ({
      FILTER_ACCEPT: 1,
      FILTER_REJECT: 2,
      FILTER_SKIP: 3,
      SHOW_ALL: -1,
      SHOW_ELEMENT: 1,
      SHOW_ATTRIBUTE: 2,
      SHOW_TEXT: 4,
      SHOW_CDATA_SECTION: 8,
      SHOW_ENTITY_REFERENCE: 16,
      SHOW_ENTITY: 32,
      SHOW_PROCESSING_INSTRUCTION: 64,
      SHOW_COMMENT: 128,
      SHOW_DOCUMENT: 256,
      SHOW_DOCUMENT_TYPE: 512,
      SHOW_DOCUMENT_FRAGMENT: 1024,
      SHOW_NOTATION: 2048,
    } as unknown as typeof NodeFilter))

  ;(g as { NodeFilter: typeof NodeFilter }).NodeFilter = polyfillNodeFilter
  ;(dom.window as unknown as { NodeFilter: typeof NodeFilter }).NodeFilter = polyfillNodeFilter
  ;(g as { DOMParser: typeof DOMParser }).DOMParser = dom.window.DOMParser as unknown as typeof DOMParser

  try {
    const anyWindow = dom.window as unknown as { HTMLIFrameElement?: typeof HTMLIFrameElement }
    const anyGlobal = g as unknown as { HTMLIFrameElement?: typeof HTMLIFrameElement }
    if (anyWindow.HTMLIFrameElement) {
      anyGlobal.HTMLIFrameElement = anyWindow.HTMLIFrameElement
    } else if (typeof HTMLIFrameElement !== 'undefined') {
      anyGlobal.HTMLIFrameElement = HTMLIFrameElement
    } else {
      anyGlobal.HTMLIFrameElement = class {} as typeof HTMLIFrameElement
    }

    const anyJsdomWindow = dom.window as unknown as { Window?: { prototype?: Record<string, unknown> }; HTMLIFrameElement?: unknown }
    if (anyJsdomWindow.Window?.prototype && anyJsdomWindow.HTMLIFrameElement) {
      anyJsdomWindow.Window.prototype.HTMLIFrameElement = anyJsdomWindow.HTMLIFrameElement
    }

    const iframeProto = (dom.window as unknown as { HTMLIFrameElement?: { prototype?: unknown } }).HTMLIFrameElement?.prototype as
      | { contentWindow?: unknown }
      | undefined
    if (iframeProto && anyWindow.HTMLIFrameElement) {
      const desc = Object.getOwnPropertyDescriptor(iframeProto, 'contentWindow')
      if (desc?.get) {
        Object.defineProperty(iframeProto, 'contentWindow', {
          configurable: true,
          enumerable: desc.enumerable ?? false,
          get() {
            const w = desc.get!.call(this) as unknown as Record<string, unknown> | null
            if (w && typeof w === 'object' && !('HTMLIFrameElement' in w)) {
              try {
                ;(w as { HTMLIFrameElement?: unknown }).HTMLIFrameElement = anyWindow.HTMLIFrameElement
              } catch {
                void 0
              }
            }
            return w as unknown
          },
        })
      }
    }

    if (anyWindow.HTMLIFrameElement && !Object.prototype.hasOwnProperty.call(Object.prototype, 'HTMLIFrameElement')) {
      Object.defineProperty(Object.prototype, 'HTMLIFrameElement', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: anyWindow.HTMLIFrameElement,
      })
    }

    try {
      Object.defineProperty(dom.window.document, 'activeElement', {
        configurable: true,
        enumerable: originalDocumentActiveElementDesc?.enumerable ?? false,
        get() {
          return dom.window.document.body || dom.window.document.documentElement
        },
      })
    } catch {
      if (originalDocumentProtoActiveElementDesc?.get) {
        Object.defineProperty(dom.window.Document.prototype, 'activeElement', {
          configurable: true,
          enumerable: originalDocumentProtoActiveElementDesc.enumerable ?? false,
          get() {
            const d = this as unknown as Document
            return d.body || d.documentElement
          },
        })
      }
    }

    const patchIframeWindows = () => {
      const IFrameCtor = (dom.window as unknown as { HTMLIFrameElement?: unknown }).HTMLIFrameElement
      if (!IFrameCtor) return
      const iframes = Array.from(dom.window.document.querySelectorAll('iframe'))
      for (const el of iframes) {
        try {
          const iframe = el as unknown as { contentWindow?: unknown }
          const w = iframe.contentWindow as unknown as Record<string, unknown> | null
          if (!w || typeof w !== 'object') continue
          if (!('HTMLIFrameElement' in w)) {
            ;(w as { HTMLIFrameElement?: unknown }).HTMLIFrameElement = IFrameCtor
          }
        } catch {
          void 0
        }
      }
    }

    patchIframeWindows()
    if (typeof dom.window.MutationObserver !== 'undefined') {
      iframeWindowPatchObserver = new dom.window.MutationObserver(() => patchIframeWindows())
      iframeWindowPatchObserver.observe(dom.window.document.body, { childList: true, subtree: true })
    }

    // Polyfill ResizeObserver
    const anyGlobalResize = g as unknown as { ResizeObserver: unknown }
    if (!anyGlobalResize.ResizeObserver) {
      anyGlobalResize.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    }
  } catch {
    void 0
  }

  const anyWindow = dom.window as unknown as {
    requestAnimationFrame?: (cb: FrameRequestCallback) => number
    cancelAnimationFrame?: (id: number) => void
    setTimeout: typeof setTimeout
    clearTimeout: typeof clearTimeout
  }

  const animationFrameTimeouts = new Set<ReturnType<typeof setTimeout>>()
  activeAnimationFrameTimeoutSets.add(animationFrameTimeouts)
  anyWindow.requestAnimationFrame = (cb: FrameRequestCallback) => {
    const timeout = setTimeout(() => {
      animationFrameTimeouts.delete(timeout)
      cb(Date.now())
    }, 0)
    animationFrameTimeouts.add(timeout)
    return timeout as unknown as number
  }
  anyWindow.cancelAnimationFrame = (id: number) => {
    const timeout = id as unknown as ReturnType<typeof setTimeout>
    clearTimeout(timeout)
    animationFrameTimeouts.delete(timeout)
  }

  ;(g as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }).requestAnimationFrame =
    anyWindow.requestAnimationFrame.bind(dom.window)
  ;(g as unknown as { cancelAnimationFrame: (id: number) => void }).cancelAnimationFrame =
    anyWindow.cancelAnimationFrame.bind(dom.window)

  ;(g as unknown as { __KG_TEST_MERMAID_API__: unknown }).__KG_TEST_MERMAID_API__ = {
    initialize: () => void 0,
    render: async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>' }),
  }

  const restore = () => {
    for (const timeout of animationFrameTimeouts) clearTimeout(timeout)
    animationFrameTimeouts.clear()
    activeAnimationFrameTimeoutSets.delete(animationFrameTimeouts)
    const restoredWindow = dom.window as unknown as Window
    const activeIndex = activeJsdomHarnessStack.findIndex(entry => entry.window === restoredWindow)
    if (activeIndex >= 0) activeJsdomHarnessStack.splice(activeIndex, 1)
    syncActiveJsdomGlobals()

    if (typeof originalWindow === 'undefined') {
      delete (g as { window?: Window }).window
    } else {
      ;(g as { window: Window }).window = originalWindow
    }

    if (typeof originalDocument === 'undefined') {
      delete (g as { document?: Document }).document
    } else {
      ;(g as { document: Document }).document = originalDocument
    }

    if (typeof originalNode === 'undefined') {
      delete (g as { Node?: typeof Node }).Node
    } else {
      ;(g as { Node: typeof Node }).Node = originalNode as typeof Node
    }

    if (typeof originalElement === 'undefined') {
      delete (g as { Element?: typeof Element }).Element
    } else {
      ;(g as { Element: typeof Element }).Element = originalElement as typeof Element
    }

    if (typeof originalHTMLElement === 'undefined') {
      delete (g as { HTMLElement?: typeof HTMLElement }).HTMLElement
    } else {
      ;(g as { HTMLElement: typeof HTMLElement }).HTMLElement = originalHTMLElement as typeof HTMLElement
    }

    if (typeof originalEvent === 'undefined') {
      delete (g as { Event?: typeof Event }).Event
    } else {
      ;(g as { Event: typeof Event }).Event = originalEvent as typeof Event
    }

    if (typeof originalCustomEvent === 'undefined') {
      delete (g as { CustomEvent?: typeof CustomEvent }).CustomEvent
    } else {
      ;(g as { CustomEvent: typeof CustomEvent }).CustomEvent =
        originalCustomEvent as typeof CustomEvent
    }

    if (typeof originalRange === 'undefined') {
      delete (g as { Range?: typeof Range }).Range
    } else {
      ;(g as { Range: typeof Range }).Range = originalRange as typeof Range
    }

    if (typeof originalNodeFilter === 'undefined') {
      delete (g as { NodeFilter?: typeof NodeFilter }).NodeFilter
    } else {
      ;(g as { NodeFilter: typeof NodeFilter }).NodeFilter = originalNodeFilter as typeof NodeFilter
    }

    if (typeof originalDomParser === 'undefined') {
      delete (g as { DOMParser?: typeof DOMParser }).DOMParser
    } else {
      ;(g as { DOMParser: typeof DOMParser }).DOMParser = originalDomParser as typeof DOMParser
    }

    if (typeof originalHtmlIFrameElement === 'undefined') {
      delete (g as { HTMLIFrameElement?: typeof HTMLIFrameElement }).HTMLIFrameElement
    } else {
      ;(g as { HTMLIFrameElement: typeof HTMLIFrameElement }).HTMLIFrameElement =
        originalHtmlIFrameElement as typeof HTMLIFrameElement
    }

    if (typeof originalMermaidStub === 'undefined') {
      delete (g as unknown as { __KG_TEST_MERMAID_API__?: unknown }).__KG_TEST_MERMAID_API__
    } else {
      ;(g as unknown as { __KG_TEST_MERMAID_API__: unknown }).__KG_TEST_MERMAID_API__ = originalMermaidStub
    }

    try {
      iframeWindowPatchObserver?.disconnect()
    } catch {
      void 0
    }
    iframeWindowPatchObserver = null

    try {
      if (rangePrototype) {
        if (typeof originalRangeGetBoundingClientRectDesc === 'undefined') {
          delete rangePrototype.getBoundingClientRect
        } else {
          Object.defineProperty(rangePrototype, 'getBoundingClientRect', originalRangeGetBoundingClientRectDesc)
        }
        if (typeof originalRangeGetClientRectsDesc === 'undefined') {
          delete rangePrototype.getClientRects
        } else {
          Object.defineProperty(rangePrototype, 'getClientRects', originalRangeGetClientRectsDesc)
        }
      }
    } catch {
      void 0
    }

    if (typeof originalResizeObserver === 'undefined') {
      delete (g as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    } else {
      ;(g as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = originalResizeObserver
    }

    if (typeof originalRequestAnimationFrame === 'undefined') {
      delete (g as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame
    } else {
      ;(g as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = originalRequestAnimationFrame
    }

    if (typeof originalCancelAnimationFrame === 'undefined') {
      delete (g as unknown as { cancelAnimationFrame?: unknown }).cancelAnimationFrame
    } else {
      ;(g as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = originalCancelAnimationFrame
    }

    if (typeof originalDocumentActiveElementDesc === 'undefined') {
      delete (dom.window.document as unknown as { activeElement?: unknown }).activeElement
    } else {
      Object.defineProperty(dom.window.document, 'activeElement', originalDocumentActiveElementDesc)
    }

    if (typeof originalObjectProtoHtmlIFrameElementDesc === 'undefined') {
      delete (Object.prototype as unknown as { HTMLIFrameElement?: unknown }).HTMLIFrameElement
    } else {
      Object.defineProperty(Object.prototype, 'HTMLIFrameElement', originalObjectProtoHtmlIFrameElementDesc)
    }

    if (typeof originalIsReactActEnvironment === 'undefined') {
      delete (g as unknown as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT
    } else {
      ;(g as unknown as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT = originalIsReactActEnvironment
    }

    dom.window.close()
  }

  return { dom, restore }
}
