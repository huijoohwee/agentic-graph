import fs from 'node:fs'
import path from 'node:path'
import { createRequire, Module as NodeModule } from 'node:module'
import { sanitizeNodeTestFlags } from '@/tests/lib/sanitizeNodeTestFlags'

const ensurePeerSymlinks = () => {
  try {
    const rootDir = process.cwd()
    const localRequire = createRequire(import.meta.url)
    const linkPeer = (nodeModulesDir: string, name: string) => {
      const src = path.join(rootDir, 'node_modules', name)
      const dest = path.join(nodeModulesDir, name)
      if (!fs.existsSync(src)) return
      if (fs.existsSync(dest)) {
        try {
          const st = fs.lstatSync(dest)
          if (st.isSymbolicLink()) {
            const existing = fs.readlinkSync(dest)
            if (path.resolve(nodeModulesDir, existing) === src) return
          }
        } catch {
          void 0
        }
        try {
          fs.rmSync(dest, { recursive: true, force: true })
        } catch {
          return
        }
      }
      fs.symlinkSync(src, dest, 'dir')
    }

    const ensureForPackage = (pkgName: string) => {
      const entry = localRequire.resolve(pkgName, { paths: [rootDir] })
      const pkgDir = fs.realpathSync(path.resolve(path.dirname(entry), '..'))
      const nodeModulesDir = path.join(pkgDir, 'node_modules')
      fs.mkdirSync(nodeModulesDir, { recursive: true })
      linkPeer(nodeModulesDir, 'react')
      linkPeer(nodeModulesDir, 'react-dom')
      linkPeer(nodeModulesDir, 'grph-shared')
      linkPeer(nodeModulesDir, 'zustand')
      linkPeer(nodeModulesDir, 'maplibre-gl')
      linkPeer(nodeModulesDir, 'three')
    }

    ensureForPackage('gympgrph')
  } catch {
    void 0
  }
}

ensurePeerSymlinks()

sanitizeNodeTestFlags()

if (process.env.KG_TEST_QUIET !== '0') process.env.KG_TEST_QUIET = '1'

const originalConsoleError = console.error.bind(console)
const originalConsoleWarn = console.warn.bind(console)
const traceThreeHarness = process.env.KG_TEST_TRACE_THREE_IMPORTS === '1'
const threeHarnessTraceEntries: Array<Record<string, unknown>> = []
const threeHarnessTraceCounts = new Map<string, number>()
const MAX_THREE_HARNESS_TRACE_ENTRIES = 80
const MAX_THREE_HARNESS_TRACE_PER_KEY = 4
const readThreeHarnessParentId = (parent: unknown): string => {
  if (!parent || typeof parent !== 'object') return ''
  const record = parent as { filename?: unknown; id?: unknown }
  const filename = typeof record.filename === 'string' ? record.filename.trim() : ''
  if (filename) return filename
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  return id
}
const pushThreeHarnessTrace = (kind: string, details?: Record<string, unknown>) => {
  if (!traceThreeHarness) return
  const safeDetails = details || {}
  const stackText = typeof safeDetails.stack === 'string' ? safeDetails.stack : ''
  const stackKey = stackText
    .split('\n')
    .slice(0, 6)
    .map(line => line.trim())
    .join(' | ')
  const traceKey = JSON.stringify({
    kind,
    request: safeDetails.request || '',
    parent: safeDetails.parent || '',
    stackKey,
  })
  const seen = threeHarnessTraceCounts.get(traceKey) || 0
  if (seen >= MAX_THREE_HARNESS_TRACE_PER_KEY) return
  threeHarnessTraceCounts.set(traceKey, seen + 1)
  const entry = {
    ts: Date.now(),
    kind,
    ...safeDetails,
  }
  threeHarnessTraceEntries.push(entry)
  if (threeHarnessTraceEntries.length > MAX_THREE_HARNESS_TRACE_ENTRIES) {
    threeHarnessTraceEntries.splice(0, threeHarnessTraceEntries.length - MAX_THREE_HARNESS_TRACE_ENTRIES)
  }
  console.log(`[kg-three-trace] ${JSON.stringify(entry)}`)
}
const ignoreLogMessage = (text: string): boolean => {
  return (
    text.includes('not wrapped in act') ||
    text.includes('wrap-tests-with-act') ||
    text.includes('No character metrics for') ||
    text.includes('LaTeX-incompatible input and strict mode is set to')
  )
}
console.error = (...args: unknown[]) => {
  for (let i = 0; i < args.length; i += 1) {
    const v = args[i]
    if (typeof v !== 'string') continue
    if (ignoreLogMessage(v)) return
  }
  originalConsoleError(...args)
}
console.warn = (...args: unknown[]) => {
  for (let i = 0; i < args.length; i += 1) {
    const v = args[i]
    if (typeof v !== 'string') continue
    if (v.includes('WARNING: Multiple instances of Three.js being imported.')) {
      const win = globalThis as typeof globalThis & { window?: { __THREE__?: unknown } }
      pushThreeHarnessTrace('console.warn', {
        message: v,
        windowThree: win.window?.__THREE__ ?? null,
        stack: new Error('three-warning-trace').stack || '',
      })
    }
    if (ignoreLogMessage(v)) return
  }
  originalConsoleWarn(...args)
}

