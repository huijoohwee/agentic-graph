import { XrProceduralVehicleGeometry } from '../three/XrProceduralVehicleGeometry'
import type { LearningLesson, LearningSceneSnapshot } from './learningLessons'

export function LearningSceneStage({ lesson, scene }: { lesson: LearningLesson; scene?: LearningSceneSnapshot }) {
  const x = scene?.x || 0, z = scene?.z || 0, heading = scene?.heading || 0
  return <>
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
  </>
}
