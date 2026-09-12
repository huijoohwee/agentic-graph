export type RouterBasenameRuntime = {
  pathname?: unknown
  rootAliasBasePath?: unknown
}

const ROOT_ALIAS_META_NAME = 'x-agentic-graph-root-alias'
const PRODUCT_ENTRY_BASE_PATH = '/81rv10'

function normalizeBasePath(value: unknown): string | undefined {
  const raw = String(value || '').trim() || '/'
  if (raw === '/' || raw === '') return undefined
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`
  const noTrailing = withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading
  if (noTrailing === '/' || noTrailing === '') return undefined
  return noTrailing
}

function normalizePathname(value: unknown): string {
  const raw = String(value || '').trim() || '/'
  const pathname = raw.startsWith('/') ? raw : `/${raw}`
  const noTrailing = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return noTrailing || '/'
}

function readRuntimePathname(runtime?: RouterBasenameRuntime): string | undefined {
  if (runtime && Object.prototype.hasOwnProperty.call(runtime, 'pathname')) {
    return normalizePathname(runtime.pathname)
  }
  if (typeof window === 'undefined') return undefined
  return normalizePathname(window.location?.pathname)
}

function readRuntimeRootAliasBasePath(runtime?: RouterBasenameRuntime): string | undefined {
  if (runtime && Object.prototype.hasOwnProperty.call(runtime, 'rootAliasBasePath')) {
    return normalizeBasePath(runtime.rootAliasBasePath)
  }
  if (typeof document === 'undefined') return undefined
  const raw = document
    .querySelector(`meta[name="${ROOT_ALIAS_META_NAME}"]`)
    ?.getAttribute('content')
  return normalizeBasePath(raw)
}

export function isRouterRootAliasRuntime(baseUrl: unknown, runtime?: RouterBasenameRuntime): boolean {
  const basename = normalizeBasePath(baseUrl)
  const rootAliasBasePath = readRuntimeRootAliasBasePath(runtime)
  if (!rootAliasBasePath || readRuntimePathname(runtime) !== '/') return false
  return !basename || rootAliasBasePath === basename
}

function resolveProductEntryBasename(baseUrl: unknown, runtime?: RouterBasenameRuntime): string | undefined {
  const basename = normalizeBasePath(baseUrl)
  if (basename && basename !== '/agentic-graph') return undefined
  const pathname = readRuntimePathname(runtime)
  return pathname === PRODUCT_ENTRY_BASE_PATH || pathname?.startsWith(`${PRODUCT_ENTRY_BASE_PATH}/`)
    ? PRODUCT_ENTRY_BASE_PATH : undefined
}

export function resolveRouterBasename(baseUrl: unknown, runtime?: RouterBasenameRuntime): string | undefined {
  const productEntry = resolveProductEntryBasename(baseUrl, runtime)
  if (productEntry) return productEntry
  const basename = normalizeBasePath(baseUrl)
  if (!basename) return undefined

  if (isRouterRootAliasRuntime(baseUrl, runtime)) return undefined

  return basename
}

export function resolveLiveCanvasHeroEnterHref(baseUrl: unknown, runtime?: RouterBasenameRuntime): string {
  const basename = resolveProductEntryBasename(baseUrl, runtime)
    || normalizeBasePath(baseUrl) || readRuntimeRootAliasBasePath(runtime)
  return `${basename || ''}/`
}
