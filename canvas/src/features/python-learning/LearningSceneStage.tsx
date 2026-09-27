import { learningAssetFromObject, useLearningSpatialView } from './learningSpatialView'
import { LearningSpatialOverlay } from './LearningSpatialOverlay'
import type { LearningLesson, LearningSceneSnapshot } from './learningLessons'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { KgTheme } from '@/lib/ui/tokens-ssot'
import { LearningSceneGeometry } from './LearningSceneGeometry'

export function LearningSceneStage({ lesson, scene }: { lesson: LearningLesson; scene?: LearningSceneSnapshot }) {
  const { update } = useLearningSpatialView()
  const resolvedThemeMode = useGraphStore(state => state.resolvedThemeMode)
  const darkThemeVariant = useGraphStore(state => state.darkThemeVariant)
  const palette: KgTheme = resolvedThemeMode === 'light' ? 'light'
    : darkThemeVariant === 'black' ? 'black' : 'dark'
  return <group onClick={event => {
    if (lesson.vehicle !== 'drone' || event.delta > 4) return
    const id = learningAssetFromObject(event.object)
    if (id) { event.stopPropagation(); update({ selectedId: id }) }
  }}><LearningSceneGeometry lesson={lesson} scene={scene} palette={palette} />
    {lesson.vehicle === 'drone' && <LearningSpatialOverlay lesson={lesson} scene={scene} />}
  </group>
}
