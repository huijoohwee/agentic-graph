import { createFlightReviewUrl } from './learningFlightTransfer'

/** Share inert observations through the normal Graph application URL. No storage publication. */
export async function createLearningCanvasShareUrl(text: string, pageUrl: string, signal: AbortSignal): Promise<string> {
  const url = new URL(await createFlightReviewUrl(text, pageUrl, signal))
  url.search = '?kgLearningCanvas=drone'
  return url.href
}

export async function captureLearningCanvasShare(documentId: string, pageUrl: string, signal: AbortSignal): Promise<string> {
  const { pythonLearningRuntime: runtime } = await import('./learningRuntime')
  const { captureLearningDebrief } = await import('./learningPersistence')
  const { createLearningFlightPath } = await import('./learningFlightPath')
  const snapshot = runtime.read()
  if (snapshot.document?.documentId.replace(/^\/+/, '') !== documentId.replace(/^\/+/, '') || snapshot.stale || snapshot.state !== 'completed')
    throw new Error('Open this Python file, finish its drone flight and land before sharing its Canvas.')
  const record = await captureLearningDebrief(snapshot)
  const url = await createLearningCanvasShareUrl(createLearningFlightPath(record.result), pageUrl, signal)
  if (runtime.read() !== snapshot) throw new Error('Flight changed. Share the current completed Canvas again.')
  return url
}
