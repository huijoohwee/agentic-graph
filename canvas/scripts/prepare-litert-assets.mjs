import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
import { readBoundedResponseBytes } from './lib/read-bounded-response.mjs'

const canvasRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wasmSourceRoot = path.resolve(canvasRoot, '../node_modules/@litertjs/core/wasm')
const publicAssetRoot = path.resolve(canvasRoot, 'public/litert')
const modelTarget = path.resolve(publicAssetRoot, 'pose_landmarks_detector.tflite')

const POSE_TASK_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'
const POSE_TASK_SHA256 = '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1'
const POSE_MODEL_ENTRY = 'pose_landmarks_detector.tflite'
const POSE_MODEL_SHA256 = '82be6d591b9dad7d29fe21dc9fd892bf8b9602c458fb05209283de8282a0c488'
const MAX_POSE_TASK_BYTES = 32 * 1024 * 1024
const LITERT_WASM_FILES = Object.freeze([
  'litert_wasm_compat_internal.js',
  'litert_wasm_compat_internal.wasm',
  'litert_wasm_internal.js',
  'litert_wasm_internal.wasm',
  'litert_wasm_jspi_internal.js',
  'litert_wasm_jspi_internal.wasm',
  'litert_wasm_threaded_internal.js',
  'litert_wasm_threaded_internal.wasm',
])

const sha256 = value => createHash('sha256').update(value).digest('hex')

async function ensureOfficialPoseModel() {
  try {
    const current = await readFile(modelTarget)
    if (sha256(current) === POSE_MODEL_SHA256) return
  } catch {
    // A fresh checkout intentionally generates the licensed model at build time.
  }
  const response = await fetch(POSE_TASK_URL, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Official Google pose task download failed (${response.status}).`)
  const declaredBytes = Number(response.headers.get('content-length') || 0)
  if (declaredBytes > MAX_POSE_TASK_BYTES) throw new Error('Official Google pose task exceeds the bounded download size.')
  const taskBytes = await readBoundedResponseBytes(response, {
    maximumBytes: MAX_POSE_TASK_BYTES,
    resourceName: 'Official Google pose task',
  })
  const observedSha = sha256(taskBytes)
  if (observedSha !== POSE_TASK_SHA256) {
    throw new Error(`Official Google pose task integrity mismatch: expected ${POSE_TASK_SHA256}, received ${observedSha}.`)
  }
  const modelBytes = unzipSync(taskBytes)[POSE_MODEL_ENTRY]
  if (!modelBytes?.length) throw new Error(`Official Google pose task is missing ${POSE_MODEL_ENTRY}.`)
  if (sha256(modelBytes) !== POSE_MODEL_SHA256) throw new Error('Official Google pose model integrity mismatch.')
  await writeFile(modelTarget, modelBytes)
}

async function prepareLiteRtAssets() {
  await mkdir(publicAssetRoot, { recursive: true })
  await Promise.all(LITERT_WASM_FILES.map(fileName => copyFile(
    path.resolve(wasmSourceRoot, fileName),
    path.resolve(publicAssetRoot, fileName),
  )))
  await ensureOfficialPoseModel()
  process.stdout.write(`[agentic-graph] prepared LiteRT.js Wasm and official Google pose model in ${publicAssetRoot}\n`)
}

await prepareLiteRtAssets()
