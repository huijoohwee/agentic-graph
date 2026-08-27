import fs from 'node:fs'
import path from 'node:path'
import {
  applyStructuredSourceDataViewReplacement,
  buildStructuredSourceDataViewProjection,
  buildMarkdownPipeTableFromStructuredSourceMetadata,
} from '@/features/markdown-workspace/main/viewer/sourceStructuredDataViewTable'
import { coerceStructuredSourceValueColumnMode, coerceWorkspaceDataViewConfig } from '@/features/markdown-workspace/main/viewer/workspaceDataViewConfig'
import {
  readStructuredSourceDefaultVisibleColumnIds,
  readStructuredSourceFieldLineMode,
  readStructuredSourceRowHeightPreset,
} from '@/features/markdown-workspace/main/viewer/workspaceStructuredSourceDataViewPresentation'
import { TEST_VALIDATION_WORKSPACE_SEED_REL_PATH } from '@/features/workspace-fs/workspaceFs'

const readQuotedYamlValue = (line: string): string =>
  String(line || '')
    .replace(/^[^:]+:\s*/, '')
    .trim()
    .replace(/^['"]|['"]$/g, '')

const removedWorkspaceFilename = ['Graph', 'Table', 'Workspace', '.impl.tsx'].join('')
const forbiddenFallbackTokens = [
  ['graph', 'Data', 'Markdown', 'Table'].join(''),
  ['build', 'Graph', 'Data', 'Markdown', 'Table'].join(''),
  ['has', 'Spec', 'Markdown', 'Table'].join(''),
  ['graph', 'Data', ': s.graphData'].join(''),
]
const forbiddenWorkspaceModeToken = ['graph', 'Table', 'View', 'Mode'].join('')
export function testMultiDimTableSurfacePreservesWorkspaceModeOwners() {
  const workspacePath = path.resolve(process.cwd(), 'src', 'lib', ['graph', '-', 'table'].join(''), 'ui', removedWorkspaceFilename)
  const surfacePath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'viewer', 'MultiDimTableSurface.tsx')
  const workspaceModePath = path.resolve(process.cwd(), 'src', 'features', 'workspace-table', 'workspaceEditorMode.ts')
  const canvasSourcePath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'viewer', 'workspaceDataViewCanvasSource.ts')
  const surfaceText = fs.readFileSync(surfacePath, { encoding: 'utf8' })
  const workspaceModeText = fs.readFileSync(workspaceModePath, { encoding: 'utf8' })
  const canvasSourceText = fs.readFileSync(canvasSourcePath, { encoding: 'utf8' })

  if (fs.existsSync(workspacePath)) {
    throw new Error('expected removed legacy table workspace runtime to stay deleted')
  }
  if (!surfaceText.includes('MarkdownWorkspaceDerivedViewer') || !surfaceText.includes('viewerMode="multiDimTable"')) {
    throw new Error('expected MultiDimTableSurface to reuse the Markdown workspace derived-viewer owner')
  }
  if (!surfaceText.includes('replaceMarkdownLineRange') || !surfaceText.includes('setMarkdownDocument') || !surfaceText.includes('writeWorkspaceSourceTextIfPresent')) {
    throw new Error('expected MultiDimTableSurface inline edits to reuse shared Markdown viewer mutation utilities')
  }
  if (!surfaceText.includes("useCanvasWorkspaceDataViewSource('multi-dimensional-table.md')")) {
    throw new Error('expected MultiDimTableSurface to delegate source-file reading to the shared canvas data-view source hook')
  }
  if (!canvasSourceText.includes('resolvePreferredComposedSourceRawText') || !canvasSourceText.includes('readComposedSourceFilePath')) {
    throw new Error('expected canvas workspace data-view source hook to read refreshed Source Files text through the shared composed-source owner')
  }
  if (
    forbiddenFallbackTokens.some(token => surfaceText.includes(token))
  ) {
    throw new Error('expected MultiDimTableSurface to avoid graph-data table fallback/backfill coupling')
  }
  if (!canvasSourceText.includes('buildStructuredSourceDataViewProjection') || !surfaceText.includes('applyStructuredSourceDataViewReplacement')) {
    throw new Error('expected shared canvas data-view source and MultiDimTableSurface to render and edit source-structured tables through the shared Viewer mutation path')
  }
  if (!canvasSourceText.includes('sourceStructuredProjection?.markdownText')) {
    throw new Error('expected canvas data-view source hook to keep source-structured Markdown tables as the rendered surface owner')
  }
  if (!surfaceText.includes('disableViewerMutations={!canMutate}') || surfaceText.includes('disableViewerMutations={true}')) {
    throw new Error('expected MultiDimTableSurface to keep Markdown-backed data views editable')
  }
  if (!surfaceText.includes('onInlineDraftTextChange={handleInlineDraftTextChange}') || !surfaceText.includes('onReplaceLineRange={handleReplaceLineRange}')) {
    throw new Error('expected MultiDimTableSurface to wire the shared Viewer WYSIWYG edit callbacks')
  }
  if (!workspaceModeText.includes('export function toWorkspaceBackedTableViewMode(')) {
    throw new Error('expected workspace editor mode module to expose the shared workspace->table mode mapper')
  }
  if (!workspaceModeText.includes('export function toWorkspaceEditorModeFromTableViewMode(')) {
    throw new Error('expected workspace editor mode module to expose the shared table->workspace mode mapper')
  }
  const derivedViewerPath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'viewer', 'MarkdownWorkspaceDerivedViewer.tsx')
  const dataViewCandidatesPath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'viewer', 'markdownWorkspaceDataViewCandidates.ts')
  const dataViewTablePath = path.resolve(process.cwd(), 'src', 'features', 'markdown', 'ui', 'MarkdownDataViewTableView.tsx')
  const derivedViewerText = fs.readFileSync(derivedViewerPath, { encoding: 'utf8' })
  const dataViewCandidatesText = fs.readFileSync(dataViewCandidatesPath, { encoding: 'utf8' })
  const dataViewTableText = fs.readFileSync(dataViewTablePath, { encoding: 'utf8' })
  if (!dataViewCandidatesText.includes('structuredSource?: boolean') || !dataViewCandidatesText.includes("normalized === 'markdown yaml frontmatter'") || !dataViewCandidatesText.includes("normalized === 'markdown body'")) {
    throw new Error('expected data-view candidates to tag generated structured-source tables without file-specific conditions')
  }
  if (!derivedViewerText.includes('renderAllRows={selected.structuredSource === true}')) {
    throw new Error('expected derived viewer to render source-structured Multi-dimensional Table rows without progressive row hiding')
  }
  if (!derivedViewerText.includes('readStructuredSourceDataViewPresentation(selected.view, viewConfig)') || !derivedViewerText.includes('viewConfig?.visibleColumnIds ?? structuredSourcePresentation?.visibleColumnIds')) {
    throw new Error('expected derived viewer to use shared structured-source presentation defaults before falling back to full field inventory')
  }
  if (!derivedViewerText.includes('rowHeightPreset={structuredSourcePresentation?.rowHeightPreset ?? viewConfig?.rowHeightPreset}') || !derivedViewerText.includes('fieldLineMode={structuredSourcePresentation?.fieldLineMode ?? viewConfig?.fieldLineMode}')) {
    throw new Error('expected derived viewer to use readable structured-source density defaults without overriding user settings')
  }
  if (!dataViewTableText.includes('renderAllRows?: boolean') || !dataViewTableText.includes('props.renderAllRows ? view.rows : view.rows.slice')) {
    throw new Error('expected MarkdownDataViewTableView to preserve default progressive rendering behind a source-table opt-in')
  }
}

