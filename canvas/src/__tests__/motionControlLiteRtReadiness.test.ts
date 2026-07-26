import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readSource(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), ...parts), 'utf8')
}

export function testMotionControlLiteRtReadinessUsesProductionModelOwner() {
  const acquisition = readSource('scripts', 'prepare-litert-assets.mjs')
  const captureRuntime = readSource('src', 'features', 'three', 'motionControlRuntime.ts')
  const readiness = readSource('src', 'features', 'three', 'motionControlLiteRtReadiness.ts')
  const runner = readSource('scripts', 'run_motion_control_litert_browser_smoke.mjs')
  const verifier = readSource('scripts', 'verify_motion_control_litert_browser_smoke.mjs')

  if (!acquisition.includes('/pose_landmarker_full/float16/1/pose_landmarker_full.task')
    || acquisition.includes('/latest/')
    || !acquisition.includes('5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1')
    || !acquisition.includes('82be6d591b9dad7d29fe21dc9fd892bf8b9602c458fb05209283de8282a0c488')) {
    throw new Error('expected immutable, independently integrity-checked Google pose task acquisition')
  }
  if (!captureRuntime.includes('export async function compileMotionControlPoseModel')
    || !readiness.includes("from './motionControlRuntime'")) {
    throw new Error('expected camera runtime and readiness smoke to share the production LiteRT compile owner')
  }
  for (const marker of ['loadAndCompile', "accelerator: 'webgpu'", "accelerator: 'wasm'", 'validateMotionControlPoseModel']) {
    if (!captureRuntime.includes(marker)) throw new Error(`expected shared LiteRT model owner to retain ${marker}`)
  }
  for (const marker of ['compiled.model.run(input)', 'output.data()', 'input.delete()', 'compiled.model.delete()']) {
    if (!readiness.includes(marker)) throw new Error(`expected readiness probe to execute and release a real model through ${marker}`)
  }
  if (!runner.includes("existingServerPolicy: 'forbid'")
    || !runner.includes('KG_MOTION_CONTROL_LITERT_EXPECTED_HEAD')
    || !verifier.includes('cameraRequests, 0')
    || !verifier.includes("endsWith('.wasm')")) {
    throw new Error('expected fresh exact-revision browser proof with camera-free model and Wasm evidence')
  }
  const forbiddenOwner = ['andris', 'gauracs'].join('')
  const forbiddenRepository = ['LiteRT.js', 'Mocap'].join('-')
  for (const productionSource of [captureRuntime, readiness, runner, verifier]) {
    if (productionSource.includes(forbiddenOwner) || productionSource.includes(forbiddenRepository)) {
      throw new Error('expected camera-free LiteRT readiness to stay inside the clean-room production boundary')
    }
  }
}
