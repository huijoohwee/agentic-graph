import { deriveDocumentPassageGraph, type PassageGraphInput } from '@/lib/parsers/documentPassageGraph'
import type { PassageWorkerReply } from '@/lib/parsers/documentPassageGraphWorker'

const worker = self as unknown as { onmessage: ((event: MessageEvent<PassageGraphInput>) => void) | null; postMessage: (reply: PassageWorkerReply) => void }
worker.onmessage = event => {
  try { worker.postMessage({ ok: true, result: deriveDocumentPassageGraph(event.data) }) }
  catch (error) { worker.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Passage analysis failed.' }) }
}
