import { buildLocalFsFetchPath } from '@/lib/url'
import { reportRuntimeTrace } from '@/lib/debug/runtimeTrace'
import { importNodeFsPromises, importNodePath } from './workspaceSeedNodeModules'
import { readWorkspaceDocsMirrorTextViaFetch as readTextViaFetch } from './workspaceSeedProviderStorageCache'
import { isAgenticGraphWorkspaceSeedsPath } from 'grph-shared/collaboration/documentRepositoryAuthority'
import { normalizeMirrorRelPath, buildWorkspaceSeedAbsolutePathCandidates, resolveWorkspaceDocsMirrorAbsolutePath } from './workspaceSeedProviderPaths'
const AG_FS_WRITE_PATH = '/__agentic_os_fs_write'

// #region debug-point A:workspace-mirror-bootstrap
export const WORKSPACE_MIRROR_TRACE_SCOPE = 'workspace-mirror'
let workspaceMirrorTraceSequence = 0
export const nextWorkspaceMirrorTraceId = (label: string): string => `${label}:${Date.now()}:${workspaceMirrorTraceSequence += 1}`
export const reportWorkspaceMirrorTrace = (args: {
  hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E'
  traceId: string
  location: string
  msg: string
  data?: Record<string, unknown>
}): void => {
  reportRuntimeTrace({
    scope: WORKSPACE_MIRROR_TRACE_SCOPE,
    runId: 'runtime',
    hypothesisId: args.hypothesisId,
    traceId: args.traceId,
    location: args.location,
    msg: args.msg,
    data: args.data || {},
  })
}
// #endregion
export const isHiddenDocumentWriteSkipActive = (): boolean => {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}
export const encodeArrayBufferToBase64 = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const chunkSize = 0x8000
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    chunks.push(String.fromCharCode(...chunk))
  }
  return btoa(chunks.join(''))
}

export const readTextViaNodeFs = async (absolutePath: string): Promise<string | null> => {
  if (typeof window !== 'undefined') return null
  try {
    const fs = await importNodeFsPromises()
    const text = String(await fs.readFile(absolutePath, 'utf8')).trim()
    return text || null
  } catch {
    return null
  }
}

export const writeTextViaLocalFsProxy = async (
  absolutePath: string,
  text: string,
  workspacePath?: string,
  allowBlankText?: boolean,
): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return false
  if (isHiddenDocumentWriteSkipActive()) return false
  const traceId = nextWorkspaceMirrorTraceId('write-text')
  try {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      // #region debug-point D:fs-write-timeout
      reportWorkspaceMirrorTrace({
        hypothesisId: 'D',
        traceId,
        location: 'workspaceSeedProvider.ts:writeTextViaLocalFsProxy.timeout',
        msg: '__agentic_os_fs_write text request timeout fired abort controller',
        data: { absolutePath, textLength: String(text ?? '').length },
      })
      // #endregion
      try {
        controller.abort()
      } catch {
        void 0
      }
    }, 5000)
    try {
      // #region debug-point A:fs-write-start
      reportWorkspaceMirrorTrace({
        hypothesisId: 'A',
        traceId,
        location: 'workspaceSeedProvider.ts:writeTextViaLocalFsProxy.fetch',
        msg: '__agentic_os_fs_write text request started',
        data: { absolutePath, textLength: String(text ?? '').length },
      })
      // #endregion
      const response = await fetch(AG_FS_WRITE_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(absolutePath ? { path: absolutePath } : {}),
          text: String(text ?? ''),
          ...(workspacePath ? { workspacePath } : {}),
          ...(allowBlankText === true ? { allowBlankText: true } : {}),
        }),
        signal: controller.signal,
      })
      // #region debug-point B:fs-write-response
      reportWorkspaceMirrorTrace({
        hypothesisId: 'B',
        traceId,
        location: 'workspaceSeedProvider.ts:writeTextViaLocalFsProxy.response',
        msg: '__agentic_os_fs_write text request settled',
        data: { absolutePath, ok: response.ok, status: response.status },
      })
      // #endregion
      if (!response.ok) return false
      const result = await response.clone().json().catch(() => null) as {
        changed?: unknown
      } | null
      return result?.changed !== false
    } finally {
      window.clearTimeout(timeoutId)
    }
  } catch (error) {
    // #region debug-point C:fs-write-catch
    reportWorkspaceMirrorTrace({
      hypothesisId: 'C',
      traceId,
      location: 'workspaceSeedProvider.ts:writeTextViaLocalFsProxy.catch',
      msg: '__agentic_os_fs_write text request threw',
      data: {
        absolutePath,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error ?? ''),
        aborted: error instanceof DOMException ? error.name === 'AbortError' : false,
      },
    })
    // #endregion
    return false
  }
}

