import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const require = createRequire(import.meta.url)

/** Called only behind the existing loopback/origin/body/concurrency guards. */
export async function readWorkflowArchiveRequest(input, load) {
  if (!input || Object.keys(input).sort().join() !== 'manifestText,offset'
    || typeof input.manifestText !== 'string' || Buffer.byteLength(input.manifestText) > 32000
    || !Number.isSafeInteger(input.offset) || input.offset < 0 || input.offset % 32 !== 0) throw Error('invalid_workflow_input')
  if (!load) {
    const owner = path.resolve(path.dirname(require.resolve('agentic-os')), '..')
    const { readWorkflowManifestPage } = await import(pathToFileURL(path.join(owner, 'bin/agentic-os-workflow.mjs')).href)
    load = (text, offset) => readWorkflowManifestPage(owner, text, offset)
  }
  const result = await load(input.manifestText, input.offset)
  const output = result.status === 'blocked' ? { ...result, status: 'failed', capturedStatus: 'blocked' } : result
  const frame = 'data: ' + JSON.stringify(output) + '\n\ndata: [DONE]\n\n'
  if (Buffer.byteLength(frame) > 262144) throw Error('workflow_page_too_large')
  return frame
}
