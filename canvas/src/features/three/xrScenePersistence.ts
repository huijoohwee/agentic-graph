import { useGraphStore } from '@/hooks/useGraphStore'
import { serializeXrMotionReferencePlan, XR_MOTION_REFERENCE_GRAPH_METADATA_KEY } from './xrMotionReferenceModel'
import { markXrMotionReferenceSaved, readXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { XR_PHYSICS_GRAPH_METADATA_KEY } from './xrPhysicsModel'
import { markXrPhysicsRuntimeSaved, serializeXrPhysicsRuntimeWorld } from './xrPhysicsRuntime'
import type { JSONValue } from '@/lib/graph/types'
import { normalizeComposedSourcePath } from '@/features/source-files/composedSourceSelection'
import { isCanonicalWorkspaceSeedPath } from '@/features/workspace-fs/workspaceCanonicalSeedBundle'
import { createWorkspacePersistedFs } from '@/features/workspace-fs/workspaceFsPersisted'
import { readWorkspaceSourceTextSnapshot } from '@/features/workspace-fs/workspaceSourceTextTransaction'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'
import yaml from 'js-yaml'

export type XrAuthoredSceneSaveResult = Readonly<{ ok: boolean; message: string }>

/** The visible Save action proves the authored Markdown reached durable browser storage. */
export async function persistXrSceneToAuthoredSource(): Promise<XrAuthoredSceneSaveResult> {
  const before = useGraphStore.getState()
  const path = normalizeComposedSourcePath(before.markdownDocumentName)
  if (!before.graphData || !path || !before.markdownDocumentText) {
    return { ok: false, message: 'Open an authored Markdown scene before saving.' }
  }
  if (isCanonicalWorkspaceSeedPath(path)) {
    return { ok: false, message: 'Create or import a local scene copy before saving; bundled examples reset on reload.' }
  }
  const plan = readXrMotionReferenceRuntime().plan
  const serialized = serializeXrMotionReferencePlan(plan)
  before.updateGraphMetadata({ [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: serialized })
  const after = useGraphStore.getState()
  const expectedText = after.markdownDocumentText
  if (after.graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY] !== serialized) {
    return { ok: false, message: 'Scene metadata was not accepted by the active graph.' }
  }
  if (normalizeComposedSourcePath(after.markdownDocumentName) !== path) {
    return { ok: false, message: 'The active scene changed while saving. Retry Save.' }
  }
  let sourcePlan: unknown
  try {
    const frontmatter = yaml.load(extractYamlFrontmatterBlock(expectedText || '')?.yamlText || '')
    sourcePlan = frontmatter && typeof frontmatter === 'object'
      ? (frontmatter as Record<string, unknown>)[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]
      : undefined
  } catch {
    return { ok: false, message: 'The active Markdown frontmatter is invalid. Repair it before saving.' }
  }
  if (JSON.stringify(sourcePlan) !== JSON.stringify(serialized)) {
    return { ok: false, message: 'Scene metadata did not reach the active Markdown source.' }
  }
  try {
    const observed = await readWorkspaceSourceTextSnapshot({
      path,
      read: () => createWorkspacePersistedFs().readFileText(path),
    })
    if (!observed.current || observed.value !== expectedText) {
      return { ok: false, message: 'Scene source was not verified in local storage. Retry Save.' }
    }
    const current = useGraphStore.getState()
    if (normalizeComposedSourcePath(current.markdownDocumentName) !== path
      || current.markdownDocumentText !== expectedText
      || current.graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY] !== serialized
      || readXrMotionReferenceRuntime().plan !== plan) {
      return { ok: false, message: 'Scene changed while saving. Retry Save for the latest edit.' }
    }
    markXrMotionReferenceSaved(serialized)
    return { ok: true, message: 'Scene saved to this browser. Reopen this source to verify it.' }
  } catch {
    return { ok: false, message: 'Local scene storage is unavailable. Export a copy and retry Save.' }
  }
}

/** Existing graph metadata flow owns Markdown, Source Files and local workspace writes; existing sync owns publication. */
export function persistXrScene(includePhysics = false): boolean {
  const state = useGraphStore.getState()
  if (!state.graphData) return false
  const serializedMotion = serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan)
  const serializedPhysics = serializeXrPhysicsRuntimeWorld() as unknown as JSONValue
  state.updateGraphMetadata({
    [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: serializedMotion,
    ...(includePhysics ? { [XR_PHYSICS_GRAPH_METADATA_KEY]: serializedPhysics } : {}),
  })
  const metadata = useGraphStore.getState().graphData?.metadata
  if (metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY] !== serializedMotion) return false
  if (includePhysics && JSON.stringify(metadata?.[XR_PHYSICS_GRAPH_METADATA_KEY]) !== JSON.stringify(serializedPhysics)) return false
  markXrMotionReferenceSaved(serializedMotion)
  if (includePhysics) markXrPhysicsRuntimeSaved(metadata?.[XR_PHYSICS_GRAPH_METADATA_KEY])
  return true
}
