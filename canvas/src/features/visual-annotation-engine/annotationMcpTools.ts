import type { GraphNode } from '@/lib/graph/types'
import type { AnnotationRunResult } from './annotationEngineSsot'
import { ANNOTATION_SCHEMA_VERSION } from './annotationEngineSsot'
import { createAnnotationWorkerHandle, runAnnotationJob, type AnnotationWorkerHandle } from './annotationOrchestrator'

export type McpAnnotationOutput = {
  ok: boolean
  annotation_id: string
  asset_url: string
  model_id: string
  schema_version: string
  tasks: Record<string, unknown>
  error?: { code: string; message: string }
}

const MCP_ANNOTATION_NODE: GraphNode = {
  id: 'agenticgraph-mcp-annotation',
  label: 'MCP Annotation',
  type: 'AnnotationEngine',
  properties: {},
} as GraphNode

const toMcpAnnotationOutput = (result: AnnotationRunResult, assetUrl: string): McpAnnotationOutput => {
  if (result.ok === true) {
    return {
      ok: true,
      annotation_id: result.annotationId,
      asset_url: result.assetUrl,
      model_id: result.modelId,
      schema_version: result.schemaVersion,
      tasks: result.tasks,
    }
  }
  return {
    ok: false,
    annotation_id: '',
    asset_url: assetUrl,
    model_id: result.modelId || '',
    schema_version: result.errorCode === 'inference_failed' ? ANNOTATION_SCHEMA_VERSION : '',
    tasks: {},
    error: {
      code: result.errorCode,
      message: result.field ? `${result.field}: ${result.reason || result.errorCode}` : result.reason || result.errorCode,
    },
  }
}

export async function handleAnnotateImageTool(input: {
  asset_url: string
  tasks: string[]
  model_hint?: string
  worker?: AnnotationWorkerHandle | null
}): Promise<McpAnnotationOutput> {
  const assetUrl = String(input?.asset_url || '')
  const result = await runAnnotationJob({
    spec: {
      assetUrl,
      assetType: 'image',
      tasks: Array.isArray(input?.tasks) ? input.tasks : [],
      ...(typeof input?.model_hint === 'string' ? { modelHint: input.model_hint } : {}),
    },
    node: MCP_ANNOTATION_NODE,
    worker: input.worker || createAnnotationWorkerHandle(),
  })
  return toMcpAnnotationOutput(result, assetUrl)
}

export async function handleAnnotateVideoFrameTool(input: {
  asset_url: string
  tasks: string[]
  frame_timestamp_ms: number
  model_hint?: string
  worker?: AnnotationWorkerHandle | null
}): Promise<McpAnnotationOutput> {
  const assetUrl = String(input?.asset_url || '')
  const result = await runAnnotationJob({
    spec: {
      assetUrl,
      assetType: 'video_frame',
      tasks: Array.isArray(input?.tasks) ? input.tasks : [],
      frameTimestampMs: input?.frame_timestamp_ms,
      ...(typeof input?.model_hint === 'string' ? { modelHint: input.model_hint } : {}),
    },
    node: MCP_ANNOTATION_NODE,
    worker: input.worker || createAnnotationWorkerHandle(),
  })
  return toMcpAnnotationOutput(result, assetUrl)
}