export function testMultiDimTableStructuredSourcePresentationDefaults() {
  const frontmatterColumns = [
    'L0',
    'L1',
    'L2',
    'L3',
    'L4',
    'Key',
    'Type',
    'Value',
    'Scalar Value',
    'List Value',
    'Summary',
    'Output',
    'Action',
    'Reference Pack',
    'Source Value',
    'Level',
    'Content',
    'Line',
    'Indent',
  ].map((name, index) => ({ id: `col_${index}`, name, kind: 'text' as const }))
  const frontmatterView = {
    columns: frontmatterColumns,
    rows: [
      {
        id: 'row_0',
        cells: frontmatterColumns.map(column => column.name === 'Key' ? 'title' : column.name === 'Value' ? 'Runnable Demo' : ''),
      },
    ],
    titleColumnId: 'col_5',
    groupByColumnId: null,
  }
  const frontmatterVisible = readStructuredSourceDefaultVisibleColumnIds(frontmatterView)
  const visibleFrontmatterNames = (frontmatterVisible || []).map(id => frontmatterColumns.find(column => column.id === id)?.name).filter(Boolean)
  const expectedFrontmatterNames = ['Key', 'Type', 'Scalar Value', 'List Value', 'Summary', 'Output', 'Action', 'Reference Pack', 'Content', 'Line']
  if (visibleFrontmatterNames.join('|') !== expectedFrontmatterNames.join('|')) {
    throw new Error(`expected structured source frontmatter defaults to prioritize semantic/source columns, got ${visibleFrontmatterNames.join(', ')}`)
  }
  const frontmatterGenericVisible = readStructuredSourceDefaultVisibleColumnIds(frontmatterView, 'type-generic')
  const visibleFrontmatterGenericNames = (frontmatterGenericVisible || []).map(id => frontmatterColumns.find(column => column.id === id)?.name).filter(Boolean)
  const expectedFrontmatterGenericNames = ['Key', 'Type', 'Value', 'Summary', 'Output', 'Action', 'Reference Pack', 'Content', 'Line']
  if (visibleFrontmatterGenericNames.join('|') !== expectedFrontmatterGenericNames.join('|')) {
    throw new Error(`expected structured source frontmatter generic value mode to use canonical Value, got ${visibleFrontmatterGenericNames.join(', ')}`)
  }

  const bodyColumns = ['Content', 'Line', 'Indent'].map((name, index) => ({ id: `body_${index}`, name, kind: 'text' as const }))
  const bodyVisible = readStructuredSourceDefaultVisibleColumnIds({
    columns: bodyColumns,
    rows: [{ id: 'row_0', cells: ['# Title', '12', '0'] }],
    titleColumnId: 'body_0',
    groupByColumnId: null,
  })
  const visibleBodyNames = (bodyVisible || []).map(id => bodyColumns.find(column => column.id === id)?.name).filter(Boolean)
  if (visibleBodyNames.join('|') !== 'Content|Line|Indent') {
    throw new Error(`expected Markdown Body defaults to keep content and source-line metadata visible, got ${visibleBodyNames.join(', ')}`)
  }
  if (readStructuredSourceRowHeightPreset(undefined) !== 'comfortable' || readStructuredSourceRowHeightPreset('compact') !== 'compact') {
    throw new Error('expected structured source row-height defaults to be readable while preserving explicit compact setting')
  }
  if (readStructuredSourceFieldLineMode(undefined) !== 'double' || readStructuredSourceFieldLineMode('single') !== 'single') {
    throw new Error('expected structured source field-line defaults to show two-line previews while preserving explicit single-line setting')
  }
  if (coerceStructuredSourceValueColumnMode(undefined) !== 'type-specific' || coerceStructuredSourceValueColumnMode('type-generic') !== 'type-generic') {
    throw new Error('expected structured source value-column mode to default to type-specific and preserve explicit generic mode')
  }
}