type WindowStub = Pick<
  Window,
  'addEventListener' | 'removeEventListener' | 'dispatchEvent' | 'setTimeout' | 'clearTimeout'
> & {
  HTMLIFrameElement?: typeof HTMLIFrameElement
  __KG_TEST_WINDOW_STUB__?: boolean
}

type GlobalWithWindowStub = typeof globalThis & { window?: WindowStub; navigator?: Navigator }

const g = globalThis as GlobalWithWindowStub

if (!g.navigator) {
  Object.defineProperty(g, 'navigator', {
    configurable: true,
    enumerable: false,
    value: { userAgent: 'node.js' } as Navigator,
  })
}

type LocalStorageLike = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  clear: () => void
  key: (index: number) => string | null
  length: number
}

const ensureLocalStorageStub = () => {
  const existingWindow = g.window as unknown as { localStorage?: unknown } | undefined
  const existingGlobal = g as unknown as { localStorage?: unknown }
  if (existingWindow?.localStorage && existingGlobal.localStorage) return

  const store = new Map<string, string>()
  const stub: LocalStorageLike = {
    get length() {
      return store.size
    },
    key: (index: number) => {
      const keys = Array.from(store.keys())
      return typeof keys[index] === 'string' ? keys[index] : null
    },
    getItem: (key: string) => {
      const v = store.get(String(key))
      return typeof v === 'string' ? v : null
    },
    setItem: (key: string, value: string) => {
      store.set(String(key), String(value))
    },
    removeItem: (key: string) => {
      store.delete(String(key))
    },
    clear: () => {
      store.clear()
    },
  }

  if (existingWindow && !existingWindow.localStorage) {
    existingWindow.localStorage = stub
  }
  if (!existingGlobal.localStorage) {
    existingGlobal.localStorage = stub
  }
}

const appRequire = createRequire(import.meta.url)
const resolvedReact = appRequire.resolve('react', { paths: [process.cwd()] })
const resolvedReactJsxRuntime = appRequire.resolve('react/jsx-runtime', { paths: [process.cwd()] })
const resolvedReactJsxDevRuntime = appRequire.resolve('react/jsx-dev-runtime', { paths: [process.cwd()] })
const resolvedReactDom = appRequire.resolve('react-dom', { paths: [process.cwd()] })
const resolvedReactDomClient = appRequire.resolve('react-dom/client', { paths: [process.cwd()] })
const resolvedThree = appRequire.resolve('three', { paths: [process.cwd()] })
const originalResolveFilename = (NodeModule as unknown as { _resolveFilename: unknown })._resolveFilename as (
  request: string,
  parent: unknown,
  isMain: boolean,
  options?: unknown,
) => string