export const writeBytesViaLocalFsProxy = async (absolutePath: string, bytes: ArrayBuffer | Uint8Array): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return false
  if (isHiddenDocumentWriteSkipActive()) return false
  const traceId = nextWorkspaceMirrorTraceId('write-bytes')
  try {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      // #region debug-point D:fs-bytes-timeout
      reportWorkspaceMirrorTrace({
        hypothesisId: 'D',
        traceId,
        location: 'workspaceSeedProvider.ts:writeBytesViaLocalFsProxy.timeout',
        msg: '__agentic_os_fs_write bytes request timeout fired abort controller',
        data: { absolutePath, byteLength: bytes instanceof Uint8Array ? bytes.byteLength : bytes.byteLength || 0 },
      })
      // #endregion
      try {
        controller.abort()
      } catch {
        void 0
      }
    }, 5000)
    try {
      // #region debug-point A:fs-bytes-start
      reportWorkspaceMirrorTrace({
        hypothesisId: 'A',
        traceId,
        location: 'workspaceSeedProvider.ts:writeBytesViaLocalFsProxy.fetch',
        msg: '__agentic_os_fs_write bytes request started',
        data: { absolutePath, byteLength: bytes instanceof Uint8Array ? bytes.byteLength : bytes.byteLength || 0 },
      })
      // #endregion
      const response = await fetch(AG_FS_WRITE_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: absolutePath,
          base64: encodeArrayBufferToBase64(bytes),
          encoding: 'base64',
        }),
        signal: controller.signal,
      })
      // #region debug-point B:fs-bytes-response
      reportWorkspaceMirrorTrace({
        hypothesisId: 'B',
        traceId,
        location: 'workspaceSeedProvider.ts:writeBytesViaLocalFsProxy.response',
        msg: '__agentic_os_fs_write bytes request settled',
        data: { absolutePath, ok: response.ok, status: response.status },
      })
      // #endregion
      return response.ok
    } finally {
      window.clearTimeout(timeoutId)
    }
  } catch (error) {
    // #region debug-point C:fs-bytes-catch
    reportWorkspaceMirrorTrace({
      hypothesisId: 'C',
      traceId,
      location: 'workspaceSeedProvider.ts:writeBytesViaLocalFsProxy.catch',
      msg: '__agentic_os_fs_write bytes request threw',
      data: {
        absolutePath,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error ?? ''),
        aborted: error instanceof DOMException ? error.name === 'AbortError' : false,
      },
    })
    // #endregion
    return false
  }
}

export const readExistingMirrorText = async (absolutePath: string): Promise<string | null> => {
  const absoluteViaFetch = buildLocalFsFetchPath(absolutePath)
  if (absoluteViaFetch) {
    const text = await readTextViaFetch(absoluteViaFetch)
    if (text !== null) return text
  }
  return readTextViaNodeFs(absolutePath)
}

export const normalizeMirrorTextForNoopComparison = (value: string): string =>
  String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '')

export const shouldSkipEquivalentMirrorWrite = async (args: {
  absolutePath: string
  text: string
}): Promise<boolean> => {
  const existing = await readExistingMirrorText(args.absolutePath)
  if (existing == null) return false
  const next = String(args.text ?? '')
  if (existing === next) return true
  return normalizeMirrorTextForNoopComparison(existing) === normalizeMirrorTextForNoopComparison(next)
}

export const shouldBlockBlankMirrorOverwrite = async (args: {
  absolutePath: string
  text: string
  allowBlankText?: boolean
}): Promise<boolean> => {
  if (args.allowBlankText === true) return false
  if (String(args.text || '').trim()) return false
  const existing = await readExistingMirrorText(args.absolutePath)
  return !!String(existing || '').trim()
}

