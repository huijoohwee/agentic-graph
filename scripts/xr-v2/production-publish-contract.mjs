export const XR_V2_PUBLISH_RUNTIME_RELATIVE_PATHS = Object.freeze([
  'xr-v2/models/depth-anything-v2-small/config.json',
  'xr-v2/models/depth-anything-v2-small/preprocessor_config.json',
  'xr-v2/models/depth-anything-v2-small/onnx/model_q4f16.onnx',
  'xr-v2/wasm/ort-wasm-simd-threaded.mjs',
  'xr-v2/wasm/ort-wasm-simd-threaded.wasm',
])

export const XR_V2_MIRRORED_IGNORE_RELATIVE_PATH = 'xr-v2/.gitignore'

export const XR_V2_LEGACY_MIRROR_RELATIVE_PATHS = Object.freeze(
  XR_V2_PUBLISH_RUNTIME_RELATIVE_PATHS.map(relativePath => `content/knowgrph/${relativePath}`),
)

export const XR_V2_ROOT_REDIRECT = '/xr-v2/* /content/agentic-graph/xr-v2/:splat 200'
export const XR_V2_CANONICAL_REDIRECT = '/agentic-graph/xr-v2/* /content/agentic-graph/xr-v2/:splat 200'
