import React from 'react'
import { Canvas } from '@react-three/fiber'
import { XrProceduralVehicleGeometry } from '../three/XrProceduralVehicleGeometry'
import type { LearningLesson, LearningSceneSnapshot } from './learningLessons'
import { learningLesson } from './learningLessons'
import { pythonLearningRuntime as runtime } from './learningRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'

export function PythonLearningCanvas() {
  const snapshot = React.useSyncExternalStore(runtime.subscribe, runtime.read, runtime.read)
  React.useEffect(() => {
    const hidden = () => runtime.setHidden(document.hidden), leaving = () => runtime.stop()
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', leaving); hidden()
    return () => { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', leaving); runtime.dispose() }
  }, [])
  if (!snapshot.document) return null
  return <section aria-label="Python lesson Canvas" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <button style={{ minHeight: 44 }} onClick={() => useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: true })}>Edit Python code</button>
    <LearningScene lesson={learningLesson(snapshot.document.lessonId)} scene={!snapshot.stale ? snapshot.result?.scene : undefined} />
  </section>
}

class SceneBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <p role="alert">The visual renderer is unavailable. Coordinates and assessment remain readable below.</p> : this.props.children }
}
export function LearningScene({ lesson, scene }: { lesson: LearningLesson; scene?: LearningSceneSnapshot }) {
  const x = scene?.x || 0, z = scene?.z || 0, heading = scene?.heading || 0
  return <figure className="python-learning-scene" aria-label="Local lesson scene" style={{ flex: 1, height: '100%', minHeight: 0 }}>
    <SceneBoundary>
      <Canvas frameloop="demand" orthographic camera={{ position: [8, 10, 10], zoom: 40, near: 0.1, far: 100 }} dpr={[1, 1.5]}
        gl={{ antialias: false, preserveDrawingBuffer: false }} onCreated={({ camera }) => camera.lookAt(2, 0, 1)}>
        <color attach="background" args={['#142138']} />
        <ambientLight intensity={1.4} /><directionalLight position={[4, 7, 3]} intensity={2} />
        <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[16, 16]} /><meshStandardMaterial color="#253c55" /></mesh>
        <gridHelper args={[16, 16, '#75bfe8', '#476279']} position={[0, 0.01, 0]} />
        <mesh position={[4, 0.02, 0]}><boxGeometry args={[8, 0.015, 0.035]} /><meshBasicMaterial color="#68cfff" /></mesh>
        <mesh position={[0, 0.02, 4]}><boxGeometry args={[0.035, 0.015, 8]} /><meshBasicMaterial color="#ff8a91" /></mesh>
        <mesh position={[lesson.goal[0], 0.025, lesson.goal[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.18, 0.3, 24]} /><meshBasicMaterial color="#92efb5" />
        </mesh>
        {lesson.obstacles.map(o => <mesh key={o.id} position={[o.position[0], 0.5, o.position[1]]}>
          <boxGeometry args={[o.size[0], 1, o.size[1]]} /><meshStandardMaterial color="#e8a869" />
        </mesh>)}
        <group position={[x, 0.2, z]} rotation={[-Math.PI / 2, 0, -Math.PI / 2 - heading * Math.PI / 180]}>
          <XrProceduralVehicleGeometry color="#87ddff" kind="car" size={[0.3, 0.4, 0.24]} />
        </group>
      </Canvas>
    </SceneBoundary>
    <figcaption>Position ({x.toFixed(2)}, {z.toFixed(2)}) m · heading {heading.toFixed(0)}° · goal ({lesson.goal.join(', ')})</figcaption>
  </figure>
}
