import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readBoundedResponseBytes } from '../lib/read-bounded-response.mjs'

const canvasRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const repositoryRoot = path.resolve(canvasRoot, '..')

function streamedResponse(chunks, onCancel = () => {}) {
  let nextChunk = 0
  return {
    body: new ReadableStream({
      pull(controller) {
        const chunk = chunks[nextChunk]
        nextChunk += 1
        if (chunk) controller.enqueue(chunk)
        else controller.close()
      },
      cancel: onCancel,
    }, { highWaterMark: 0 }),
  }
}

test('bounded response reader accepts the exact byte limit without whole-body buffering', async () => {
  const bytes = await readBoundedResponseBytes(streamedResponse([
    Uint8Array.from([1, 2]),
    Uint8Array.from([3, 4]),
  ]), { maximumBytes: 4, resourceName: 'Test asset' })
  assert.deepEqual([...bytes], [1, 2, 3, 4])
})

test('bounded response reader cancels an undeclared-length stream as soon as it exceeds the limit', async () => {
  let cancelled = false
  const response = streamedResponse([
    Uint8Array.from([1, 2, 3]),
    Uint8Array.from([4, 5, 6]),
  ], () => { cancelled = true })
  await assert.rejects(
    readBoundedResponseBytes(response, { maximumBytes: 5, resourceName: 'Test asset' }),
    /exceeds the bounded download size/,
  )
  assert.equal(cancelled, true)
})

test('Motion Control asset and capture-platform docs retain bounded strict contracts', async () => {
  const [assetScript, productDocument, apiDocument, captureApiDocument] = await Promise.all([
    readFile(path.resolve(canvasRoot, 'scripts/prepare-litert-assets.mjs'), 'utf8'),
    readFile(path.resolve(repositoryRoot, 'docs/documents/knowgrph-motion-control-prd-tad.md'), 'utf8'),
    readFile(path.resolve(repositoryRoot, 'docs/documents/knowgrph-api-document.md'), 'utf8'),
    readFile(path.resolve(repositoryRoot, 'docs/documents/knowgrph-motion-capture-platform-api.md'), 'utf8'),
  ])
  assert.match(assetScript, /readBoundedResponseBytes\(response, \{[\s\S]*maximumBytes: MAX_POSE_TASK_BYTES/)
  assert.doesNotMatch(assetScript, /response\.arrayBuffer\(/)
  for (const document of [productDocument, apiDocument]) {
    assert.match(document, /operation=open/)
    assert.match(document, /boundingBox=(?:<true\|false>|true)/)
    assert.match(document, /operation=stop/)
    assert.match(document, /operation=start backend=<auto\|webgpu\|wasm>/)
    assert.match(document, /operation=record/)
    assert.match(document, /operation=finish/)
    assert.match(document, /operation=clear/)
    assert.match(document, /operation=export format=(?:<)?json\|csv(?:>)?/)
    assert.match(document, /operation=share enabled=(?:<)?true\|false(?:>)?/)
    assert.doesNotMatch(document, /operation=<open\|start\|stop> backend=/)
    assert.doesNotMatch(document, /operation=configure/)
  }
  assert.match(productDocument, /disabled by default/)
  assert.match(productDocument, /tracked pose ROI/)
  assert.match(captureApiDocument, /boundingBox=true\|false/)
  assert.match(captureApiDocument, /researchReady=true/)
  assert.match(captureApiDocument, /setSharedReconstructionEvidence/)
  assert.match(captureApiDocument, /30 publications per second per namespace/)
  assert.match(captureApiDocument, /256 KiB buffered ceiling/)
  assert.match(captureApiDocument, /guardrail, not proof of authorship/)
  assert.match(captureApiDocument, /FreeMoCap is not a package, service, subprocess, model source, schema source, or runtime\/build dependency/)
  for (const target of ['3D for XR', 'Animation']) {
    assert.match(productDocument, new RegExp(target))
  }
  for (const existingTool of ['knowgrph.control_local_xr_scene', 'knowgrph.control_local_animation']) {
    assert.match(productDocument, new RegExp(existingTool.replaceAll('.', '\\.')))
    assert.match(apiDocument, new RegExp(existingTool.replaceAll('.', '\\.')))
  }
  assert.match(productDocument, /Capture remains active across the open Motion Control, Skills & Commands, Media, Animation, and Game Mode FloatingPanel surfaces only while XR remains active/)
  assert.match(productDocument, /Authored animation assignments and action-path marks stay canonical and resume/)
  assert.match(apiDocument, /keeps exactly the existing `knowgrph\.inspect_local_motion_control` and `knowgrph\.control_local_motion_control` pair/)
})