export const ensureFolderViaLocalFsProxy = async (absolutePath: string, workspacePath?: string): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return false
  if (isHiddenDocumentWriteSkipActive()) return false
  const traceId = nextWorkspaceMirrorTraceId('mkdir')
  try {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      // #region debug-point D:fs-mkdir-timeout
      reportWorkspaceMirrorTrace({
        hypothesisId: 'D',
        traceId,
        location: 'workspaceSeedProvider.ts:ensureFolderViaLocalFsProxy.timeout',
        msg: '__agentic_os_fs_write mkdir request timeout fired abort controller',
        data: { absolutePath },
      })
      // #endregion
      try {
        controller.abort()
      } catch {
        void 0
      }
    }, 5000)
    try {
      // #region debug-point A:fs-mkdir-start
      reportWorkspaceMirrorTrace({
        hypothesisId: 'A',
        traceId,
        location: 'workspaceSeedProvider.ts:ensureFolderViaLocalFsProxy.fetch',
        msg: '__agentic_os_fs_write mkdir request started',
        data: { absolutePath },
      })
      // #endregion
      const response = await fetch(AG_FS_WRITE_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(absolutePath ? { path: absolutePath } : {}),
          mkdirOnly: true,
          ...(workspacePath ? { workspacePath } : {}),
        }),
        signal: controller.signal,
      })
      // #region debug-point B:fs-mkdir-response
      reportWorkspaceMirrorTrace({
        hypothesisId: 'B',
        traceId,
        location: 'workspaceSeedProvider.ts:ensureFolderViaLocalFsProxy.response',
        msg: '__agentic_os_fs_write mkdir request settled',
        data: { absolutePath, ok: response.ok, status: response.status },
      })
      // #endregion
      return response.ok
    } finally {
      window.clearTimeout(timeoutId)
    }
  } catch (error) {
    // #region debug-point C:fs-mkdir-catch
    reportWorkspaceMirrorTrace({
      hypothesisId: 'C',
      traceId,
      location: 'workspaceSeedProvider.ts:ensureFolderViaLocalFsProxy.catch',
      msg: '__agentic_os_fs_write mkdir request threw',
      data: {
        absolutePath,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error ?? ''),
        aborted: error instanceof DOMException ? error.name === 'AbortError' : false,
      },
    })
    // #endregion
    return false
  }
}

export async function upsertWorkspaceInitializationSeedText(args: {
  basename: string
  text: string
}): Promise<boolean> {
  const absolutePath = buildWorkspaceSeedAbsolutePathCandidates({
    basename: args.basename,
    relPathCandidates: [],
  })[0] || null
  if (!absolutePath) return false
  if (typeof window !== 'undefined') {
    return writeTextViaLocalFsProxy(absolutePath, args.text)
  }
  try {
    const fs = await importNodeFsPromises()
    const path = await importNodePath()
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, String(args.text ?? ''), 'utf8')
    return true
  } catch {
    return false
  }
}

export async function ensureWorkspaceDocsMirrorFolder(args: {
  workspacePath: string
}): Promise<boolean> {
  if (isAgenticGraphWorkspaceSeedsPath(args.workspacePath)) {
    return typeof window !== 'undefined'
      ? ensureFolderViaLocalFsProxy('', args.workspacePath)
      : false
  }
  const absolutePath = resolveWorkspaceDocsMirrorAbsolutePath(args.workspacePath)
  if (!absolutePath) return false
  if (typeof window !== 'undefined') {
    return ensureFolderViaLocalFsProxy(absolutePath, args.workspacePath)
  }
  try {
    const fs = await importNodeFsPromises()
    await fs.mkdir(absolutePath, { recursive: true })
    return true
  } catch {
    return false
  }
}

export async function ensureWorkspaceChatMirrorFolder(args: {
  workspacePath: string
}): Promise<boolean> {
  const absolutePath = resolveWorkspaceDocsMirrorAbsolutePath(args.workspacePath)
  if (!absolutePath) return false
  if (typeof window !== 'undefined') {
    return ensureFolderViaLocalFsProxy(absolutePath)
  }
  try {
    const fs = await importNodeFsPromises()
    await fs.mkdir(absolutePath, { recursive: true })
    return true
  } catch {
    return false
  }
}

export async function upsertWorkspaceChatMirrorText(args: {
  workspacePath: string
  text: string
}): Promise<boolean> {
  const absolutePath = resolveWorkspaceDocsMirrorAbsolutePath(args.workspacePath)
  if (!absolutePath) return false
  if (typeof window !== 'undefined') {
    return writeTextViaLocalFsProxy(absolutePath, args.text)
  }
  try {
    const fs = await importNodeFsPromises()
    const path = await importNodePath()
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, String(args.text ?? ''), 'utf8')
    return true
  } catch {
    return false
  }
}

export async function upsertWorkspaceChatMirrorBytes(args: {
  workspacePath: string
  bytes: ArrayBuffer | Uint8Array
}): Promise<boolean> {
  const absolutePath = resolveWorkspaceDocsMirrorAbsolutePath(args.workspacePath)
  if (!absolutePath) return false
  const bytes = args.bytes instanceof Uint8Array ? args.bytes : new Uint8Array(args.bytes)
  if (typeof window !== 'undefined') {
    return writeBytesViaLocalFsProxy(absolutePath, bytes)
  }
  try {
    const fs = await importNodeFsPromises()
    const path = await importNodePath()
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, bytes)
    return true
  } catch {
    return false
  }
}

export async function deleteWorkspaceInitializationSeedText(args: {
  basename: string
}): Promise<boolean> {
  const absolutePath = buildWorkspaceSeedAbsolutePathCandidates({
    basename: args.basename,
    relPathCandidates: [],
  })[0] || null
  if (!absolutePath || typeof window !== 'undefined') return false
  try {
    const fs = await importNodeFsPromises()
    await fs.unlink(absolutePath)
    return true
  } catch {
    return false
  }
}
