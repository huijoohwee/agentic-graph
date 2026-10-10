import { readXrSceneDocumentReady } from '@/features/three/xrSceneDocumentReadiness'

/** Game Mode is available on every loaded document; authored XR data is optional. */
export function isGameModeDocumentReady(): boolean {
  return readXrSceneDocumentReady()
}
