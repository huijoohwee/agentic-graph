import type { SourceFile } from '@/hooks/store/types'
import { areSourceFileRecordsEqual } from '@/features/source-files/sourceFileParsedState'

/** Allows only appended, distinct records after a document-owned lifecycle operation. */
export function hasOnlySafeSourceFileAdditions(args: {
  before: SourceFile[]
  current: SourceFile[]
  allowUnrelatedAdditions: boolean
}): boolean {
  const { before, current, allowUnrelatedAdditions } = args
  if (current.length < before.length || (!allowUnrelatedAdditions && current.length !== before.length)) return false
  for (let index = 0; index < before.length; index += 1) {
    const previous = before[index]
    const latest = current[index]
    if (!previous || !latest || !areSourceFileRecordsEqual(previous, latest)) return false
  }
  const knownIds = new Set(before.map(file => file.id))
  const knownPaths = new Set(before.map(file => String(file.source?.path || '')).filter(Boolean))
  for (let index = before.length; index < current.length; index += 1) {
    const added = current[index]
    const path = String(added?.source?.path || '')
    if (!added?.id || knownIds.has(added.id) || (path && knownPaths.has(path))) return false
    knownIds.add(added.id)
    if (path) knownPaths.add(path)
  }
  return true
}
