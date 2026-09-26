import type { FloatingPanelChatSubmitArgs } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitTypes'

export const PROGRAMMATIC_DRONE_PRESET_ID = 'programmatic-drone-flight'
export const PROGRAMMATIC_DRONE_PROMPT = '/python.learning @canvas #learning operation=inspect lesson=drone'
export const DRONE_LESSON_MARKER = '# agentic-graph lesson: drone'
export const isProgrammaticDronePrompt = (prompt: string) => prompt.trim().replace(/\s+/g, ' ') === PROGRAMMATIC_DRONE_PROMPT
export const sourceLearningLesson = (source: string) => source.split(/\r?\n/, 1)[0] === DRONE_LESSON_MARKER ? 'drone' : 'travel'

/** Explicit Home Demo creates its own local file; selecting a preset never calls this. */
export async function activateProgrammaticDroneDemo(): Promise<string> {
  const [{ getWorkspaceFs }, { useGraphStore }, { applyWorkspaceImportToCanvas }, { activateFirstImportedWorkspaceFile }, { learningLesson }] = await Promise.all([
    import('@/features/workspace-fs/workspaceFs'), import('@/hooks/useGraphStore'),
    import('@/features/workspace-fs/applyWorkspaceImportToCanvas'),
    import('@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions'), import('./learningLessons'),
  ])
  const fs = await getWorkspaceFs()
  const path = await fs.createFile({ parentPath: '/', name: `programmatic-drone-flight-${crypto.randomUUID()}.py`,
    text: DRONE_LESSON_MARKER + '\n' + learningLesson('drone').solution, mirrorToHost: false })
  await applyWorkspaceImportToCanvas({ fs, createdPaths: [path], opts: { applyToGraph: false, skipComposedGraphApply: true } })
  useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: true })
  if (!await activateFirstImportedWorkspaceFile({ fs, createdPaths: [path], applyToGraph: false })) {
    throw new Error('The drone example was saved locally but could not become active. Open it from Source Files.')
  }
  return path
}

/** The preset reuses the inspection owner; source execution and receiver control stay separate. */
export async function inspectProgrammaticDrone(prompt: string) {
  if (!isProgrammaticDronePrompt(prompt)) throw new Error('Use /python.learning @canvas #learning operation=inspect lesson=drone. Start flight with Run in the Python workspace.')
  const { createLearningToolExecutor } = await import('./learningWebMcp')
  const result = await createLearningToolExecutor().inspect()
  if (!('binding' in result) || result.binding.lessonId !== 'drone') {
    throw new Error('Open Programmatic Drone Flight with Home Catalog → Demo, then inspect the active drone lesson.')
  }
  return result
}

export async function invokeProgrammaticDroneInspection(args: FloatingPanelChatSubmitArgs): Promise<void> {
  try {
    const result = await inspectProgrammaticDrone(args.input)
    const id = crypto.randomUUID(), scene = result.result?.scene
    const content = `Programmatic Drone Flight · ${result.state}${result.stale ? ' · result is stale' : ''}\n\nSource: ${result.binding.documentId}\n\n`
      + (scene ? `Position (${scene.x.toFixed(2)}, ${scene.z.toFixed(2)}) m · altitude ${scene.altitude.toFixed(2)} m · ${scene.landed ? 'landed' : 'airborne'}.\n\n` : '')
      + 'Edit the Python source and choose Run to watch takeoff, flight and landing. Share canvas embed replays the completed simulation. GameXR receiver connection and Run remain explicit.'
    args.setMessages(previous => [...previous, { id: `${id}:prompt`, role: 'user', content: args.input }, { id, role: 'assistant', content }])
    args.setErrorText(''); args.setInput('')
  } catch (error) { args.setErrorText(error instanceof Error ? error.message : 'Drone lesson inspection is unavailable.') }
}
