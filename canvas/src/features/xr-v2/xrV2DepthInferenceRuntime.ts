import type { XrV2DepthEstimator } from './captureContracts'
import type { XrV2NormalizedDepthMap, XrV2RgbaFrame } from './stereoSynthesis'

export const XR_V2_DEPTH_MODEL_ID = 'onnx-community/depth-anything-v2-small' as const
export const XR_V2_DEPTH_MODEL_REVISION =
  '4472b7362082ad9968fee890ca0f1e5aca36b93d' as const
export const XR_V2_DEPTH_MODEL_ONNX_SHA256 =
  'eca72971aea64216d767c70c534160de53b5435b588d362bac6dbd5a73f9bf1e' as const
export const XR_V2_DEPTH_MODEL_ONNX_BYTES = 19_126_267 as const
export const XR_V2_DEPTH_MODEL_ROOT = '/xr-v2/models/depth-anything-v2-small/' as const
export const XR_V2_TRANSFORMERS_WASM_ROOT = '/xr-v2/wasm/' as const

export const XR_V2_DEPTH_MODEL_MANIFEST = Object.freeze({
  modelId: XR_V2_DEPTH_MODEL_ID,
  revision: XR_V2_DEPTH_MODEL_REVISION,
  sha256: XR_V2_DEPTH_MODEL_ONNX_SHA256,
  byteLength: XR_V2_DEPTH_MODEL_ONNX_BYTES,
  sameOriginPath: XR_V2_DEPTH_MODEL_ROOT,
  files: Object.freeze([
    'config.json',
    'preprocessor_config.json',
    'onnx/model_q4f16.onnx',
  ]),
  license: 'Apache-2.0',
} as const)

type RawDepthImage = Readonly<{
  data: Uint8Array | Uint8ClampedArray
  width: number
  height: number
  channels: number
}>

type DepthPipelineOutput = Readonly<{ depth: RawDepthImage }>

type DepthPipeline = ((input: unknown) => Promise<DepthPipelineOutput>) & Readonly<{
  dispose?: () => void | Promise<void>
}>

export type XrV2TransformersModule = Readonly<{
  RawImage: new (
    data: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    channels: 1 | 2 | 3 | 4,
  ) => unknown
  pipeline: (
    task: 'depth-estimation',
    model: string,
    options: Readonly<{
      local_files_only: true
      dtype: 'q4f16'
    }>,
  ) => Promise<DepthPipeline>
  env?: {
    backends?: {
      onnx?: {
        wasm?: { wasmPaths?: string }
      }
    }
  }
}>

export type XrV2DepthInferenceSnapshot = Readonly<{
  phase: 'idle' | 'loading' | 'ready' | 'running' | 'error' | 'disposed'
  modelId: typeof XR_V2_DEPTH_MODEL_ID
  revision: typeof XR_V2_DEPTH_MODEL_REVISION
  sameOriginPath: string
  remoteFallbackAllowed: false
  inferenceCount: number
  error: string | null
}>

export type XrV2LocalDepthInferenceAdapter = XrV2DepthEstimator<
  XrV2RgbaFrame,
  XrV2NormalizedDepthMap
> & Readonly<{
  prepare(): Promise<XrV2DepthInferenceSnapshot>
  snapshot(): XrV2DepthInferenceSnapshot
  subscribe(listener: () => void): () => void
  dispose(): Promise<void>
}>

function assertSameOriginRoot(label: string, value: string): string {
  const root = String(value || '').trim()
  if (!root.startsWith('/') || root.startsWith('//') || !root.endsWith('/')) {
    throw new Error(`${label} must be an absolute same-origin directory path`)
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(root) || root.includes('\\')) {
    throw new Error(`${label} cannot resolve through a remote URL`)
  }
  return root
}

function validateRgbaFrame(frame: XrV2RgbaFrame): void {
  if (!Number.isSafeInteger(frame.width) || frame.width < 1 || frame.width > 1_024
    || !Number.isSafeInteger(frame.height) || frame.height < 1 || frame.height > 1_024
    || !(frame.data instanceof Uint8ClampedArray)
    || frame.data.length !== frame.width * frame.height * 4) {
    throw new Error('XR v2 depth input must be a bounded, dimension-matched RGBA frame')
  }
}

function normalizeDepth(output: DepthPipelineOutput, width: number, height: number): XrV2NormalizedDepthMap {
  const image = output?.depth
  if (!image || image.width !== width || image.height !== height
    || image.channels !== 1 || image.data.length !== width * height) {
    throw new Error('Depth Anything output did not preserve the admitted frame dimensions')
  }
  const values = new Float32Array(image.data.length)
  for (let index = 0; index < image.data.length; index += 1) {
    values[index] = Number(image.data[index]) / 255
  }
  return Object.freeze({ width, height, values })
}

