import React from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { ProceduralAssetSession } from '@/features/image-to-glb/proceduralAssetSession'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { readXrSubjectPlayback, type XrSubjectConstruction } from './xrSubjectAuthoring'

/** Samples absolute shared seconds, resetting prior clamp/clip state before every seek. */
export function sampleXrSubjectPlayback(scene: THREE.Object3D, mixer: THREE.AnimationMixer,
  playback: Pick<ReturnType<typeof readXrSubjectPlayback>, 'clipId' | 'loop'>, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0 || typeof playback.loop !== 'boolean') throw new Error('Invalid subject playback time or loop')
  const clip = playback.clipId === null ? null : scene.animations.find(item => item.name === playback.clipId)
  if (playback.clipId !== null && !clip) throw new Error('Selected subject clip is missing from the rendered construction')
  mixer.stopAllAction()
  if (clip) {
    const action = mixer.clipAction(clip).reset()
    action.setLoop(playback.loop ? THREE.LoopRepeat : THREE.LoopOnce, playback.loop ? Infinity : 1)
    action.clampWhenFinished = !playback.loop
    action.play()
    mixer.setTime(playback.loop ? seconds % clip.duration : Math.min(seconds, clip.duration))
  }
  scene.updateMatrixWorld(true)
}

/** The scene's playhead samples the native rigid-part clip; there is no animation clock here. */
export function XrAuthoredSubjectGeometry({ construction }: { construction: XrSubjectConstruction }) {
  const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  const invalidate = useThree(state => state.invalidate)
  const playback = React.useMemo(() => readXrSubjectPlayback(construction), [construction])
  const [built, setBuilt] = React.useState<{ document: string; session: ProceduralAssetSession; scene: THREE.Group; mixer: THREE.AnimationMixer } | null>(null)
  React.useEffect(() => {
    const session = ProceduralAssetSession.restore(construction.proceduralAssetDocument)
    const scene = session.current.scene
    const mixer = new THREE.AnimationMixer(scene)
    setBuilt({ document: construction.proceduralAssetDocument, session, scene, mixer })
    return () => { mixer.stopAllAction(); mixer.uncacheRoot(scene); session.dispose() }
  }, [construction.proceduralAssetDocument])
  React.useLayoutEffect(() => {
    if (!built || built.document !== construction.proceduralAssetDocument) return
    sampleXrSubjectPlayback(built.scene, built.mixer, playback, runtime.playheadSeconds)
    invalidate()
  }, [built, construction.proceduralAssetDocument, playback, runtime.playheadSeconds, invalidate])
  // Catalog geometry is Z-up inside its wrapper; trusted construction is Y-up.
  return built?.document === construction.proceduralAssetDocument ? <group rotation={[Math.PI / 2, 0, 0]}><primitive object={built.scene} dispose={null} /></group> : null
}
