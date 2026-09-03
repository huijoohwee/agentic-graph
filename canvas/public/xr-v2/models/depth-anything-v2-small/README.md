# Pinned XR v2 depth model

The production build prepares these same-origin runtime assets from
`onnx-community/depth-anything-v2-small` at immutable revision
`4472b7362082ad9968fee890ca0f1e5aca36b93d`.

- Model: `onnx/model_q4f16.onnx`
- Bytes: `19126267`
- SHA-256: `eca72971aea64216d767c70c534160de53b5435b588d362bac6dbd5a73f9bf1e`
- License: `Apache-2.0`
- Runtime URL: `/xr-v2/models/depth-anything-v2-small/`

The generated model and ONNX Runtime binaries are intentionally ignored by
Git. `npm run prepare:xr-v2-depth-assets --workspace=@agentic-graph/canvas` fetches
only the immutable model revision, rejects byte or digest drift, and copies the
package-lock-pinned Wasm runtime. The browser runtime disables remote fallback.