function message(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : String(error || 'XR v2 local depth inference failed')
}

export function createXrV2LocalDepthInferenceAdapter(options: Readonly<{
  modelRoot?: string
  wasmRoot?: string
  loadTransformers?: () => Promise<XrV2TransformersModule>
}> = {}): XrV2LocalDepthInferenceAdapter {
  const modelRoot = assertSameOriginRoot('modelRoot', options.modelRoot || XR_V2_DEPTH_MODEL_ROOT)
  const wasmRoot = assertSameOriginRoot('wasmRoot', options.wasmRoot || XR_V2_TRANSFORMERS_WASM_ROOT)
  const listeners = new Set<() => void>()
  let pipeline: DepthPipeline | null = null
  let pipelinePromise: Promise<DepthPipeline> | null = null
  let transformersModule: XrV2TransformersModule | null = null
  let inFlight = false
  let disposed = false
  let snapshot: XrV2DepthInferenceSnapshot = Object.freeze({
    phase: 'idle',
    modelId: XR_V2_DEPTH_MODEL_ID,
    revision: XR_V2_DEPTH_MODEL_REVISION,
    sameOriginPath: modelRoot,
    remoteFallbackAllowed: false,
    inferenceCount: 0,
    error: null,
  })

  const publish = (patch: Partial<XrV2DepthInferenceSnapshot>) => {
    snapshot = Object.freeze({ ...snapshot, ...patch })
    for (const listener of listeners) listener()
  }

  const load = async (): Promise<DepthPipeline> => {
    if (disposed) throw new Error('XR v2 depth adapter is disposed')
    if (pipeline) return pipeline
    if (!pipelinePromise) {
      publish({ phase: 'loading', error: null })
      pipelinePromise = Promise.resolve()
        .then(() => options.loadTransformers
          ? options.loadTransformers()
          : import('@huggingface/transformers') as Promise<unknown> as Promise<XrV2TransformersModule>)
        .then(async transformers => {
          transformersModule = transformers
          // The model root itself is passed as an invalid HF repository id and
          // local_files_only is true, so the hub loader can only issue
          // same-origin file requests. No shared remote-model flag is changed.
          const wasm = transformers.env?.backends?.onnx?.wasm
          if (wasm) wasm.wasmPaths = wasmRoot
          const loaded = await transformers.pipeline('depth-estimation', modelRoot, {
            local_files_only: true,
            dtype: 'q4f16',
          })
          if (typeof loaded !== 'function') throw new Error('Depth pipeline did not initialize')
          if (disposed) {
            await loaded.dispose?.()
            throw new Error('XR v2 depth adapter was disposed while loading')
          }
          pipeline = loaded
          publish({ phase: 'ready', error: null })
          return loaded
        })
        .catch(error => {
          pipelinePromise = null
          if (!disposed) publish({ phase: 'error', error: message(error) })
          throw error
        })
    }
    return pipelinePromise
  }

  return Object.freeze({
    prepare: async () => {
      await load()
      return snapshot
    },
    estimate: async input => {
      if (inFlight) throw new Error('XR v2 depth adapter admits one inference at a time')
      validateRgbaFrame(input.frame)
      inFlight = true
      try {
        const loaded = await load()
        if (disposed) throw new Error('XR v2 depth adapter is disposed')
        publish({ phase: 'running', error: null })
        const transformers = transformersModule
        if (!transformers) throw new Error('Depth transformer module is unavailable')
        const raw = new transformers.RawImage(
          input.frame.data,
          input.frame.width,
          input.frame.height,
          4,
        )
        const output = await loaded(raw)
        const depth = normalizeDepth(output, input.frame.width, input.frame.height)
        publish({ phase: 'ready', inferenceCount: snapshot.inferenceCount + 1 })
        return Object.freeze({ depth, confidence: 1 })
      } catch (error) {
        if (!disposed) publish({ phase: 'error', error: message(error) })
        throw error
      } finally {
        inFlight = false
      }
    },
    snapshot: () => snapshot,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: async () => {
      if (disposed) return
      disposed = true
      const loaded = pipeline
      pipeline = null
      pipelinePromise = null
      transformersModule = null
      await loaded?.dispose?.()
      publish({ phase: 'disposed', error: null })
      listeners.clear()
    },
  })
}
