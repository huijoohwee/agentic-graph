export function assertXrMotionReferenceBootstrap(appSource: string) {
  if (appSource.includes("import { XrMotionReferenceRuntimeBridge } from '@/features/three/XrMotionReferenceRuntimeBridge'")
    || !appSource.includes("import('@/features/three/XrMotionReferenceRuntimeBridge')")
    || !appSource.includes('useSourceFilesBootstrapHasReachedReady()')
    || !appSource.includes('if (!sourceFilesBootstrapHasReachedReady) return null')) {
    throw new Error('expected the XR motion bridge to load after source bootstrap instead of extending the eager app entry')
  }
}
