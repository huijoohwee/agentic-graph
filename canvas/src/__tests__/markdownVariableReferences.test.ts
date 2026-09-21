import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildMarkdownVariablePreviewByKey, renderMarkdownVariableReferenceChip } from '@/lib/markdown-core/ui/markdownInlineVariableMediaPreview'
import {
  buildMarkdownVariableSsotAnchorId,
  buildMarkdownVariableToken,
  collectMarkdownVariableSsotEntries,
  collectMarkdownVariableBrowseRows,
  collectMarkdownVariableSuggestions,
  findMarkdownVariableTokenAtOffset,
  parseMarkdownVariableTokens,
} from '@/features/markdown/ui/markdownVariableReferences'

export async function testMarkdownVariableReferencesParsesDeclarationRefAndFallback() {
  const text = '{{place:airport}} and {{place}} then {{city|venue}}'
  const tokens = parseMarkdownVariableTokens(text)
  if (tokens.length !== 3) throw new Error('expected 3 variable tokens')
  if (tokens[0]?.key !== 'place' || tokens[0]?.declaredValue !== 'airport') {
    throw new Error('expected declaration token to parse key and value')
  }
  if (tokens[1]?.key !== 'place' || tokens[1]?.declaredValue !== null) {
    throw new Error('expected reference token to parse key only')
  }
  if (tokens[2]?.key !== 'city' || tokens[2]?.fallback !== 'venue') {
    throw new Error('expected fallback token to parse key and fallback')
  }

  const tokenAtPlaceRef = findMarkdownVariableTokenAtOffset({ text, offset: text.indexOf('{{place}}') + 3 })
  if (!tokenAtPlaceRef || tokenAtPlaceRef.raw !== '{{place}}') {
    throw new Error('expected find token at caret offset to return matching variable token')
  }

  await Promise.resolve()
}

export async function testMarkdownVariableReferencesCollectSuggestionsFromFrontmatterAndDraft() {
  const sourceLines = [
    '---',
    'venue: Singapore',
    'authors:',
    '  - A. Author 1',
    '---',
    '',
    '{{place:airport}}',
    'Visit {{venue}}',
  ]
  const suggestions = collectMarkdownVariableSuggestions({
    sourceLines,
    draftText: 'Draft has {{city|venue}} and {{place}}',
  })
  if (!suggestions.includes('venue')) throw new Error('expected suggestions to include frontmatter key')
  if (!suggestions.includes('authors.0')) throw new Error('expected suggestions to include dotted frontmatter array path key')
  if (!suggestions.includes('place')) throw new Error('expected suggestions to include inline declaration key')
  if (!suggestions.includes('city')) throw new Error('expected suggestions to include fallback reference key')
  const browseRows = collectMarkdownVariableBrowseRows({
    sourceLines,
    draftText: 'Draft has {{city|venue}} and {{place}}',
  })
  const venueRow = browseRows.find(r => r.key === 'venue')
  if (!venueRow || venueRow.value !== 'Singapore' || venueRow.source !== 'frontmatter') {
    throw new Error('expected browse rows to resolve frontmatter key values')
  }
  assert.equal(browseRows.find(row => row.key === 'authors.0')?.value, 'A. Author 1')
  const placeRow = browseRows.find(r => r.key === 'place')
  if (!placeRow || placeRow.value !== 'airport' || placeRow.source !== 'inline') {
    throw new Error('expected browse rows to resolve inline declaration values')
  }
  await Promise.resolve()
}

export async function testMarkdownVariableReferencesBuildTokenByMode() {
  const ref = buildMarkdownVariableToken({ mode: 'ref', key: 'venue' })
  if (ref !== '{{venue}}') throw new Error('expected ref token')
  const created = buildMarkdownVariableToken({ mode: 'create', key: 'place', value: 'airport' })
  if (created !== '{{place:airport}}') throw new Error('expected create token')
  const fallback = buildMarkdownVariableToken({ mode: 'fallback', key: 'city', fallback: 'venue' })
  if (fallback !== '{{city|venue}}') throw new Error('expected fallback token')
  const anchorId = buildMarkdownVariableSsotAnchorId('Venue')
  if (anchorId !== 'kg-var-ssot-venue') throw new Error('expected deterministic variable ssot anchor id')
  const ssotEntries = collectMarkdownVariableSsotEntries([
    '---',
    'venue: "Singapore"',
    '---',
    '',
    '{{place:airport}}',
    'hello {{venue}}',
  ].join('\n'))
  const venueEntry = ssotEntries.find(r => r.key === 'venue')
  if (!venueEntry || venueEntry.source !== 'frontmatter' || venueEntry.line !== 2) {
    throw new Error('expected venue ssot to resolve to frontmatter line')
  }
  const placeEntry = ssotEntries.find(r => r.key === 'place')
  if (!placeEntry || placeEntry.source !== 'inline' || placeEntry.line !== 5) {
    throw new Error('expected place ssot to resolve to inline declaration line')
  }
  await Promise.resolve()
}

export function testMarkdownFrontmatterReferencesFollowSource() {
  const render = (caption: string) => {
    const source = `---
scene: {subjects: [{label: Pig}], camera: [{caption: '${caption}'}]}
---
{{scene.camera.0.caption}}`
    const values = buildMarkdownVariablePreviewByKey(source)
    assert.equal(values['scene.subjects.0.label']?.value, 'Pig')
    return renderToStaticMarkup(renderMarkdownVariableReferenceChip({ baseKey: 'caption', key: 'scene.camera.0.caption', raw: '{{scene.camera.0.caption}}', opts: { markdownVariablePreviewByKey: values } }))
  }
  assert.match(render('Sail to the dock.'), />Sail to the dock.</)
  assert.match(render('The renamed crew arrives.'), />The renamed crew arrives.</)
  assert.ok(!render('<script>alert(1)</script>').includes('<script>'))
  assert.match(renderToStaticMarkup(renderMarkdownVariableReferenceChip({ baseKey: 'missing', key: 'missing', raw: '{{missing|No caption}}', opts: {} })), />No caption</)
}