export function testMultiDimTableStructuredSourceMetadataBuildsVisibleTable() {
  const nestedKey = ['renderer', 'Modes'].join('')
  const nestedPrefix = 'Renderer'
  const sourceText = [
    'title: "Runnable Demo"',
    'graphId: "md:runnable-demo"',
    'status: active',
    'date: "2026-06-13"',
    `${nestedKey}:`,
    `  - "${nestedPrefix}: Storyboard"`,
    `  - "${nestedPrefix}: Storyboard Widget"`,
    'surfaces:',
    '  - "2D Renderer: Storyboard"',
    '  - "2D Renderer: Multi-dimensional Table"',
    'flow:',
    '  nodes:',
    '    - id: {key: id, type: string, value: "typed_node"}',
    '      type: StoryboardElement',
    '      label: "Opening beat"',
    '      properties:',
    '        lane: "Storyboard"',
    '        "kgc:readingSummary": "Opening summary"',
    '        action: "Review source"',
    '',
    '# Runnable Demo',
    '',
    'Body content stays source-owned.',
    '',
    '## Body Table',
    '',
    '| Stage | Owner |',
    '| Import | Launch |',
    '| Render | Multi-dimensional Table |',
  ].join('\n')
  const table = buildMarkdownPipeTableFromStructuredSourceMetadata(sourceText)
  if (!table) throw new Error('expected leading structured source metadata to build a Markdown data-view table')
  if (table.includes('| Line | Indent | Content |')) {
    throw new Error(`expected structured source tables to present source content before line metadata, got:\n${table}`)
  }
  if (!table.includes('| L0 | L1 | L2 | L3 | L4 | Key | Type | Value | Scalar Value | List Value | String Value | Summary | Output | Action | Reference Pack | Source Value | Level | Content | Line | Indent |') || !table.includes('| date |  |  |  |  | date | scalar | 2026-06-13 | 2026-06-13 |  |  |')) {
    throw new Error(`expected structured source metadata table to expose frontmatter as typed key/value rows, got:\n${table}`)
  }
  if (!table.includes(`| ${nestedKey} |  |  |  |  | ${nestedKey} | map |  |  |  |  |`) || !table.includes(`| ${nestedKey} | ${nestedPrefix} |  |  |  | ${nestedPrefix} | list | Storyboard |  | Storyboard |`) || !table.includes(`| ${nestedKey} | ${nestedPrefix} |  |  |  | ${nestedPrefix} | list | Storyboard Widget |  | Storyboard Widget |`)) {
    throw new Error(`expected structured source metadata table to expose nested YAML list values as hierarchy rows, got:\n${table}`)
  }
  if (!table.includes('| surfaces |  |  |  |  | surfaces | map |  |  |  |  |') || !table.includes('| surfaces | 2D Renderer |  |  |  | 2D Renderer | list | Storyboard |  | Storyboard |')) {
    throw new Error(`expected structured source metadata table to preserve structural YAML source lines, got:\n${table}`)
  }
  if (!table.includes('| flow | nodes | id |  |  | id | string | typed_node |  |  | typed_node |') || !table.includes('| flow | nodes | id | properties | lane | lane | scalar | Storyboard | Storyboard |')) {
    throw new Error(`expected YAML list-map rows to preserve native - key: value hierarchy, got:\n${table}`)
  }
  if (!table.includes('| flow | nodes | id |  |  | id | string | typed_node |  |  | typed_node |')) {
    throw new Error(`expected YAML list-map rows with typed inline maps to be visible as native source rows, got:\n${table}`)
  }
  if (!table.includes('| flow | nodes | id | properties | kgc:readingSummary | kgc:readingSummary | scalar | Opening summary | Opening summary |  |  | Opening summary |') || !table.includes('| flow | nodes | id | properties | action | action | scalar | Review source | Review source |  |  |  |  | Review source |')) {
    throw new Error(`expected structured source metadata table to derive Summary and Action columns from YAML-native fields, got:\n${table}`)
  }
  if (!table.includes('## Markdown YAML Frontmatter') || table.includes('## Storyboard Cards')) {
    throw new Error(`expected structured source metadata table to expose only Markdown YAML Frontmatter and Markdown Body tables, got:\n${table}`)
  }
  if (!table.includes('## Markdown Body') || !table.includes('| # Runnable Demo | 21 | 0 | L0 |') || !table.includes('| Body content stays source-owned. | 23 | 0 | L1 |')) {
    throw new Error(`expected structured source metadata table to preserve Markdown body lines, got:\n${table}`)
  }
  if (!table.includes('| \\| Stage \\| Owner \\| | 27 | 0 |') || !table.includes('| \\| Render \\| Multi-dimensional Table \\| | 29 | 0 |')) {
    throw new Error(`expected structured source metadata table to preserve Markdown pipe table lines once in the body table, got:\n${table}`)
  }
  const projection = buildStructuredSourceDataViewProjection(sourceText)
  if (!projection) throw new Error('expected source projection')
  const metadataReplacement = projection.replacements.find(replacement => replacement.kind === 'metadata')
  if (!metadataReplacement) throw new Error('expected Markdown YAML Frontmatter replacement map')
  const bodyReplacement = projection.replacements.find(replacement => replacement.kind === 'body')
  if (!bodyReplacement) throw new Error('expected Markdown body replacement map')
  if (projection.replacements.length !== 2 || projection.replacements.some(replacement => replacement.kind !== 'metadata' && replacement.kind !== 'body')) {
    throw new Error(`expected only Markdown YAML Frontmatter and Markdown Body replacement maps, got ${projection.replacements.map(replacement => replacement.kind).join(', ')}`)
  }
  const projectedLineCount = projection.replacements.reduce((count, replacement) => count + (replacement.sourceLineByRowIndex?.length || 0), 0)
  const sourceLineCount = sourceText.split('\n').length
  if (projectedLineCount !== sourceLineCount) {
    throw new Error(`expected source projection to cover every source line once, got ${projectedLineCount}/${sourceLineCount}`)
  }
  const nextMetadata = applyStructuredSourceDataViewReplacement({
    sourceText,
    projection,
    startLine: metadataReplacement.generatedStartLine,
    endLine: metadataReplacement.generatedEndLine,
    replacementLines: [
      '| L0 | L1 | L2 | L3 | L4 | Key | Type | Value | Level | Content | Line | Indent |',
      '| -- | -- | -- | -- | -- | --- | ---- | ----- | ----- | ------- | ---- | ------ |',
      '| title |  |  |  |  | title | scalar | Runnable Demo | L0 | title: "Runnable Demo" | 1 | 0 |',
      '| graphId |  |  |  |  | graphId | scalar | md:runnable-demo | L0 | graphId: "md:runnable-demo" | 2 | 0 |',
      '| status |  |  |  |  | status | scalar | active | L0 | status: active | 3 | 0 |',
      '| date |  |  |  |  | date | scalar | 2026-06-14 | L0 | date: "2026-06-13" | 4 | 0 |',
      `| ${nestedKey} | ${nestedPrefix} |  |  |  | ${nestedPrefix} | list | Kanban | L1 | - "${nestedPrefix}: Storyboard" | 6 | 2 |`,
    ],
  })
  if (!nextMetadata?.includes('date: "2026-06-14"') || !nextMetadata.includes(`- "${nestedPrefix}: Kanban"`) || !nextMetadata.includes('# Runnable Demo')) {
    throw new Error(`expected YAML Frontmatter key/value edit to write back while preserving body, got:\n${nextMetadata}`)
  }
  const nextListMap = applyStructuredSourceDataViewReplacement({
    sourceText,
    projection,
    startLine: metadataReplacement.generatedStartLine,
    endLine: metadataReplacement.generatedEndLine,
    replacementLines: [
      '| L0 | L1 | L2 | L3 | L4 | Key | Type | Value | Level | Content | Line | Indent |',
      '| -- | -- | -- | -- | -- | --- | ---- | ----- | ----- | ------- | ---- | ------ |',
      '| flow | nodes | id |  |  | id | string | storyboard_card_2 | L2 | - id: {key: id, type: string, value: "typed_node"} | 13 | 4 |',
    ],
  })
  if (!nextListMap?.includes('    - id: {key: id, type: string, value: "storyboard_card_2"}') || nextListMap.includes('    - id: "storyboard_card_2"')) {
    throw new Error(`expected YAML list-map edit to preserve native - key: value syntax, got:\n${nextListMap}`)
  }
  const nextBody = applyStructuredSourceDataViewReplacement({
    sourceText,
    projection,
    startLine: bodyReplacement.generatedStartLine,
    endLine: bodyReplacement.generatedEndLine,
    replacementLines: [
      '| Content | Line | Indent |',
      '| ------- | ---- | ------ |',
      '| # Runnable Demo | 21 | 0 |',
      '|  | 22 | 0 |',
      '| Body content was edited inline. | 23 | 0 |',
    ],
  })
  if (!nextBody?.includes('Body content was edited inline.')) {
    throw new Error(`expected structured source body edit to write back through source lines, got:\n${nextBody}`)
  }
  const nextPipe = applyStructuredSourceDataViewReplacement({
    sourceText,
    projection,
    startLine: bodyReplacement.generatedStartLine,
    endLine: bodyReplacement.generatedEndLine,
    replacementLines: [
      '| Content | Line | Indent |',
      '| ------- | ---- | ------ |',
      '| # Runnable Demo | 21 | 0 |',
      '|  | 22 | 0 |',
      '| Body content stays source-owned. | 23 | 0 |',
      '|  | 24 | 0 |',
      '| ## Body Table | 25 | 0 |',
      '|  | 26 | 0 |',
      '| \\| Stage \\| Owner \\| | 27 | 0 |',
      '| \\| Import \\| Launch \\| | 28 | 0 |',
      '| \\| Render \\| Edited Owner \\| | 29 | 0 |',
    ],
  })
  if (!nextPipe?.includes('| Render | Edited Owner |')) {
    throw new Error(`expected structured source pipe table edit to write back through source table lines, got:\n${nextPipe}`)
  }
}

