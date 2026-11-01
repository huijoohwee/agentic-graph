const MAX_MARKDOWN_DATA_VIEW_ROW_DEPTH = 8

const readLevelDepth = (raw: string): number => {
  const match = String(raw || '').trim().match(/^L(\d+)$/i)
  const depth = match ? Number.parseInt(match[1] || '0', 10) : 0
  return Number.isFinite(depth) && depth > 0 ? Math.min(MAX_MARKDOWN_DATA_VIEW_ROW_DEPTH, depth) : 0
}

const readIndentDepth = (raw: string): number => {
  const indent = Number.parseInt(String(raw || '').trim(), 10)
  return Number.isFinite(indent) && indent > 0 ? Math.min(MAX_MARKDOWN_DATA_VIEW_ROW_DEPTH, Math.floor(indent / 2)) : 0
}

export const readMarkdownDataViewRowDepth = (args: {
  row: { cells: readonly string[] }
  levelColumnIndex?: number
  indentColumnIndex?: number
}): number => {
  const hasLevelColumn = typeof args.levelColumnIndex === 'number' && args.levelColumnIndex >= 0
  const levelDepth = hasLevelColumn ? readLevelDepth(String(args.row.cells[args.levelColumnIndex!] || '')) : 0
  const hasIndentColumn = typeof args.indentColumnIndex === 'number' && args.indentColumnIndex >= 0
  return levelDepth || (hasIndentColumn ? readIndentDepth(String(args.row.cells[args.indentColumnIndex!] || '')) : 0)
}

export type MarkdownDataViewNestedRowState<Row extends { id: string; cells: readonly string[] }> = {
  row: Row
  depth: number
  childCount: number
  hidden: boolean
}

export const buildMarkdownDataViewNestedRowStates = <Row extends { id: string; cells: readonly string[] }>(args: {
  rows: readonly Row[]
  collapsedRowIds: ReadonlySet<string>
  levelColumnIndex?: number
  indentColumnIndex?: number
}): MarkdownDataViewNestedRowState<Row>[] => {
  const states = args.rows.map(row => ({
    row,
    depth: readMarkdownDataViewRowDepth({ row, levelColumnIndex: args.levelColumnIndex, indentColumnIndex: args.indentColumnIndex }),
    childCount: 0,
    hidden: false,
  }))
  const collapsedAncestorDepths: number[] = []
  for (let index = 0; index < states.length; index += 1) {
    const state = states[index]!
    while (collapsedAncestorDepths.length && collapsedAncestorDepths[collapsedAncestorDepths.length - 1]! >= state.depth) collapsedAncestorDepths.pop()
    state.hidden = collapsedAncestorDepths.length > 0
    if (args.collapsedRowIds.has(state.row.id)) collapsedAncestorDepths.push(state.depth)
    for (let nextIndex = index + 1; nextIndex < states.length; nextIndex += 1) {
      const nextDepth = states[nextIndex]!.depth
      if (nextDepth <= state.depth) break
      if (nextDepth === state.depth + 1) state.childCount += 1
    }
  }
  return states
}
