import type { MermaidInitConfig } from '@/features/panels/views/preview-panel/ui/mermaidConfig'

export type MermaidRuntimeRenderResult = {
  svg: string
  bindFunctions?: (element: Element) => void
}

export type MermaidRuntimeApi = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, code: string) => Promise<MermaidRuntimeRenderResult | string>
}

type MermaidRenderInitStrategy = 'auto' | 'standard'

type MermaidRuntimeBranch = 'standard'

const isMermaidApi = (val: unknown): val is MermaidRuntimeApi => {
  if (!val || typeof val !== 'object') return false
  const v = val as Record<string, unknown>
  return typeof v.initialize === 'function' && typeof v.render === 'function'
}

const getTestMermaidApi = (): MermaidRuntimeApi | null => {
  const anyGlobal = globalThis as unknown as { __AG_TEST_MERMAID_API__?: unknown }
  const candidate = anyGlobal.__AG_TEST_MERMAID_API__
  return isMermaidApi(candidate) ? candidate : null
}

let mermaidModulePromise: Promise<MermaidRuntimeApi> | null = null
let lastStandardInitKey = ''

const mergeMermaidConfig = (config: MermaidInitConfig): MermaidInitConfig => {
  const next = { ...(config || {}) }
  const flowchart =
    next.flowchart && typeof next.flowchart === 'object' && !Array.isArray(next.flowchart)
      ? { ...(next.flowchart as Record<string, unknown>) }
      : {}
  flowchart.htmlLabels = false
  next.flowchart = flowchart
  if (!('securityLevel' in next)) next.securityLevel = 'strict'
  return next
}

export const resolveMermaidRuntimeBranch = (_config: MermaidInitConfig, _code = ''): MermaidRuntimeBranch => {
  return 'standard'
}

export const cleanupMermaidRenderArtifacts = (renderId: string): void => {
  const id = String(renderId || '').trim()
  if (!id || typeof document === 'undefined') return
  try {
    const wrapper = document.getElementById(`d${id}`)
    if (wrapper && wrapper.parentElement === document.body) wrapper.remove()
  } catch {
    void 0
  }
  try {
    const orphan = document.getElementById(id)
    if (orphan && orphan.parentElement === document.body) orphan.remove()
  } catch {
    void 0
  }
}

export const loadMermaidRuntimeApi = async (): Promise<MermaidRuntimeApi> => {
  const stub = getTestMermaidApi()
  if (stub) return stub
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid').then(mod => {
      const candidate: unknown = (mod as { default?: unknown }).default ?? mod
      if (!isMermaidApi(candidate)) {
        throw new Error('Mermaid module did not match expected API')
      }
      return candidate
    }).catch(err => {
      mermaidModulePromise = null
      throw err
    })
  }
  return mermaidModulePromise
}

export const ensureStandardMermaidInitialized = async (config: MermaidInitConfig): Promise<MermaidRuntimeApi> => {
  const mermaid = await loadMermaidRuntimeApi()
  const mergedConfig = mergeMermaidConfig(config)
  const key = JSON.stringify(mergedConfig)
  if (key !== lastStandardInitKey) {
    try {
      mermaid.initialize({ startOnLoad: false, ...mergedConfig })
    } finally {
      lastStandardInitKey = key
    }
  }
  return mermaid
}

export const ensureMermaidInitialized = async (config: MermaidInitConfig, code = ''): Promise<MermaidRuntimeApi> => {
  void code
  return ensureStandardMermaidInitialized(config)
}

export const renderMermaidWithRuntime = async (args: {
  renderId: string
  code: string
  config: MermaidInitConfig
  initStrategy?: MermaidRenderInitStrategy
}): Promise<MermaidRuntimeRenderResult> => {
  const renderId = String(args.renderId || '').trim()
  const code = String(args.code || '')
  const config = args.config
  const initStrategy = args.initStrategy === 'standard' ? 'standard' : 'auto'
  const mermaid = initStrategy === 'standard'
    ? await ensureStandardMermaidInitialized(config)
    : await ensureMermaidInitialized(config, code)
  cleanupMermaidRenderArtifacts(renderId)
  try {
    const out = await mermaid.render(renderId, code)
    if (typeof out === 'string') return { svg: out }
    return {
      svg: String(out.svg || ''),
      ...(typeof out.bindFunctions === 'function' ? { bindFunctions: out.bindFunctions } : {}),
    }
  } finally {
    cleanupMermaidRenderArtifacts(renderId)
  }
}