export function testMultiDimTableYamlFrontmatterReflectsStrybldrValidationSource() {
  const externalValidationInput = String(process.env.AG_TEST_VALIDATION_FORBID_HARDCODE_IN_REPO || '').trim()
  const sourcePath = externalValidationInput || path.resolve(process.cwd(), '..', '..', 'huijoohwee', TEST_VALIDATION_WORKSPACE_SEED_REL_PATH)
  const sourceText = fs.readFileSync(sourcePath, { encoding: 'utf8' })
  const validationKey = 'validation_input_forbid_hardcode_in_repo'
  const storyboardKey = 'strybldr_storyboard'
  const sourceLines = sourceText.replace(/\r\n/g, '\n').split('\n')
  const validationLine = sourceLines.findIndex(line => line.trim().startsWith(`${validationKey}:`)) + 1
  const storyboardLine = sourceLines.findIndex(line => line.trim() === `${storyboardKey}:`) + 1
  const semanticIdentityLine = sourceLines.findIndex(line => line.trim().startsWith('semanticIdentity:')) + 1
  const sourceUrlLineIndex = sourceLines.findIndex(line => line.trim().startsWith('source_url:'))
  const sourceUrlLine = sourceUrlLineIndex >= 0 ? sourceLines[sourceUrlLineIndex] : ''
  const sourceUrlLineNumber = sourceUrlLineIndex + 1
  const frontmatterEndLine = sourceLines.findIndex((line, index) => index > 0 && line.trim() === '---') + 1

  if (!sourceText.startsWith('---\n')) {
    throw new Error('expected Strybldr validation source doc to keep byte-zero YAML frontmatter')
  }
  if (validationLine < 1 || storyboardLine < 1 || semanticIdentityLine < 1 || sourceUrlLineNumber < 1 || frontmatterEndLine < 1) {
    throw new Error('expected Strybldr starter validation source doc to expose validation, semantic, source-url, and storyboard YAML frontmatter keys')
  }
  if (sourceLines[storyboardLine - 1]?.includes('|')) {
    throw new Error('expected Strybldr validation source doc to use YAML-native storyboard frontmatter, not a JSON literal block')
  }
  const authoredSourceUrl = readQuotedYamlValue(sourceUrlLine)
  if (/https?:\/\//i.test(authoredSourceUrl)) {
    throw new Error('expected Strybldr starter validation source_url to stay operator-supplied instead of hardcoded in repo')
  }

  const projection = buildStructuredSourceDataViewProjection(sourceText)
  if (!projection) throw new Error('expected Multi-dimensional Table source projection for Strybldr validation doc')
  const metadataReplacement = projection.replacements.find(replacement => replacement.kind === 'metadata')
  if (!metadataReplacement) throw new Error('expected YAML Frontmatter replacement map for Strybldr validation doc')
  if (metadataReplacement.sourceStartLine !== 2 || metadataReplacement.sourceEndLine !== frontmatterEndLine - 1) {
    throw new Error(`expected YAML Frontmatter projection to span the authored frontmatter source lines, got ${metadataReplacement.sourceStartLine}-${metadataReplacement.sourceEndLine}`)
  }
  const sourceRows = metadataReplacement.sourceLineByRowIndex || []
  const expectedRows = metadataReplacement.sourceEndLine - metadataReplacement.sourceStartLine + 1
  if (sourceRows.length !== expectedRows || new Set(sourceRows).size !== sourceRows.length) {
    throw new Error(`expected YAML Frontmatter projection to cover every source frontmatter line once, got ${sourceRows.length}/${expectedRows}`)
  }
  if (!projection.markdownText.includes('## Markdown YAML Frontmatter')) {
    throw new Error('expected Multi-dimensional Table projection to render a Markdown YAML Frontmatter section')
  }
  if (projection.markdownText.includes('## Storyboard Cards')) {
    throw new Error('expected Multi-dimensional Table projection to omit Storyboard Cards table')
  }
  if (!projection.markdownText.includes(`${validationKey} | scalar | true`) || !projection.markdownText.includes(`| ${validationKey}: "true" | ${validationLine} | 0 |`)) {
    throw new Error(`expected YAML Frontmatter table to reflect the validation guard source line, got:\n${projection.markdownText.slice(0, 2000)}`)
  }
  if (!projection.markdownText.includes(`${storyboardKey} | map`) || !projection.markdownText.includes(`| ${storyboardKey}: | ${storyboardLine} | 0 |`)) {
    throw new Error('expected YAML Frontmatter table to reflect YAML-native Strybldr storyboard root')
  }
  if (!projection.markdownText.includes('| kgSharedRendererContract | semanticIdentity |') || !projection.markdownText.includes(`| semanticIdentity: "buildScopedGraphSemanticKey" | ${semanticIdentityLine} | 2 |`)) {
    throw new Error('expected YAML Frontmatter table to surface the shared semantic-key contract without renderer-local aliases')
  }
  if (!projection.markdownText.includes('| starter_inputs | source_url |') || !projection.markdownText.includes(`| source_url: "" | ${sourceUrlLineNumber} | 2 |`)) {
    throw new Error('expected YAML Frontmatter table to preserve blank operator-supplied starter source_url')
  }
  const nextValidation = applyStructuredSourceDataViewReplacement({
    sourceText,
    projection,
    startLine: metadataReplacement.generatedStartLine,
    endLine: metadataReplacement.generatedEndLine,
    replacementLines: [
      '| Key | Type | Value | Content | Line | Indent |',
      '| --- | ---- | ----- | ------- | ---- | ------ |',
      `| ${validationKey} | scalar | false | ${validationKey}: "true" | ${validationLine} | 0 |`,
    ],
  })
  if (!nextValidation?.includes(`${validationKey}: "false"`)) {
    throw new Error(`expected starter validation guard edit to write back through the source-line map, got:\n${nextValidation}`)
  }
  if (projection.markdownText.includes('| strybldr_storyboard | workflow | stages | stages |') || projection.markdownText.includes('| strybldr_storyboard | workflow | fork | branches | branches |')) {
    throw new Error('expected YAML Frontmatter list paths to avoid duplicated parent keys')
  }
  if (projection.replacements.length !== 2 || projection.replacements.some(replacement => replacement.kind !== 'metadata' && replacement.kind !== 'body')) {
    throw new Error(`expected only Markdown YAML Frontmatter and Markdown Body replacement maps, got ${projection.replacements.map(replacement => replacement.kind).join(', ')}`)
  }
}