;(NodeModule as unknown as { _resolveFilename: unknown })._resolveFilename = function (
  request: string,
  parent: unknown,
  isMain: boolean,
  options?: unknown,
) {
  if (request === 'three' || request.startsWith('three/') || request === '@react-three/fiber') {
    pushThreeHarnessTrace('resolve', {
      request,
      parent: readThreeHarnessParentId(parent),
    })
  }
  switch (request) {
    case 'react':
      return originalResolveFilename(resolvedReact, parent, isMain, options)
    case 'react/jsx-runtime':
      return originalResolveFilename(resolvedReactJsxRuntime, parent, isMain, options)
    case 'react/jsx-dev-runtime':
      return originalResolveFilename(resolvedReactJsxDevRuntime, parent, isMain, options)
    case 'react-dom':
      return originalResolveFilename(resolvedReactDom, parent, isMain, options)
    case 'react-dom/client':
      return originalResolveFilename(resolvedReactDomClient, parent, isMain, options)
    case 'three':
      return originalResolveFilename(resolvedThree, parent, isMain, options)
    default:
      return originalResolveFilename(request, parent, isMain, options)
  }
}

if (!g.window) {
  const stub = {} as WindowStub
  stub.addEventListener = () => {}
  stub.removeEventListener = () => {}
  stub.dispatchEvent = () => false
  stub.setTimeout = (handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
    setTimeout(handler as (...inner: unknown[]) => void, timeout, ...args) as unknown as number
  stub.clearTimeout = (handle: number) => clearTimeout(handle)
  try {
    const ctor = typeof HTMLIFrameElement !== 'undefined' ? HTMLIFrameElement : class {}
    stub.HTMLIFrameElement = ctor as typeof HTMLIFrameElement
  } catch {
    stub.HTMLIFrameElement = class {} as typeof HTMLIFrameElement
  }
  stub.__KG_TEST_WINDOW_STUB__ = true
  g.window = stub as Window & typeof globalThis & WindowStub
} else if (!g.window.HTMLIFrameElement) {
  try {
    const ctor = typeof HTMLIFrameElement !== 'undefined' ? HTMLIFrameElement : class {}
    g.window.HTMLIFrameElement = ctor as typeof HTMLIFrameElement
  } catch {
    g.window.HTMLIFrameElement = class {} as typeof HTMLIFrameElement
  }
}

const installThreeWindowProbe = () => {
  if (!traceThreeHarness || !g.window) return
  const probeTarget = g.window as WindowStub & { __THREE__?: unknown; __KG_THREE_TRACE_INSTALLED__?: unknown }
  if (probeTarget.__KG_THREE_TRACE_INSTALLED__ === true) return
  let currentThreeValue = probeTarget.__THREE__
  try {
    Object.defineProperty(probeTarget, '__THREE__', {
      configurable: true,
      enumerable: false,
      get() {
        pushThreeHarnessTrace('window.__THREE__.get', {
          value: currentThreeValue ?? null,
          stack: new Error('three-global-get').stack || '',
        })
        return currentThreeValue
      },
      set(value: unknown) {
        currentThreeValue = value
        pushThreeHarnessTrace('window.__THREE__.set', {
          value: currentThreeValue ?? null,
          stack: new Error('three-global-set').stack || '',
        })
      },
    })
    probeTarget.__KG_THREE_TRACE_INSTALLED__ = true
  } catch {
    void 0
  }
}

installThreeWindowProbe()

ensureLocalStorageStub()

const ensureAttachEventPolyfill = () => {
  try {
    const anyHTMLElement = globalThis as unknown as { HTMLElement?: { prototype?: { attachEvent?: unknown; detachEvent?: unknown } } }
    const proto = anyHTMLElement.HTMLElement?.prototype
    if (proto && typeof proto.attachEvent !== 'function') {
      Object.defineProperty(proto, 'attachEvent', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: () => void 0,
      })
    }
    if (proto && typeof proto.detachEvent !== 'function') {
      Object.defineProperty(proto, 'detachEvent', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: () => void 0,
      })
    }
  } catch {
    void 0
  }
}

ensureAttachEventPolyfill()

const ensureUrlObjectUrls = () => {
  const w = g.window as unknown as { URL?: typeof URL }
  const urlCtor = (globalThis as unknown as { URL?: typeof URL }).URL
  if (!urlCtor) return
  if (!w.URL) w.URL = urlCtor
  const urlAny = w.URL as unknown as {
    createObjectURL?: (obj: Blob) => string
    revokeObjectURL?: (url: string) => void
  }
  if (!urlAny.createObjectURL) {
    let n = 0
    urlAny.createObjectURL = () => `blob:kg-test-${Date.now()}-${++n}`
  }
  if (!urlAny.revokeObjectURL) urlAny.revokeObjectURL = () => {}
}

