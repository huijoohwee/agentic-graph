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

// Exact SHA-256 seals from protected mirror revision
// 6c6c3c73f367e2ecd9e67237da7bcf2b9ffc2f52.
export const XR_V2_LEGACY_MIRROR_SHA256_BY_PATH = Object.freeze({
  'content/knowgrph/xr-v2/models/depth-anything-v2-small/config.json': '3aee5b9bc4f711ee885c2526d871f0c8c6c8c4b26b8e04253d0167f6a83264f5',
  'content/knowgrph/xr-v2/models/depth-anything-v2-small/preprocessor_config.json': '03576db3c13dd0471fdf5f5e1428befcb95de063fe699879150b293dc9e0a2c6',
  'content/knowgrph/xr-v2/models/depth-anything-v2-small/onnx/model_q4f16.onnx': 'eca72971aea64216d767c70c534160de53b5435b588d362bac6dbd5a73f9bf1e',
  'content/knowgrph/xr-v2/wasm/ort-wasm-simd-threaded.mjs': '5f2cd914554830762579c372d0211614c1e3f40ab3f6c0cfcf0900343229071d',
  'content/knowgrph/xr-v2/wasm/ort-wasm-simd-threaded.wasm': 'f4f290847a4df02d0b93cdbf39b4b0e71acefbe80573e7e6b9342a7abd7b290a',
})

export const XR_V2_ROOT_REDIRECT = '/xr-v2/* /content/agentic-graph/xr-v2/:splat 200'
export const XR_V2_CANONICAL_REDIRECT = '/agentic-graph/xr-v2/* /content/agentic-graph/xr-v2/:splat 200'