export function testWorkspaceTableViewModeSupportsMultiDimTableSsot() {
  const workspaceMainPath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'MarkdownWorkspaceMain.tsx')
  const workspaceModePath = path.resolve(process.cwd(), 'src', 'features', 'workspace-table', 'workspaceEditorMode.ts')
  const presentationPath = path.resolve(process.cwd(), 'src', 'features', 'workspace-table', 'workspaceEditorModePresentation.ts')
  const workspaceMainText = fs.readFileSync(workspaceMainPath, { encoding: 'utf8' })
  const workspaceModeText = fs.readFileSync(workspaceModePath, { encoding: 'utf8' })
  const presentationText = fs.readFileSync(presentationPath, { encoding: 'utf8' })

  if (
    !workspaceMainText.includes("const disableDerivedMarkdownMutations = !!disableViewerMutations")
    || workspaceMainText.includes('disableDerivedMarkdownMutations = !!disableViewerMutations || isSourceAttachedMarkdownTable')
  ) {
    throw new Error('expected source-attached Multi-dimensional Table views to stay inline-editable through the shared Viewer')
  }
  if (!workspaceMainText.includes('sourceAttachedMarkdownTableText || activeJsonSourcePreviewText || viewerText')) {
    throw new Error('expected Multi-dimensional Table source views to render the editable Markdown table before readonly JSON candidates')
  }
  if (!workspaceMainText.includes('buildStructuredSourceDataViewProjection(activeText)') || !workspaceMainText.includes('structuredSourceDataViewProjection?.markdownText')) {
    throw new Error('expected Editor Workspace Multi-dimensional Table to prefer structured Markdown source projections before generic JSON-row tables')
  }
  if (!workspaceMainText.includes('applyStructuredSourceDataViewReplacement({') || !workspaceMainText.includes('if (isStructuredSourceAttachedMarkdownTable) return')) {
    throw new Error('expected Editor Workspace Multi-dimensional Table edits to route through structured source replacement without falling back to generated-table source writes')
  }
  if (workspaceMainText.includes('if (nextText !== activeText) setActiveText(nextText); return')) {
    throw new Error('expected structured source projection edits to avoid committing generated table text back into the source Markdown document')
  }
  if (!workspaceMainText.includes('serializeJsonMarkdownDraftToSourceText({') || !workspaceMainText.includes('if (isSourceAttachedMarkdownTable)')) {
    throw new Error('expected source-attached table edits to commit through the existing JSON-Markdown serialization utility')
  }
  if (!workspaceModeText.includes("export type WorkspaceTableViewMode = WorkspaceEditorMode | 'geospatial'")) {
    throw new Error('expected WorkspaceTableViewMode to keep workspace-backed modes and the geospatial overlay mode in the shared workspace-table SSOT')
  }
  if (!workspaceModeText.includes("if (raw === 'table' || raw === 'multiDimTable' || raw === 'kanban') return raw")) {
    throw new Error("expected parseWorkspaceEditorMode to accept 'multiDimTable' without legacy table-local parsing")
  }
  if (!presentationText.includes('WORKSPACE_TABLE_VIEW_MODE_SELECT_OPTIONS')) {
    throw new Error('expected shared workspace-table presentation options to expose table view labels')
  }
  if (workspaceModeText.includes(forbiddenWorkspaceModeToken) || presentationText.includes(forbiddenWorkspaceModeToken)) {
    throw new Error('expected workspace table view mode to avoid duplicate legacy table-mode persistence')
  }
}

