import type { WorkspaceFs } from '@/features/workspace-fs/types'
import type { GraphNode } from '@/lib/graph/types'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import type { GeneratedBinaryAsset } from '@/features/chat/byteplusRunGeneration'
import { writeRichMediaWidgetRunOutputArtifact } from '@/features/chat/richMediaRun'
import type { HtmlVideoEngineRegistry } from './htmlVideoEngineRegistry'
import { resolveHtmlVideoEngine } from './htmlVideoEngineRegistry'
import type { RenderResult, RenderSpec } from './htmlVideoRendererSsot'
import { validateRenderSpec } from './htmlVideoRendererSpec'

export type HtmlVideoRunOk = {
  ok: true
  renderJobId: string
  kind: 'video'
  blob: Blob
  engineId: string
  renderLog?: string[]
  outputPath: string | null
  outputManifestPath: string | null
  outputStorageUrl: string | null
}

const seekFailures = ['protocol_version_unsupported', 'capability_missing', 'seek_failed', 'seek_timeout'] as const
type SeekFailure = typeof seekFailures[number]

export type HtmlVideoRunError = {
  ok: false
  errorCode: 'invalid_spec' | 'engine_not_configured' | 'render_failed' | 'artifact_write_failed' | SeekFailure
  engineId?: string
  reason?: string
  field?: string
}

export type HtmlVideoRunResult = HtmlVideoRunOk | HtmlVideoRunError

const stableNormalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableNormalize)
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  return Object.keys(record)
    .sort((left, right) => left.localeCompare(right))
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = stableNormalize(record[key])
      return acc
    }, {})
}

export const stableStringifyHtmlVideoValue = (value: unknown): string => JSON.stringify(stableNormalize(value))

export function buildRenderJobId(spec: Readonly<RenderSpec>, engineId: string): string {
  return buildScopedGraphSemanticKey('html-video-render', {
    graphSemanticKey: stableStringifyHtmlVideoValue({
      html: spec.html,
      css: spec.css ?? '',
      data: spec.data ?? {},
      durationMs: spec.durationMs,
      fps: spec.fps,
      width: spec.width,
      height: spec.height,
      engineId,
    }),
  })
}

const readErrorReason = (error: unknown): string => {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error || 'unknown error')
}

const readVideoBlobMimeType = (blob: Blob): string => String(blob.type || '').toLowerCase().split(';')[0]?.trim() || ''

const resolveVideoArtifactExtension = (blob: Blob): string => {
  const mimeType = readVideoBlobMimeType(blob)
  if (mimeType === 'video/mp4') return 'mp4'
  if (mimeType === 'video/webm') return 'webm'
  const subtype = mimeType.startsWith('video/') ? mimeType.slice('video/'.length).replace(/[^a-z0-9]+/g, '') : ''
  return subtype || 'mp4'
}

const validateRenderResult = (result: RenderResult, spec: Readonly<RenderSpec>, engineId: string): string | null => {
  if (!(result.blob instanceof Blob)) return 'engine returned a non-Blob result'
  if (!readVideoBlobMimeType(result.blob).startsWith('video/')) return 'engine returned a blob that is not video'
  if (result.blob.size <= 0) return 'engine returned an empty video blob'
  if (result.engineId !== engineId) return 'engine returned mismatched engineId'
  if (result.durationMs !== spec.durationMs) return 'engine returned mismatched durationMs'
  if (result.fps !== spec.fps) return 'engine returned mismatched fps'
  if (result.width !== spec.width) return 'engine returned mismatched width'
  if (result.height !== spec.height) return 'engine returned mismatched height'
  return null
}

const buildRenderUrl = (blob: Blob, renderJobId: string): string => {
  const urlFactory = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
    ? URL.createObjectURL
    : null
  if (urlFactory) return urlFactory(blob)
  const mimeType = readVideoBlobMimeType(blob) || 'video/mp4'
  return `data:${mimeType};name=${encodeURIComponent(renderJobId)}`
}

export async function runHtmlVideoRenderJob(args: {
  spec: unknown
  node: GraphNode
  registry: HtmlVideoEngineRegistry
  workspacePath?: string | null
  fs?: WorkspaceFs | null
}): Promise<HtmlVideoRunResult> {
  const validation = validateRenderSpec(args.spec)
  if (validation.ok === false) {
    return {
      ok: false,
      errorCode: validation.errorCode,
      field: validation.field,
      reason: validation.reason,
    }
  }

  const resolution = resolveHtmlVideoEngine(args.registry, validation.spec.engineHint)
  if (resolution.ok === false) {
    return {
      ok: false,
      errorCode: resolution.errorCode,
      engineId: resolution.engineId,
      reason: resolution.engineId ? `engine is not registered: ${resolution.engineId}` : 'engine is not configured',
    }
  }

  const engineId = String(resolution.engine.engineId || '').trim()
  const renderJobId = buildRenderJobId(validation.spec, engineId)
  let result: RenderResult
  try {
    result = await resolution.engine.render(validation.spec)
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    return {
      ok: false,
      errorCode: seekFailures.find(value => value === code) ?? 'render_failed',
      engineId,
      reason: readErrorReason(error),
    }
  }

  const resultError = validateRenderResult(result, validation.spec, engineId)
  if (resultError) return { ok: false, errorCode: 'render_failed', engineId, reason: resultError }

  // Native engines own diagnostics. Copy a bounded UTF-8 prefix into the result and manifest.
  const renderLog: string[] = []
  let logBytes = 0
  const encoder = new TextEncoder()
  for (const line of result.renderLog ?? []) {
    if (typeof line !== 'string' || line.length > 4096) break
    logBytes += encoder.encode(line).byteLength + 1
    if (logBytes > 4096) break
    renderLog.push(line)
  }
  const asset: GeneratedBinaryAsset = {
    blob: result.blob,
    renderUrl: buildRenderUrl(result.blob, renderJobId),
    sourceUrl: '',
    model: engineId,
  }

  try {
    const output = await writeRichMediaWidgetRunOutputArtifact({
      workspacePath: args.workspacePath,
      node: args.node,
      kind: 'video',
      extension: resolveVideoArtifactExtension(result.blob),
      asset,
      fs: args.fs,
      manifestMetadata: [
        ['engineId', engineId],
        ['renderJobId', renderJobId],
        ['durationMs', String(result.durationMs)],
        ['fps', String(result.fps)],
        ['width', String(result.width)],
        ['height', String(result.height)],
        ...(renderLog.length ? [['renderLog', renderLog.join('\n')] as const] : []),
      ],
    })
    return {
      ok: true,
      renderJobId,
      kind: 'video',
      renderLog,
      blob: result.blob,
      engineId,
      outputPath: output.outputPath,
      outputManifestPath: output.outputPath ? output.outputManifestPath : null,
      outputStorageUrl: output.outputStorageUrl || null,
    }
  } catch (error) {
    return {
      ok: false,
      errorCode: 'artifact_write_failed',
      engineId,
      reason: readErrorReason(error),
    }
  }
}
