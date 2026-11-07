import type { BlockDefinition, BlockInsertPosition, BlockTreeNode } from './blockLibrary'

export type BlockSession = Readonly<{
  generation: number
  documentId: string
  source: string
  target: BlockTreeNode | null
  readOnly: boolean
  insert: (definition: BlockDefinition, position: BlockInsertPosition) => string
}>
let current: BlockSession | null = null
let owner: symbol | null = null
let generation = 0
const listeners = new Set<() => void>()
const changed = () => listeners.forEach(listener => listener())
export const subscribeBlockSession = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const readBlockSession = (): BlockSession | null => current
export function publishBlockSession(token: symbol, session: Omit<BlockSession, 'generation'>): void { owner = token; current = { ...session, generation: ++generation }; changed() }
export function clearBlockSession(token: symbol): void { if (owner !== token) return; owner = null; current = null; changed() }