export function testMultiDimTableSupportsRowsColumnsPivot() {
  const headerPath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'viewer', 'WorkspaceDataViewHeader.tsx')
  const derivedViewerPath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'viewer', 'MarkdownWorkspaceDerivedViewer.tsx')
  const tableViewPath = path.resolve(process.cwd(), 'src', 'features', 'markdown', 'ui', 'MarkdownDataViewTableView.tsx')
  const columnsTableViewPath = path.resolve(process.cwd(), 'src', 'features', 'markdown', 'ui', 'MarkdownDataViewColumnsTableView.tsx')
  const chipStylesPath = path.resolve(process.cwd(), 'src', 'features', 'markdown', 'ui', 'dataViewChipStyles.ts')
  const columnSizingPath = path.resolve(process.cwd(), 'src', 'features', 'markdown', 'ui', 'markdownDataViewColumnSizing.ts')
  const configPath = path.resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'main', 'viewer', 'workspaceDataViewConfig.ts')
  const headerText = fs.readFileSync(headerPath, { encoding: 'utf8' })
  const derivedViewerText = fs.readFileSync(derivedViewerPath, { encoding: 'utf8' })
  const tableViewText = fs.readFileSync(tableViewPath, { encoding: 'utf8' })
  const columnsTableViewText = fs.readFileSync(columnsTableViewPath, { encoding: 'utf8' })
  const chipStylesText = fs.readFileSync(chipStylesPath, { encoding: 'utf8' })
  const columnSizingText = fs.readFileSync(columnSizingPath, { encoding: 'utf8' })
  const configText = fs.readFileSync(configPath, { encoding: 'utf8' })

  if (!configText.includes("export type WorkspaceDataViewOrientation = 'rows' | 'columns'") || !configText.includes("orientation: 'rows'")) {
    throw new Error('expected data-view config to persist a rows/columns orientation without a renderer-local flag')
  }
  if (!configText.includes("WorkspaceStructuredSourceValueColumnMode = 'type-specific' | 'type-generic'") || !configText.includes("structuredSourceValueColumnMode: 'type-specific'")) {
    throw new Error('expected data-view config to persist structured-source value-column presentation mode')
  }
  const coerced = coerceWorkspaceDataViewConfig({
    v: 2,
    id: 'v0',
    name: 'Table',
    layout: 'table',
    groupByColumnId: null,
    visibleColumnIds: null,
    columnTypesById: null,
    filterGroups: [{ id: 'g0', rules: [] }],
    sortRules: [],
    orientation: 'columns',
    structuredSourceValueColumnMode: 'type-generic',
  })
  if (coerced?.orientation !== 'columns') {
    throw new Error('expected persisted data-view config to coerce columns pivot orientation')
  }
  if (coerced?.structuredSourceValueColumnMode !== 'type-generic') {
    throw new Error('expected persisted data-view config to coerce structured-source generic value mode')
  }
  const fallback = coerceWorkspaceDataViewConfig({
    v: 2,
    id: 'v0',
    name: 'Table',
    layout: 'table',
    groupByColumnId: null,
    visibleColumnIds: null,
    columnTypesById: null,
    filterGroups: [{ id: 'g0', rules: [] }],
    sortRules: [],
    orientation: 'legacy-pivot',
    structuredSourceValueColumnMode: 'legacy-value-mode',
  })
  if (fallback?.orientation !== 'rows') {
    throw new Error('expected invalid pivot orientation to normalize to row-record mode')
  }
  if (fallback?.structuredSourceValueColumnMode !== 'type-specific') {
    throw new Error('expected invalid structured-source value mode to normalize to type-specific columns')
  }
  if (!headerText.includes('ArrowLeftRight') || !headerText.includes("orientation === 'columns' ? 'rows' : 'columns'") || !headerText.includes('Pivot: columns as records')) {
    throw new Error('expected data-view header to expose a shared rows/columns pivot toggle')
  }
  if (!derivedViewerText.includes("orientation={viewConfig?.orientation === 'columns' ? 'columns' : 'rows'}")) {
    throw new Error('expected MarkdownWorkspaceDerivedViewer to pass persisted pivot orientation to the table renderer')
  }
  if (!tableViewText.includes("orientation?: 'rows' | 'columns'") || !tableViewText.includes("if (orientation === 'columns')") || !tableViewText.includes('MarkdownDataViewColumnsTableView') || !tableViewText.includes('MarkdownDataViewColumnResizeHandle') || !tableViewText.includes('<colgroup>') || !tableViewText.includes('readMarkdownDataViewDefaultColumnWidth') || !tableViewText.includes('style={{ width: rowRecordTableWidth }}') || !tableViewText.includes('overflow-hidden border-b') || !tableViewText.includes('border-separate border-spacing-0') || !tableViewText.includes('sticky top-0 z-30 isolate') || !tableViewText.includes('relative z-[31]')) {
    throw new Error('expected MarkdownDataViewTableView to render row-column pivot mode and resize columns through the shared table renderer')
  }
  if (!columnSizingText.includes('MARKDOWN_DATA_VIEW_DEFAULT_COLUMN_WIDTH_PX = 192') || !columnSizingText.includes("normalized === 'Value' || /^.+ Value$/.test(normalized)") || !columnSizingText.includes('return 184')) {
    throw new Error('expected Markdown data-view column sizing to keep type-specific value columns compact by default')
  }
  if (!columnsTableViewText.includes('Show ${Math.min(props.hiddenRowCount, MARKDOWN_DATA_VIEW_TABLE_RENDER_ROW_INCREMENT)} more columns') || !columnsTableViewText.includes('MarkdownDataViewColumnResizeHandle') || !columnsTableViewText.includes('<colgroup>') || !columnsTableViewText.includes('style={{ width: tableWidth }}') || !columnsTableViewText.includes('overflow-hidden border-b') || !columnsTableViewText.includes('border-separate border-spacing-0') || !columnsTableViewText.includes('sticky top-0 z-30 isolate') || !columnsTableViewText.includes('relative z-[31]')) {
    throw new Error('expected extracted MarkdownDataViewColumnsTableView to keep column-record pivot resize behavior')
  }
  if (!chipStylesText.includes('min-w-0 max-w-full overflow-hidden')) {
    throw new Error('expected data-view chips to ellipsize inside fixed-width columns instead of stretching column width')
  }
  const resizeHandlePath = path.resolve(process.cwd(), 'src', 'features', 'markdown', 'ui', 'MarkdownDataViewColumnResizeHandle.tsx')
  const resizeHandleText = fs.readFileSync(resizeHandlePath, { encoding: 'utf8' })
  if (!resizeHandleText.includes('bindResizeSeparatorDragRuntime') || !resizeHandleText.includes("cursor: 'col-resize'") || !resizeHandleText.includes('data-kg-markdown-data-view-column-resize')) {
    throw new Error('expected Markdown data-view column resize to reuse the shared resize separator drag runtime')
  }
}
