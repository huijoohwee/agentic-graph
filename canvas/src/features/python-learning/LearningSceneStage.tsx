import type { LearningLesson, LearningSceneSnapshot } from './learningLessons'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { KgTheme } from '@/lib/ui/tokens-ssot'
import { LearningSceneGeometry } from './LearningSceneGeometry'

export function LearningSceneStage({ lesson, scene }: { lesson: LearningLesson; scene?: LearningSceneSnapshot }) {
  const resolvedThemeMode = useGraphStore(state => state.resolvedThemeMode)
  const darkThemeVariant = useGraphStore(state => state.darkThemeVariant)
  const palette: KgTheme = resolvedThemeMode === 'light' ? 'light'
    : darkThemeVariant === 'black' ? 'black' : 'dark'
  return <LearningSceneGeometry lesson={lesson} scene={scene} palette={palette} />
}
