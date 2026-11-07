import type { WorkspaceEntry, WorkspaceFs } from '@/features/workspace-fs/types'
import { loadWorkspaceSourceIndex, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'

export const LEARNING_LESSON_FOLDER = '/docs/python-lessons'
/** Discovery metadata only; lesson source and execution stay lazy. */
export const LEARNING_LESSON_FILES = [
  { id: 'travel', name: '01-variables-in-motion.py' },
  { id: 'route', name: '02-repeat-a-route.py' },
  { id: 'sense', name: '03-sense-decide-act.py' },
  { id: 'drone', name: '04-drone-flight-and-landing.py' },
].map(file => ({ ...file, path: `${LEARNING_LESSON_FOLDER}/${file.name}` }))

export function sourceLearningLesson(source: string, documentId = ''): string {
  const marker = source.split(/\r?\n/, 1)[0].match(/^# agentic-graph lesson: ([a-z]+)$/)?.[1]
  const path = '/' + documentId.replace(/^\//, '')
  return LEARNING_LESSON_FILES.find(file => file.path === path || `/${file.name}` === path)?.id
    ?? LEARNING_LESSON_FILES.find(file => file.id === marker)?.id
    ?? 'travel'
}

const pending = new WeakMap<WorkspaceFs, Promise<WorkspaceEntry[]>>()
const incomplete = new WeakSet<WorkspaceFs>()

/** Materialize ordinary workspace files. Existing folders belong to the learner. */
export function ensureLearningLessonFiles(fs: WorkspaceFs, restoreMissing = false): Promise<WorkspaceEntry[]> {
  const existing = pending.get(fs)
  if (existing) return existing
  const seed = async () => {
    let rows = await fs.listEntries()
    const installed = rows.find(entry => entry.path === LEARNING_LESSON_FOLDER)
    if (installed && installed.kind !== 'folder') throw new Error(`${LEARNING_LESSON_FOLDER} is occupied by a file.`)
    const register = (path: string) => {
      // The normal docs reconciler preserves local source ownership, including empty folders.
      if (!loadWorkspaceSourceIndex()[path]) setWorkspaceEntrySource(path, { kind: 'local' }, { persist: 'sync' })
    }
    if (installed) register(LEARNING_LESSON_FOLDER)
    if (!installed || incomplete.has(fs) || restoreMissing) {
      incomplete.add(fs)
      for (const path of ['/docs', LEARNING_LESSON_FOLDER]) {
        const entry = rows.find(row => row.path === path)
        if (entry && entry.kind !== 'folder') throw new Error(`${path} is occupied by a file.`)
        if (!entry) {
          const created = await fs.createFolder({ parentPath: path.slice(0, path.lastIndexOf('/')) || '/', name: path.split('/').at(-1)!, mirrorToHost: false })
          if (created !== path) throw new Error(`Folder creation conflicted at ${path}. Retry to read the saved folder.`)
        }
        if (path === LEARNING_LESSON_FOLDER) register(path)
      }
      const { learningLesson } = await import('./learningLessons')
      for (const file of LEARNING_LESSON_FILES) {
        if (await fs.readFileText(file.path) !== null) { register(file.path); continue }
        rows = await fs.listEntries()
        if (rows.some(entry => entry.path === file.path)) throw new Error(`A folder occupies ${file.path}. Rename it before retrying.`)
        // Preserve interim root-level lesson edits; retain the original as well.
        const previous = await fs.readFileText(`/${file.name}`)
        const created = await fs.createFile({ parentPath: LEARNING_LESSON_FOLDER, name: file.name,
          text: previous ?? `# agentic-graph lesson: ${file.id}\n` + learningLesson(file.id).solution, mirrorToHost: false })
        if (created !== file.path) throw new Error(`File creation conflicted at ${file.path}. The saved files were preserved.`)
        register(created)
      }
      incomplete.delete(fs)
    }
    return (await fs.listEntries()).filter(entry => entry.kind === 'file' && entry.path.startsWith(`${LEARNING_LESSON_FOLDER}/`))
  }
  const request = Promise.resolve().then(() => typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('agentic-graph/python-lessons', seed) : seed())
    .finally(() => pending.delete(fs))
  pending.set(fs, request)
  return request
}
