import React from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { LearningSceneGeometry } from './LearningSceneGeometry'
import { applyLearningCameraPose } from './learningCameraPose'
import { learningLesson } from './learningLessons'
import { LEARNING_CANVAS_PROTOCOL, learningCanvasScene, readLearningCanvasPose, type LearningCanvasPose } from './learningCanvasEmbedProtocol'
function CameraControls() {
  const { camera, gl, invalidate, size } = useThree()
  React.useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    applyLearningCameraPose(camera as PerspectiveCamera, controls, gl.domElement)
    controls.addEventListener('change', invalidate)
    invalidate()
    return () => { controls.removeEventListener('change', invalidate); controls.dispose() }
  }, [camera, gl, invalidate, size.width, size.height])
  return null
}

/** Standalone Graph-owned Canvas. The host supplies observations, never executable programs. */
function LearningCanvasEmbed() {
  const [pose, setPose] = React.useState<LearningCanvasPose>([0, 0, 0, 0, 0])
  const channel = window.location.hash.slice(1)
  React.useEffect(() => {
    if (window.parent === window || !/^[a-f0-9]{32}$/u.test(channel)) return
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return
      const next = readLearningCanvasPose(event.data, channel)
      if (next) setPose(next)
    }
    window.addEventListener('message', receive)
    window.parent.postMessage({ protocol: LEARNING_CANVAS_PROTOCOL, kind: 'ready', channel }, window.location.origin)
    return () => window.removeEventListener('message', receive)
  }, [channel])
  return <section aria-label="Graph drone Canvas" data-graph-canvas-pose={JSON.stringify(pose)} style={{ position: 'fixed', inset: 0 }}>
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 50 }} fallback={<p role="status">3D Canvas requires WebGL.</p>}>
      <LearningSceneGeometry lesson={learningLesson('drone')} scene={learningCanvasScene(pose)} />
      <CameraControls />
    </Canvas>
  </section>
}

createRoot(document.getElementById('root')!).render(<LearningCanvasEmbed />)
