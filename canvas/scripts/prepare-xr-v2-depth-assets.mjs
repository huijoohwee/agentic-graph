import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readBoundedResponseBytes } from './lib/read-bounded-response.mjs'

const canvasRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = path.resolve(canvasRoot, 'public', 'xr-v2')
const modelRoot = path.resolve(publicRoot, 'models', 'depth-anything-v2-small')
const wasmRoot = path.resolve(publicRoot, 'wasm')
const nodeRequire = createRequire(import.meta.url)
const onnxRuntimeDistRoot = path.dirname(nodeRequire.resolve('onnxruntime-web'))

export const XR_V2_DEPTH_MODEL_ID = 'onnx-community/depth-anything-v2-small'
export const XR_V2_DEPTH_MODEL_REVISION = '4472b7362082ad9968fee890ca0f1e5aca36b93d'
export const XR_V2_DEPTH_MODEL_LICENSE = 'Apache-2.0'
export const XR_V2_DEPTH_MODEL_PUBLIC_ROOT = '/xr-v2/models/depth-anything-v2-small/'
export const XR_V2_ONNX_WASM_PUBLIC_ROOT = '/xr-v2/wasm/'

const modelSourceRoot =
  `https://huggingface.co/${XR_V2_DEPTH_MODEL_ID}/resolve/${XR_V2_DEPTH_MODEL_REVISION}`

const MODEL_FILES = Object.freeze([
  Object.freeze({
    bytes: 38,
    path: 'config.json',
    sha256: '3aee5b9bc4f711ee885c2526d871f0c8c6c8c4b26b8e04253d0167f6a83264f5',
  }),
  Object.freeze({
    bytes: 461,
    path: 'preprocessor_config.json',
    sha256: '03576db3c13dd0471fdf5f5e1428befcb95de063fe699879150b293dc9e0a2c6',
  }),
  Object.freeze({
    bytes: 19_126_267,
    path: 'onnx/model_q4f16.onnx',
    sha256: 'eca72971aea64216d767c70c534160de53b5435b588d362bac6dbd5a73f9bf1e',
  }),
])

const WASM_FILES = Object.freeze([
  Object.freeze({
    bytes: 24_180,
    path: 'ort-wasm-simd-threaded.mjs',
    sha256: '5f2cd914554830762579c372d0211614c1e3f40ab3f6c0cfcf0900343229071d',
  }),
  Object.freeze({
    bytes: 12_942_611,
    path: 'ort-wasm-simd-threaded.wasm',
    sha256: 'f4f290847a4df02d0b93cdbf39b4b0e71acefbe80573e7e6b9342a7abd7b290a',
  }),
])

const sha256 = value => createHash('sha256').update(value).digest('hex')

async function fileMatches(pathname, expected) {
  try {
    const metadata = await stat(pathname)
    if (!metadata.isFile() || metadata.size !== expected.bytes) return false
    return sha256(await readFile(pathname)) === expected.sha256
  } catch {
    return false
  }
}

async function writeAtomically(pathname, bytes) {
  await mkdir(path.dirname(pathname), { recursive: true })
  const temporaryPath = `${pathname}.preparing-${process.pid}`
  await writeFile(temporaryPath, bytes)
  await rename(temporaryPath, pathname)
}

async function ensurePinnedModelFile(file) {
  const target = path.resolve(modelRoot, file.path)
  if (await fileMatches(target, file)) return

  const response = await fetch(`${modelSourceRoot}/${file.path}`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) {
    throw new Error(`Pinned XR depth asset download failed for ${file.path} (${response.status}).`)
  }
  const declaredBytes = Number(response.headers.get('content-length') || 0)
  if (declaredBytes && declaredBytes !== file.bytes) {
    throw new Error(
      `Pinned XR depth asset size mismatch for ${file.path}: expected ${file.bytes}, received ${declaredBytes}.`,
    )
  }
  const bytes = await readBoundedResponseBytes(response, {
    maximumBytes: file.bytes,
    resourceName: `Pinned XR depth asset ${file.path}`,
  })
  if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.sha256) {
    throw new Error(`Pinned XR depth asset integrity mismatch for ${file.path}.`)
  }
  await writeAtomically(target, bytes)
}

async function ensurePinnedWasmFile(file) {
  const source = path.resolve(onnxRuntimeDistRoot, file.path)
  const target = path.resolve(wasmRoot, file.path)
  if (!(await fileMatches(source, file))) {
    throw new Error(
      `Pinned ONNX Runtime asset ${file.path} does not match the reviewed package-lock bytes.`,
    )
  }
  if (await fileMatches(target, file)) return
  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(source, target)
  if (!(await fileMatches(target, file))) {
    throw new Error(`Copied ONNX Runtime asset failed integrity validation for ${file.path}.`)
  }
}

export async function prepareXrV2DepthAssets() {
  await Promise.all([
    ...MODEL_FILES.map(ensurePinnedModelFile),
    ...WASM_FILES.map(ensurePinnedWasmFile),
  ])
  process.stdout.write(
    `[knowgrph] prepared pinned ${XR_V2_DEPTH_MODEL_ID}@${XR_V2_DEPTH_MODEL_REVISION} and same-origin ONNX Wasm assets in ${publicRoot}\n`,
  )
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  await prepareXrV2DepthAssets()
}
