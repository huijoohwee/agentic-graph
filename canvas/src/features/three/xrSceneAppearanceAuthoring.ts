import { hydrateCanonicalXrMotionReferenceRuntime } from './XrMotionReferenceRuntimeBridge'
import { readXrSceneDocumentReady } from './xrSceneDocumentReadiness'
import { readXrMotionReferenceRuntime, restoreXrMotionReferenceRuntimeSnapshot, setXrMotionReferenceAppearance } from './xrMotionReferenceRuntime'
import type { XrSceneAppearance } from './xrSceneAppearance'
import { persistXrScene } from './xrScenePersistence'

export function configureXrSceneAppearance(patch: Partial<XrSceneAppearance>): boolean {
  if (!readXrSceneDocumentReady() || !hydrateCanonicalXrMotionReferenceRuntime()) return false
  const previous = readXrMotionReferenceRuntime()
  try {
    setXrMotionReferenceAppearance(patch)
    if (persistXrScene()) return true
  } catch { /* Restore the authored runtime when the document rejects a write. */ }
  restoreXrMotionReferenceRuntimeSnapshot(previous)
  return false
}
