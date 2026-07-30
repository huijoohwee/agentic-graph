import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { motionCapturePlatformUiAdapter } from '@/features/three/motionCapturePlatformUiAdapter'
import { motionCaptureSessionRuntime } from '@/features/three/motionCaptureSessionRuntime'

export async function testMotionCaptureUiSnapshotsStayStableForReactExternalStores() {
  const panelSource = readFileSync(
    resolve(process.cwd(), 'src/features/three/MotionControlFloatingPanelView.tsx'),
    'utf8',
  )
  if (!panelSource.includes('motionCapturePlatformUiAdapter.subscribeSession')
    || !panelSource.includes('motionCapturePlatformUiAdapter.readSession')
    || panelSource.includes('readMotionCaptureSessionSnapshot')) {
    throw new Error('expected Motion Control to use the cached motion-capture UI store')
  }

  const firstRead = motionCapturePlatformUiAdapter.readSession()
  if (motionCapturePlatformUiAdapter.readSession() !== firstRead) {
    throw new Error('expected unchanged React external-store reads to retain object identity')
  }

  let publishedSnapshot = firstRead
  const unsubscribe = motionCapturePlatformUiAdapter.subscribeSession(() => {
    publishedSnapshot = motionCapturePlatformUiAdapter.readSession()
  })
  const source = motionCaptureSessionRuntime.registerSource({
    captureKind: 'landmark-stream',
    coordinateSpace: 'model-relative',
    clockDomain: 'session-monotonic',
  })
  try {
    const updatedRead = motionCapturePlatformUiAdapter.readSession()
    if (updatedRead !== publishedSnapshot
      || motionCapturePlatformUiAdapter.readSession() !== updatedRead
      || updatedRead.revision <= firstRead.revision
      || !updatedRead.sources.some(candidate => candidate.sourceId === source.sourceId)) {
      throw new Error('expected one stable cached snapshot identity for each published revision')
    }
  } finally {
    unsubscribe()
    if (motionCaptureSessionRuntime.getSnapshot().sources.some(candidate => candidate.sourceId === source.sourceId)) {
      motionCaptureSessionRuntime.removeSource(source.sourceId)
    }
  }

  const cleanedRead = motionCapturePlatformUiAdapter.readSession()
  if (motionCapturePlatformUiAdapter.readSession() !== cleanedRead
    || cleanedRead.sources.some(candidate => candidate.sourceId === source.sourceId)) {
    throw new Error('expected stable reads after an unsubscribed runtime revision')
  }
}