ensureUrlObjectUrls()

if (!g.window.requestAnimationFrame) {
  g.window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    return setTimeout(callback, 0) as unknown as number
  }
}
if (!g.window.cancelAnimationFrame) {
  g.window.cancelAnimationFrame = (id: number) => {
    clearTimeout(id)
  }
}
if (!g.requestAnimationFrame) {
  g.requestAnimationFrame = g.window.requestAnimationFrame.bind(g.window)
}
if (!g.cancelAnimationFrame) {
  g.cancelAnimationFrame = g.window.cancelAnimationFrame.bind(g.window)
}

if (!g.NodeFilter) {
  g.NodeFilter = {
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
  } as unknown as {
    readonly FILTER_ACCEPT: 1
    readonly FILTER_REJECT: 2
    readonly FILTER_SKIP: 3
    readonly SHOW_ALL: 4294967295
    readonly SHOW_ELEMENT: 1
    readonly SHOW_ATTRIBUTE: 2
    readonly SHOW_TEXT: 4
    readonly SHOW_CDATA_SECTION: 8
    readonly SHOW_ENTITY_REFERENCE: 16
    readonly SHOW_ENTITY: 32
    readonly SHOW_PROCESSING_INSTRUCTION: 64
    readonly SHOW_COMMENT: 128
    readonly SHOW_DOCUMENT: 256
    readonly SHOW_DOCUMENT_TYPE: 512
    readonly SHOW_DOCUMENT_FRAGMENT: 1024
    readonly SHOW_NOTATION: 2048
  }
}

if (!g.ResizeObserver) {
  g.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

async function main() {
  const { completeSourceFilesBootstrap } = await import('@/features/source-files/sourceFilesBootstrapReadiness')
  completeSourceFilesBootstrap()
  const { runAllTests } = await import('@/tests/run')
  const { readCurrentRunningTest } = await import('@/tests/runner/execTest')
  const startedAt = Date.now()
  const timeoutMs = (() => {
    const raw = Number(process.env.KG_TEST_TIMEOUT_MS)
    if (Number.isFinite(raw) && raw > 1_000) return Math.max(30_000, Math.min(30 * 60_000, Math.floor(raw)))
    return 10 * 60_000
  })()
  const results = await Promise.race([
    runAllTests(),
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        const activeTest = readCurrentRunningTest()
        const activeSuffix = activeTest
          ? `; active test=${activeTest.name}; activeElapsedMs=${activeTest.elapsedMs}`
          : ''
        reject(new Error(`tests timed out after ${timeoutMs}ms${activeSuffix}`))
      }, timeoutMs),
    ),
  ])
  const finishedAt = Date.now()
  const durationMs = finishedAt - startedAt
  const failed = results.filter(r => !r.ok)
  results.forEach(r => {
    const tag = r.ok ? 'OK' : 'FAIL'
    console.log(`${tag} ${r.name}${r.error ? ` — ${r.error}` : ''}`)
  })
  const okCount = results.length - failed.length
  console.log(`SUMMARY total=${results.length} ok=${okCount} failed=${failed.length}`)
  if (failed.length > 0) {
    failed.forEach(r => {
      console.log(`FAIL ${r.name}${r.error ? ` — ${r.error}` : ''}`)
    })
  }
  try {
    const rootDir = path.resolve(process.cwd(), '..')
    const logDir = path.join(rootDir, 'data', 'outputs')
    const logPath = path.join(logDir, 'runtime-events.jsonl')
    fs.mkdirSync(logDir, { recursive: true })
    const payload = {
      key: 'runtime:event:canvas:tests:runAllTests',
      node_id: 'canvas/src/tests/run.ts',
      eventType: 'call',
      status: failed.length > 0 ? 'error' : 'ok',
      durationMs,
      stackTraceSnippet: 'canvas/src/tests/run.ts: runAllTests',
    }
    fs.appendFileSync(logPath, JSON.stringify(payload) + '\n', { encoding: 'utf8' })
  } catch {
    void 0
  }
  process.exit(failed.length > 0 ? 1 : 0)
}

main()
