import type { BlockTreeNode } from './blockLibrary'

export const BLOCK_VISUAL_TONES = {
  Structure: '#475b75',
  Logic: '#456b95',
  Loops: '#34735a',
  Math: '#75569a',
  Text: '#936039',
  Variables: '#8d526d',
  Functions: '#326f80',
} as const

export type BlockVisualCategory = keyof typeof BLOCK_VISUAL_TONES
export type BlockVisualShape = 'start' | 'statement' | 'container' | 'terminal' | 'value' | 'predicate'

/** Geometry describes the existing node; it never adds an editing or drop target. */
export function blockVisualShape(row: Pick<BlockTreeNode, 'kind' | 'title' | 'statement' | 'container'>): BlockVisualShape {
  if (row.kind === 'module') return 'start'
  if (row.container) return 'container'
  if (['return', 'break', 'continue'].includes(row.kind)) return 'terminal'
  if (row.statement) return 'statement'
  if (row.kind === 'compare' || row.kind === 'unary' && row.title === 'not'
    || row.kind === 'binary' && ['and', 'or'].includes(row.title)) return 'predicate'
  return 'value'
}

export function blockDefinitionShape(id: string): BlockVisualShape {
  if (['if', 'while', 'for', 'function'].includes(id)) return 'container'
  return id === 'return' ? 'terminal' : 'statement'
}

/** Labels and colors are a view of the supported native syntax, never a second parser. */
export function blockVisualCategory(row: Pick<BlockTreeNode, 'kind' | 'title'>): BlockVisualCategory {
  switch (row.kind) {
    case 'module': return 'Structure'
    case 'if': case 'compare': return 'Logic'
    case 'while': case 'for': case 'break': case 'continue': return 'Loops'
    case 'binary': return 'Math'
    case 'unary': return row.title === 'not' ? 'Logic' : 'Math'
    case 'assign': case 'name': return 'Variables'
    case 'def': case 'return': return 'Functions'
    case 'call': return row.title === 'print' ? 'Text' : 'Functions'
    case 'literal':
      return row.title === 'True' || row.title === 'False' || row.title === 'None' ? 'Logic'
        : /^-?\d/.test(row.title) ? 'Math' : 'Text'
    default: return 'Text'
  }
}

export function blockRoleLabel(row: Pick<BlockTreeNode, 'kind' | 'statement'>): string {
  if (row.kind === 'module') return 'program'
  return row.statement ? 'step' : 'value'
}

export function blockKindBadge(kind: string): string {
  return ({ module: 'start', expression: 'expr', literal: 'lit', compare: 'test', continue: 'next' } as Record<string, string>)[kind] || kind
}
