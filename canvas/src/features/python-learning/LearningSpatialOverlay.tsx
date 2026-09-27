import { useMemo, useEffect } from 'react'
import { BoxGeometry } from 'three'
import { learningAssets, useLearningSpatialView } from './learningSpatialView'
import type { LearningLesson, LearningSceneSnapshot } from './learningLessons'

/** Presentation bounds; these meshes never participate in the simulation. */
export function LearningSpatialOverlay({ lesson, scene }: { lesson: LearningLesson; scene?: LearningSceneSnapshot }) {
  const { view } = useLearningSpatialView()
  const asset = learningAssets(lesson, scene).find(value => value.id === view.selectedId)
  const width = asset?.size[0] ?? 1, height = asset?.size[1] ?? 1, depth = asset?.size[2] ?? 1
  const bounds = useMemo(() => new BoxGeometry(width + .08, height + .08, depth + .08), [width, height, depth])
  useEffect(() => () => bounds.dispose(), [bounds])
  return <group name="learning-measurements">
    {asset && asset.kind !== 'space' && <lineSegments position={[asset.position[0], asset.position[1] + asset.size[1] / 2, asset.position[2]]} raycast={() => {}}>
      <edgesGeometry args={[bounds]} /><lineBasicMaterial color="#438dce" depthWrite={false} />
    </lineSegments>}
    {view.dimensions && <group>
      {[-8, 8].map(x => <mesh key={x} position={[x, .03, 8.5]}><boxGeometry args={[.025, .02, .35]} /><meshBasicMaterial color="#438dce" /></mesh>)}
      <mesh position={[0, .03, 8.5]}><boxGeometry args={[16, .02, .025]} /><meshBasicMaterial color="#438dce" /></mesh>
      {[0, lesson.goal[0]].map(x => <mesh key={x} position={[x, .03, 1.4]}><boxGeometry args={[.02, .02, .25]} /><meshBasicMaterial color="#438dce" /></mesh>)}
      <mesh position={[lesson.goal[0] / 2, .03, 1.4]}><boxGeometry args={[lesson.goal[0], .02, .02]} /><meshBasicMaterial color="#438dce" /></mesh>
    </group>}
  </group>
}
