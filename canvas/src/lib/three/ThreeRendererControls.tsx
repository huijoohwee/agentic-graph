import React from 'react'
import { readThreeRendererBackend, requestThreeRendererBackend, subscribeThreeRendererBackend } from './threeRendererBackend'

export function ThreeRendererControls() {
  const state = React.useSyncExternalStore(subscribeThreeRendererBackend, readThreeRendererBackend, readThreeRendererBackend)
  return <section className="grid min-w-0 gap-2 rounded border p-2" aria-label="3D renderer">
    <label>Rendering backend
      <select className="mt-1 min-h-11 w-full rounded border bg-transparent px-2" aria-label="3D renderer"
        value={state.requested} onChange={event => requestThreeRendererBackend(event.target.value)}>
        <option value="webgl">WebGL · compatible default</option>
        <option value="webgpu">WebGPU · optional device rendering</option>
      </select>
    </label>
    <output role="status">{state.reason}</output>
    <p className="m-0">Both backends draw the same objects. Switching does not add objects or improve reconstruction.
      Use Analyze image locally or Generate whole-image relief to create geometry.</p>
    {state.phase === 'fallback' && state.requested === 'webgpu' && <button type="button"
      className="min-h-11 rounded border px-2" onClick={() => requestThreeRendererBackend('webgpu')}>Retry WebGPU</button>}
    <span>Procedural spaces in 3D. Uses device GPU, memory and battery; no API fee.
      The optional renderer adds a download. Image analysis and geometry generation stay on CPU.</span>
  </section>
}
