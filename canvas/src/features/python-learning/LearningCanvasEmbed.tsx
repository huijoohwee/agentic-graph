import React from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { LearningSceneGeometry } from './LearningSceneGeometry'
import { applyLearningCameraPose } from './learningCameraPose'
import { learningLesson } from './learningLessons'
import { learningCanvasReplayTick } from './learningCanvasReplay'
import { LEARNING_CANVAS_PROTOCOL, learningCanvasScene, readLearningCanvasPose, readLearningCanvasShare, type LearningCanvasPose } from './learningCanvasEmbedProtocol'
function CameraControls() {
  const { camera, gl, invalidate, size } = useThree()
  React.useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    applyLearningCameraPose(camera as PerspectiveCamera, controls, gl.domElement)
    const redraw = () => invalidate()
    controls.addEventListener('change', redraw)
    invalidate()
    return () => { controls.removeEventListener('change', redraw); controls.dispose() }
  }, [camera, gl, invalidate, size.width, size.height])
  return null
}

/** Standalone Graph-owned Canvas. The host supplies observations, never executable programs. */
export default function LearningCanvasEmbed() {
  const [pose, setPose] = React.useState<LearningCanvasPose>([0, 0, 0, 0, 0])
  const [samples, setSamples] = React.useState<LearningCanvasPose[] | null>(null)
  const [playing, setPlaying] = React.useState(false), [error, setError] = React.useState('')
  const channel = window.location.hash.slice(1)
  const shared = new URLSearchParams(window.location.search).get('kgLearningCanvas') === 'drone'
  React.useEffect(() => {
    if (!shared) return
    const controller = new AbortController()
    void readLearningCanvasShare(window.location.hash, controller.signal)
      .then(rows => { if (!controller.signal.aborted) { setSamples(rows); setPose(rows[0]) } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Canvas snapshot unavailable.') })
    return () => controller.abort()
  }, [shared])
  React.useEffect(() => {
    if (!playing || !samples) return
    const started = performance.now(), first = pose[0]
    let frame = 0
    const advance = (now: number) => {
      const tick = learningCanvasReplayTick(started, now, first, samples.length - 1)
      setPose(samples[tick])
      if (tick === samples.length - 1) setPlaying(false)
      else frame = requestAnimationFrame(advance)
    }
    const hide = () => { if (document.hidden) setPlaying(false) }
    frame = requestAnimationFrame(advance); document.addEventListener('visibilitychange', hide)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', hide) }
    // Capture the starting tick once per explicit Replay/Resume; each frame only updates the pose.
  }, [playing, samples])
  React.useEffect(() => {
    if (shared || window.parent === window || !/^[a-f0-9]{32}$/u.test(channel)) return
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return
      const next = readLearningCanvasPose(event.data, channel)
      if (next) setPose(next)
    }
    window.addEventListener('message', receive)
    window.parent.postMessage({ protocol: LEARNING_CANVAS_PROTOCOL, kind: 'ready', channel }, window.location.origin)
    return () => window.removeEventListener('message', receive)
  }, [channel, shared])
  return <section aria-label="Graph drone Canvas" data-graph-canvas-pose={JSON.stringify(pose)} style={{ position: 'fixed', inset: 0, background: '#070d1b' }}>
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 50 }} fallback={<p role="status">3D Canvas requires WebGL.</p>}>
      <LearningSceneGeometry lesson={learningLesson('drone')} scene={learningCanvasScene(pose)} />
      <CameraControls />
    </Canvas>
    {shared ? <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, background: '#101b2e', color: 'white', padding: 12, borderRadius: 8, fontFamily: 'system-ui' }}>
      <p role="status">{error || (samples ? `Flight replay · ${pose[0]} / ${samples.length - 1} ticks · altitude ${pose[4].toFixed(2)} m` : 'Loading Canvas snapshot…')}</p>
      <button disabled={!samples || !!error} onClick={() => { if (samples && pose[0] === samples.length - 1) setPose(samples[0]); setPlaying(value => !value) }}
        style={{ minHeight: 44, marginRight: 8 }}>{playing ? 'Pause replay' : 'Replay flight'}</button>
      <button disabled={!samples} onClick={() => { setPlaying(false); if (samples) setPose(samples[0]) }} style={{ minHeight: 44 }}>Reset replay</button>
      <p style={{ marginBottom: 0 }}>Recorded simulation · no receiver connection or flight control.</p>
    </div> : null}
  </section>
}
