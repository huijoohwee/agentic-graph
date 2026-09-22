import React from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { ProceduralAssetSession } from '@/features/image-to-glb/proceduralAssetSession'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import type { XrSubjectConstruction } from './xrSubjectAuthoring'

/** The scene's playhead samples the native rigid-part clip; there is no animation clock here. */
export function XrAuthoredSubjectGeometry({ construction }: { construction: XrSubjectConstruction }) {
  const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  const invalidate = useThree(state => state.invalidate)
  const [built, setBuilt] = React.useState<{ session: ProceduralAssetSession; scene: THREE.Group; mixer: THREE.AnimationMixer } | null>(null)
  React.useEffect(() => {
    const session = ProceduralAssetSession.restore(construction.proceduralAssetDocument)
    const scene = session.current.scene
    const mixer = new THREE.AnimationMixer(scene)
    const clip = scene.animations[0]
    if (clip) mixer.clipAction(clip).play()
    setBuilt({ session, scene, mixer })
    return () => { mixer.stopAllAction(); mixer.uncacheRoot(scene); session.dispose() }
  }, [construction.proceduralAssetDocument])
  React.useLayoutEffect(() => {
    if (!built) return
    built.mixer.setTime(runtime.playheadSeconds)
    built.scene.updateMatrixWorld(true)
    invalidate()
  }, [built, runtime.playheadSeconds, invalidate])
  // Catalog geometry is Z-up inside its wrapper; trusted construction is Y-up.
  return built ? <group rotation={[Math.PI / 2, 0, 0]}><primitive object={built.scene} dispose={null} /></group> : null
}
