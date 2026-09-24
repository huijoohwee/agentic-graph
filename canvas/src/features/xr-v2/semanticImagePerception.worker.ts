import { analyzeSemanticImage } from './semanticImagePerception'

self.onmessage = event => {
  try { self.postMessage({ ok: true, result: analyzeSemanticImage(event.data) }) }
  catch (error) { self.postMessage({ ok: false, message: String((error as Error).message || error) }) }
}
