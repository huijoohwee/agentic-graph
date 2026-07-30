import fs from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { handleStoryboardCardMetaWheelEvent, isRedundantWidgetCardMetadata } from '@/components/StoryboardWidgetCanvas/StoryboardCardMetaScrollRail'
import { commitStoryboardCardCanonicalText2d } from '@/components/StoryboardWidgetCanvas/storyboardCardCanonicalTextCommit2d'
import { isStoryboardHeaderDragBlockedTarget } from '@/components/StoryboardWidgetCanvas/storyboardCardOverlayInteractions2d'
import { readStoryboardCardSummaryText } from '@/components/StoryboardWidgetCanvas/storyboardCardSummaryText'
import { buildStoryboardCardTextModel } from '@/components/StoryboardWidgetCanvas/storyboardCardTextModel'
import { shouldStoryboardCardTextColumnOwnSummaryEditTarget } from '@/components/StoryboardWidgetCanvas/storyboardCardSummaryEditTarget'
import { readStoryboardCardSize2d } from '@/components/StoryboardWidgetCanvas/storyboardCardPlacements2d'
import { shouldStoryboardWidgetHeaderYieldToInteractiveTarget } from '@/components/StoryboardWidget/storyboardWidgetHeaderInteractiveTarget'
import { getStoryboardWidgetPanelChromeClassName } from '@/components/StoryboardWidget/storyboardWidgetPanelChromeClassName'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  buildGraphNodeCanonicalTextPatch,
  GRAPH_NODE_CARD_PROMPT_PROPERTY_KEYS,
  GRAPH_NODE_CARD_SUMMARY_PROPERTY_KEYS,
} from '@/lib/cards/graphNodeCardFields'
import { applyCardInlineCommandReplacement } from '@/lib/cards/CardInlineTextCommandMenuUtils'
import { computeStoryboardWidgetOverlayScreenBox } from '@/lib/storyboardWidget/overlayWorldDrag'
import type { GraphData } from '@/lib/graph/types'
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
export function testStoryboardCardTextLayoutKeepsSemanticLabelsReadable() {
  const authoredSummary = [
    'Imported  source evidence for a validation-ready storyboard card.',
    '',
    '![Evidence frame](https://media.invalid/source.png)',
    'Review   authored spacing before generation.',
  ].join('\n')
  const graphData: GraphData = {
    type: 'application/json',
    metadata: {
      frontmatterMeta: {
        pipeline: {
          stages: [
            { lane: 'Source', command: '/source.normalize', bindings: ['@source.frontmatter'], semantics: ['#frontmatter', '#no-hardcode'] },
          ],
        },
      },
    },
    nodes: [
      {
        id: 'source-card',
        type: 'RuntimeProofGate',
        label: 'Source evidence',
        properties: {
          lane: 'Source',
          summary: authoredSummary,
          action: 'Review and approve the source evidence before generation.',
        },
      },
      {
        id: 'frame-card',
        type: 'StoryboardFrame',
        label: 'Storyboard frame',
        properties: {
          lane: 'Storyboard',
          invocation: '/canvas.project #canvas @runtime-proof',
          summary: 'Frame-level storyboard card generated from approved source evidence.',
        },
      },
    ],
    edges: [{ id: 'source-to-frame', source: 'source-card', target: 'frame-card', label: 'produces', properties: {} }],
  }
  const board = buildStoryboardBoardModel({ graphData, graphRevision: 1 })
  const cards = board.lanes.flatMap(lane => lane.cards)
  assert(cards.find(card => card.id === 'source-card')?.summary === authoredSummary, 'expected Storyboard card model to preserve authored summary typography, media markup, and spacing')
  assert(cards.find(card => card.id === 'source-card')?.typeLabel === 'Runtime Proof Gate', 'expected compact PascalCase type labels to render as readable semantic words')
  assert(cards.find(card => card.id === 'frame-card')?.typeLabel === 'Storyboard Frame', 'expected storyboard frame type labels to render as readable semantic words')
  assert(JSON.stringify(cards.find(card => card.id === 'source-card')?.invocationTokens) === JSON.stringify(['/source.normalize', '@source.frontmatter', '#frontmatter']), 'expected Source card to display its bounded /, @, and # invocation chips')
  assert(JSON.stringify(cards.find(card => card.id === 'frame-card')?.invocationTokens) === JSON.stringify(['/canvas.project', '@runtime-proof', '#canvas']), 'expected explicit card invocation to display its bounded /, @, and # invocation chips')
}

export function testStoryboardCardTypedFrontmatterCellsPreserveAuthoredPromptAndMedia() {
  const prompt = 'Generate /image.to-glb @source-image.png #image-to-glb.\nPreserve authored spacing.'
  const editedPrompt = 'Generate /image.to-glb @source-image.png #image-to-glb.\nKeep the edited structure.'
  const mediaUrl = 'https://media.invalid/source-image.png'
  const typedProperties = {
    prompt: { key: 'prompt', type: 'string', value: prompt },
    mediaKind: { key: 'mediaKind', type: 'string', value: 'image' },
    mediaUrl: { key: 'mediaUrl', type: 'string', value: mediaUrl },
  }
  const buildCard = (properties: Record<string, unknown>) => {
    const graphData: GraphData = {
      type: 'application/json',
      nodes: [{
        id: 'typed-card',
        type: 'WidgetCard',
        label: 'Widget Card',
        properties: properties as GraphData['nodes'][number]['properties'],
      }],
      edges: [],
    }
    return buildStoryboardBoardModel({ graphData, graphRevision: 1 }).lanes[0]?.cards[0]
  }

  const initialCard = buildCard(typedProperties)
  assert(initialCard?.prompt === prompt, `expected typed frontmatter prompt to preserve authored text, got ${JSON.stringify(initialCard?.prompt)}`)
  assert(initialCard?.media?.kind === 'image', `expected typed frontmatter media kind to remain image, got ${initialCard?.media?.kind}`)
  assert(initialCard?.media?.url === mediaUrl, `expected typed frontmatter media URL to remain attached, got ${JSON.stringify(initialCard?.media?.url)}`)
  const viewEditModel = buildStoryboardCardTextModel({ prompt: initialCard.prompt })
  assert(viewEditModel.primaryRaw === prompt, 'expected the shared view/edit model to receive the exact unwrapped authored prompt')
  assert(viewEditModel.primaryDisplay === prompt, 'expected invocation tokens to remain visible in the shared read projection')

  const editedProperties = buildGraphNodeCanonicalTextPatch({
    currentProperties: typedProperties,
    propertyKeys: GRAPH_NODE_CARD_PROMPT_PROPERTY_KEYS,
    canonicalKey: 'prompt',
    nextValue: editedPrompt,
    preserveFormatting: true,
  })
  assert(editedProperties.mediaUrl === typedProperties.mediaUrl, 'expected prompt editing to preserve the typed media attachment cell')
  const rerenderedCard = buildCard(editedProperties)
  assert(rerenderedCard?.prompt === editedPrompt, `expected edited prompt to survive rerender, got ${JSON.stringify(rerenderedCard?.prompt)}`)
  assert(rerenderedCard?.media?.url === mediaUrl, 'expected attached media to survive prompt edit and rerender')
}

export function testStoryboardCardMetaRailSuppressesRedundantWidgetCardLabels() {
  assert(
    isRedundantWidgetCardMetadata({ lane: 'Widget Card', typeLabel: 'Widget Card' }),
    'expected duplicate Widget Card metadata to be suppressed',
  )
  assert(
    !isRedundantWidgetCardMetadata({ lane: 'Approval', typeLabel: 'Widget Card' }),
    'expected a distinct authored lane to remain visible',
  )
}

export function testStoryboardCardPromptPresetInsertionPreservesAuthoredPrompt() {
  const authoredPrompt = '/sme-care-agent @source.frontmatter @source.body\n\nAssess the active SME workspace sources.'
  const typedQuery = '/knowgrph-probe'
  const text = `${authoredPrompt}\n\n${typedQuery}`
  const preset = '/knowgrph.probe-tree\n\nGenerate 2-4 bounded, editable next-question cards.'
  const result = applyCardInlineCommandReplacement({
    text,
    selection: { start: text.length, end: text.length },
    sigil: '/',
    query: 'knowgrph-probe',
    replacement: preset,
    insertAsBlock: true,
  })
  assert(result.text.startsWith(authoredPrompt), 'expected the authored SME prompt to remain unchanged')
  assert(result.text.endsWith(preset), 'expected the Probe-Tree preset to replace only the active slash query')
  assert(!result.text.includes(typedQuery), 'expected the typed slash query to be removed')
  assert(!result.text.includes('@knowgrph.probe-tree'), 'expected slash preset insertion not to add the at-token alias')
  assert(!result.text.includes('#knowgrph.probe-tree'), 'expected slash preset insertion not to add the hash-token alias')
}

export function testStoryboardCardSummaryTextStripsInlineMediaEmbeds() {
  const rawSummary = [
    'Author supplied inline media. ![inline media](https://media.invalid/source.png?kg_media_token=redacted)',
    '<video src="https://media.invalid/source.mp4" title="source clip" controls></video>',
    '<audio src="https://media.invalid/source.mp3" controls></audio>',
    'Review source symptoms.',
  ].join('\n')
  const actual = readStoryboardCardSummaryText(rawSummary)
  assert(actual === 'Author supplied inline media.\nReview source symptoms.', `expected Storyboard summary text to strip inline media embeds, got ${JSON.stringify(actual)}`)
  const formattedSummary = `  ${rawSummary}\n\n  Preserve  authored   spacing.  `
  const patch = buildGraphNodeCanonicalTextPatch({
    currentProperties: { description: 'old summary' },
    propertyKeys: GRAPH_NODE_CARD_SUMMARY_PROPERTY_KEYS,
    canonicalKey: 'summary',
    nextValue: formattedSummary,
    preserveFormatting: true,
  })
  assert(patch.summary === formattedSummary, `expected WYSIWYG summary patch to preserve raw text formatting, got ${JSON.stringify(patch.summary)}`)
  assert(!('description' in patch), 'expected WYSIWYG summary patch to remove stale alias properties')
}

export function testStoryboardCardTextModelDoesNotDuplicatePrimaryPrompt() {
  const prompt = 'Generate /runtime #storyboard @asset response.'
  const textOnlyModel = buildStoryboardCardTextModel({
    summary: '',
    output: '',
    action: '',
    prompt,
  })
  assert(textOnlyModel.primaryRaw === prompt, `expected prompt to become the primary card Viewer text, got ${JSON.stringify(textOnlyModel.primaryRaw)}`)
  assert(textOnlyModel.primaryDisplay === prompt, `expected text-only prompt display to preserve authored grammar, got ${JSON.stringify(textOnlyModel.primaryDisplay)}`)
  assert(textOnlyModel.primaryField.id === 'prompt', `expected prompt-only Text Widget card edits to persist through prompt, got ${textOnlyModel.primaryField.id}`)
  assert(textOnlyModel.secondaryRaw === '', `expected prompt-only Text Widget not to duplicate into secondary text, got ${JSON.stringify(textOnlyModel.secondaryRaw)}`)
  const promptWithEmbeddedMedia = 'Generate a ![source image](https://media.invalid/source.png) text response for the active request.'
  const mediaPromptModel = buildStoryboardCardTextModel({ prompt: promptWithEmbeddedMedia })
  assert(mediaPromptModel.primaryRaw === promptWithEmbeddedMedia, 'expected the source model to retain its authored embedded-media reference until an intentional text edit')
  assert(mediaPromptModel.primaryDisplay === 'Generate a text response for the active request.', `expected the card read surface to omit duplicated embedded media, got ${JSON.stringify(mediaPromptModel.primaryDisplay)}`)
  const overlaySource = [fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/StoryboardCardOverlayLayer2d.tsx'), 'utf8'), fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/StoryboardCardTextEditSurface.tsx'), 'utf8')].join('\n')
  assert(overlaySource.includes("value={textModel.primaryRaw || card.slugline || ''}"), 'expected the shared Viewer editor to retain source-backed inline chips while editing')
  assert(overlaySource.includes("displayValue={textModel.primaryDisplay || card.slugline || ''}"), 'expected the shared Viewer read surface to remain media-free')
  assert(overlaySource.includes('buildStoryboardCardMediaTextareaAttachments([...displayMediaItems, displayMedia], card.title)'), 'expected the Storyboard text column to reuse the shared media attachment projection owner')
  assert(overlaySource.includes('projectedMediaAttachments={projectedMediaAttachments}'), 'expected the Storyboard Viewer editor to render media as shared virtual @ chips')
  assert(!overlaySource.includes('sourceContainsInlineMediaUrl'), 'expected the shared Viewer, not the Storyboard overlay, to suppress the edit-only duplicate media chip')
  const nextPrompt = 'Generate an edited /runtime #storyboard @asset response.'
  const promptPatch = buildGraphNodeCanonicalTextPatch({
    currentProperties: { imagePrompt: prompt },
    propertyKeys: textOnlyModel.primaryField.propertyKeys,
    canonicalKey: textOnlyModel.primaryField.canonicalKey,
    nextValue: nextPrompt,
    preserveFormatting: true,
  })
  assert(promptPatch.prompt === nextPrompt, `expected prompt-backed card edit to write canonical prompt, got ${JSON.stringify(promptPatch)}`)
  assert(!('imagePrompt' in promptPatch), 'expected prompt-backed card edit to remove stale prompt aliases')
  const summaryWithDistinctPrompt = buildStoryboardCardTextModel({
    summary: 'Reviewed source summary.',
    output: '',
    action: '',
    prompt,
  })
  assert(summaryWithDistinctPrompt.primaryField.id === 'summary', `expected summary-backed cards to keep summary as primary edit target, got ${summaryWithDistinctPrompt.primaryField.id}`)
  assert(summaryWithDistinctPrompt.secondaryRaw === prompt, 'expected a distinct prompt to remain available as secondary shared Card text')
  assert(summaryWithDistinctPrompt.secondaryField?.id === 'prompt', 'expected secondary Card text to preserve its prompt semantic label')
  const probeResponseModel = buildStoryboardCardTextModel({ summary: 'Which evidence should select this branch?', output: '', action: 'Review the answer before selection.', prompt: '/knowgrph.probe-tree', typeLabel: 'Probe-Tree Card' })
  assert(probeResponseModel.primaryField.id === 'summary' && probeResponseModel.secondaryField?.id === 'output' && probeResponseModel.secondaryRaw === '' && probeResponseModel.secondaryEditable, `expected Summary question plus empty editable Output, got ${JSON.stringify(probeResponseModel)}`)
  const dialogueOnlyModel = buildStoryboardCardTextModel({ dialogue: 'Keep the authored dialogue.' })
  assert(dialogueOnlyModel.primaryField.id === 'dialogue', `expected dialogue-only cards to remain visible and editable, got ${dialogueOnlyModel.primaryField.id}`)
  const styleOnlyModel = buildStoryboardCardTextModel({ style: 'Neutral documentary treatment.' })
  assert(styleOnlyModel.primaryField.id === 'style', `expected style-only cards to remain visible and editable, got ${styleOnlyModel.primaryField.id}`)
}

export function testStoryboardCardPromptCommitMirrorsStrybldrMarkdownSource() {
  const cardId = 'prompt-card'
  const prompt = 'Draft response from the active request.'
  const nextPrompt = 'Edited response from the active request.'
  let committedNodeId = ''
  let committedProperties: Record<string, unknown> = {}
  const history: string[] = []
  const textModel = buildStoryboardCardTextModel({ summary: '', output: '', action: '', prompt })
  commitStoryboardCardCanonicalText2d({
    addHistory: label => history.push(label),
    canonicalKey: textModel.primaryField.canonicalKey,
    cardId,
    currentProperties: { imagePrompt: prompt },
    historyLabel: 'Storyboard prompt',
    nextValue: nextPrompt,
    preserveFormatting: true,
    propertyKeys: textModel.primaryField.propertyKeys,
    updateNode: (id, patch) => {
      committedNodeId = id
      committedProperties = (patch.properties || {}) as Record<string, unknown>
    },
  })
  assert(committedNodeId === cardId, `expected prompt edit to route through the canonical node owner, got ${committedNodeId}`)
  assert(committedProperties.prompt === nextPrompt, `expected canonical node update to receive prompt edit, got ${JSON.stringify(committedProperties)}`)
  assert(!('imagePrompt' in committedProperties), 'expected canonical node update to neutralize stale prompt aliases')
  assert(history.join('|') === 'Storyboard prompt', `expected one history entry for prompt commit, got ${JSON.stringify(history)}`)
}

export function testStoryboardCardPromptCommitUpdatesDurableDraftBeforeRun() {
  const graphData: GraphData = {
    type: 'flow',
    nodes: [{ id: 'frontmatter::n1', type: 'TextGeneration', label: 'Widget Card', properties: { imagePrompt: 'Old prompt', keep: 'yes' } }],
    edges: [],
  }
  let committedGraph: GraphData | null = null
  let canonicalStoreProperties: Record<string, unknown> | null = null
  commitStoryboardCardCanonicalText2d({
    addHistory: () => void 0,
    canonicalKey: 'prompt',
    cardId: 'n1',
    commitGraphData: next => { committedGraph = next },
    currentProperties: {},
    graphData,
    historyLabel: 'Storyboard prompt',
    nextValue: '/crawler-agent @url:https://example.com @reference-policy #canvas',
    preserveFormatting: true,
    propertyKeys: ['prompt', 'imagePrompt'],
    updateNode: (_id, patch) => { canonicalStoreProperties = (patch.properties || {}) as Record<string, unknown> },
  })
  const committedNode = committedGraph?.nodes?.[0]
  assert(committedNode?.properties?.prompt === '/crawler-agent @url:https://example.com @reference-policy #canvas', `expected the durable draft graph to receive the prompt before Run, got ${JSON.stringify(committedNode?.properties)}`)
  assert(!('imagePrompt' in (committedNode?.properties || {})), 'expected durable prompt commit to neutralize the stale alias')
  assert(committedNode?.properties?.keep === 'yes', 'expected durable prompt commit to retain sibling properties')
  assert(canonicalStoreProperties?.prompt === '/crawler-agent @url:https://example.com @reference-policy #canvas', 'expected prompt commit to mirror the durable draft into the canonical graph store before Run')
  assert(!('imagePrompt' in (canonicalStoreProperties || {})), 'expected the canonical graph store mirror to neutralize the stale prompt alias')
}

export function testStoryboardCardSequentialPromptCommitsUseLiveGraphState() {
  const firstCardId = 'prompt-card-a'
  const secondCardId = 'prompt-card-b'
  const firstPrompt = 'Draft response for first card.'
  const secondPrompt = 'Draft response for second card.'
  const nextFirstPrompt = 'Edited response for first card.'
  const nextSecondPrompt = 'Edited response for second card.'
  const staleRenderGraphData: GraphData = {
    type: 'application/json',
    nodes: [
      { id: firstCardId, type: 'TextWidget', label: 'Text Widget', properties: { imagePrompt: firstPrompt, keep: 'first' } },
      { id: secondCardId, type: 'TextWidget', label: 'Text Widget', properties: { imagePrompt: secondPrompt, keep: 'second' } },
    ],
    edges: [],
  }
  const store = useGraphStore.getState()
  const previousGraphData = store.graphData
  const history: string[] = []
  const committedGraphs: GraphData[] = []
  const textModel = buildStoryboardCardTextModel({ summary: '', output: '', action: '', prompt: firstPrompt })
  const commitPrompt = (cardId: string, nextValue: string) => {
    const liveGraphData = useGraphStore.getState().graphData
    const liveNode = liveGraphData?.nodes.find(node => String(node.id || '') === cardId)
    commitStoryboardCardCanonicalText2d({
      addHistory: label => history.push(label),
      canonicalKey: textModel.primaryField.canonicalKey,
      cardId,
      currentProperties: (liveNode?.properties || {}) as Record<string, unknown>,
      historyLabel: 'Storyboard prompt',
      nextValue,
      preserveFormatting: true,
      propertyKeys: textModel.primaryField.propertyKeys,
      updateNode: (id, patch) => {
        const currentGraphData = useGraphStore.getState().graphData
        if (!currentGraphData) return
        const nextGraphData = {
          ...currentGraphData,
          nodes: currentGraphData.nodes.map(node => String(node.id || '') === id ? { ...node, ...patch } : node),
        }
        committedGraphs.push(nextGraphData)
        useGraphStore.setState({ graphData: nextGraphData } as never)
      },
    })
  }
  try {
    useGraphStore.setState({ graphData: staleRenderGraphData } as never)
    commitPrompt(firstCardId, nextFirstPrompt)
    commitPrompt(secondCardId, nextSecondPrompt)
    const finalGraph = useGraphStore.getState().graphData
    const firstCard = finalGraph?.nodes?.find(node => String(node.id || '') === firstCardId)
    const secondCard = finalGraph?.nodes?.find(node => String(node.id || '') === secondCardId)
    assert(firstCard?.properties?.prompt === nextFirstPrompt, `expected second prompt commit not to resurrect stale first-card graph properties, got ${JSON.stringify(firstCard?.properties)}`)
    assert(secondCard?.properties?.prompt === nextSecondPrompt, `expected second-card prompt commit to persist, got ${JSON.stringify(secondCard?.properties)}`)
    assert(firstCard?.properties?.keep === 'first' && secondCard?.properties?.keep === 'second', 'expected prompt commits to preserve unrelated node properties from the live graph')
    assert(committedGraphs.length === 2, `expected both prompt commits to update graph state, got ${committedGraphs.length}`)
    assert(history.join('|') === 'Storyboard prompt|Storyboard prompt', `expected two prompt history entries, got ${JSON.stringify(history)}`)
  } finally {
    useGraphStore.setState({ graphData: previousGraphData } as never)
  }
}

export function testStoryboardCardSummaryTextColumnLetsInlineEditorOwnDirectTargets() {
  const dom = new JSDOM('<section><section data-kg-card-inline-edit="1"><p>summary</p></section><button>Run</button><span data-blank="1"></span></section>')
  const doc = dom.window.document
  const textColumn = doc.querySelector('section')
  const inlineText = doc.querySelector('[data-kg-card-inline-edit="1"] p')
  const button = doc.querySelector('button')
  const blank = doc.querySelector('[data-blank="1"]')
  assert(inlineText && !shouldStoryboardCardTextColumnOwnSummaryEditTarget(inlineText), 'expected direct card text clicks to stay owned by CardInlineTextEditor')
  assert(button && !shouldStoryboardCardTextColumnOwnSummaryEditTarget(button), 'expected Storyboard text column not to steal control clicks')
  assert(blank && shouldStoryboardCardTextColumnOwnSummaryEditTarget(blank, textColumn), 'expected blank text-column clicks to use the Storyboard edit fallback')
  const activeEditor = doc.createElement('section')
  activeEditor.setAttribute('contenteditable', 'true')
  activeEditor.setAttribute('data-kg-card-inline-edit-input', '1')
  activeEditor.setAttribute('data-kg-card-inline-viewer-edit-surface', '1')
  textColumn?.appendChild(activeEditor)
  assert(blank && !shouldStoryboardCardTextColumnOwnSummaryEditTarget(blank, textColumn), 'expected blank text-column clicks to yield to an active Viewer editor so blur can commit')
}

export function testStoryboardCardHeaderDragYieldsToInlineEditors() {
  const dom = new JSDOM('<header><section data-kg-card-inline-edit="1"><span>Runtime Gate</span></section><button>Run</button><span data-drag="1"></span></header>')
  const doc = dom.window.document
  const inlineTitle = doc.querySelector('[data-kg-card-inline-edit="1"] span')
  const button = doc.querySelector('button')
  const dragBlank = doc.querySelector('[data-drag="1"]')
  assert(inlineTitle && isStoryboardHeaderDragBlockedTarget(inlineTitle), 'expected Storyboard header drag to yield to shared Card inline title displays')
  assert(button && isStoryboardHeaderDragBlockedTarget(button), 'expected Storyboard header drag to yield to header controls')
  assert(dragBlank && !isStoryboardHeaderDragBlockedTarget(dragBlank), 'expected blank Storyboard header chrome to remain draggable')
}

export function testStoryboardWidgetPanelHeaderYieldsToSharedInlineEditors() {
  const dom = new JSDOM('<header><section data-kg-card-inline-edit="1"><span>Runtime Gate</span></section><section contenteditable="true">Summary</section><span data-drag="1"></span></header>')
  const doc = dom.window.document
  const inlineTitle = doc.querySelector('[data-kg-card-inline-edit="1"] span')
  const activeViewer = doc.querySelector('[contenteditable="true"]')
  const dragBlank = doc.querySelector('[data-drag="1"]')
  assert(inlineTitle && shouldStoryboardWidgetHeaderYieldToInteractiveTarget(inlineTitle), 'expected shared Storyboard header chrome to yield to Card inline title display surfaces')
  assert(activeViewer && shouldStoryboardWidgetHeaderYieldToInteractiveTarget(activeViewer), 'expected shared Storyboard header chrome to yield to Viewer edit surfaces')
  assert(dragBlank && !shouldStoryboardWidgetHeaderYieldToInteractiveTarget(dragBlank), 'expected blank shared Storyboard header chrome to remain draggable')
}

export function testStoryboardCardOverlayTextLayoutUsesReadableCardChrome() {
  const source = [
    fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/StoryboardCardOverlayLayer2d.tsx'), 'utf8') + fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/StoryboardCardTextEditSurface.tsx'), 'utf8'),
    fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/useStoryboardCardOverlayProjection2d.ts'), 'utf8'),
  ].join('\n')
  const surface = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/StoryboardWidgetCanvasSurface.tsx'), 'utf8')
  const runtime = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas.runtime.tsx'), 'utf8')
  const inlineEditor = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/cards/CardInlineTextEditor.tsx'), 'utf8')
  const inlineEditorSupport = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/cards/CardInlineTextEditorSupport.ts'), 'utf8')
  const inlineDisplaySurface = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/cards/CardInlineTextDisplaySurface.tsx'), 'utf8')
  const inlineEditingSurface = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/cards/CardInlineTextEditingSurface.tsx'), 'utf8')
  const cardMarkdownPreview = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/cards/CardMarkdownPreview.tsx'), 'utf8')
  const mediaResponsiveCss = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/markdown-media-responsive.css'), 'utf8')
  const overlayProxy = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/canvas/storyboard-widget-overlay-proxy.ts'), 'utf8')
  const overlayInteractions = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/storyboardCardOverlayInteractions2d.ts'), 'utf8')
  const headerInteractiveTarget = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidget/storyboardWidgetHeaderInteractiveTarget.ts'), 'utf8')
  const panelChrome = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidget/StoryboardWidgetPanelChrome.tsx'), 'utf8')
  const panelChromeClassName = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidget/storyboardWidgetPanelChromeClassName.ts'), 'utf8')
  const metaRail = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/StoryboardCardMetaScrollRail.tsx'), 'utf8')
  const cardTextSurfaceFrame = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/cards/cardTextSurfaceFrame.ts'), 'utf8')
  for (const snippet of [
    'data-kg-storyboard-card-title-row="1"',
    'ariaLabel={`Storyboard title for ${card.id}`}',
    'editorSurface="viewer"',
    'data-kg-storyboard-card-pixel-snap="1"',
    'data-kg-storyboard-card-vector-zoom="1"',
    'snapToDevicePixels: true',
    "import { emitStoryboardWidgetGeometryCommitted } from '@/lib/canvas/storyboard-widget-overlay-proxy'",
    "import { applyVectorPaintedOverlayBox, projectVectorPaintedOverlayZoomBox, readVectorPaintedOverlayScale, type VectorPaintedOverlayScaleProjectionBase } from '@/lib/canvas/vectorPaintedOverlayProjection'",
    'const currentTransform = getTransform()',
    'shouldFreezeProjectionForFlowPortHandleDrag()',
    'const transformScale = currentTransform && Number.isFinite(currentTransform.k) && currentTransform.k > 0 ? currentTransform.k : 1',
    'const paintScale = fixedLayoutEnabled',
    'computeCollectiveCameraFollowScaleFromBaseline({',
    'baselineZoomK: storyboardCardZoomBaselineKRef.current',
    'const zoomLayoutBaseBoxByCardIdRef = React.useRef<Map<string, VectorPaintedOverlayScaleProjectionBase>>(new Map())',
    'projectVectorPaintedOverlayZoomBox({',
    'transform: currentTransform',
    'paintScale',
    'applyVectorPaintedOverlayBox(item.el, {',
    'left: box.left',
    'top: box.top',
    'scale: box.scale',
    'emitStoryboardWidgetGeometryCommitted()',
    'STORYBOARD_WIDGET_PANEL_TITLE_CLASS_NAME',
    'grid-cols-[minmax(0,1fr)_minmax(6.25rem,36%)]',
    'data-kg-storyboard-card-body-layout="brief-media"',
    'CARD_TEXT_SURFACE_COLUMN_CLASS_NAME',
    'CARD_TEXT_SURFACE_SCROLL_CLASS_NAME',
    'data-kg-storyboard-card-brief="1"',
    'data-kg-storyboard-card-summary-scroll="1"',
    'data-kg-canvas-wheel-ignore="true"',
    'data-kg-canvas-pointer-ignore="true"',
    'data-kg-media-scroll-surface="1"',
    'onWheelCapture={event => event.stopPropagation()}',
    'shouldStoryboardCardTextColumnOwnSummaryEditTarget(event.target, event.currentTarget)',
    'if (target && isStoryboardHeaderDragBlockedTarget(target)) return',
    'React.useState<number | null>(null)',
    'data-kg-storyboard-card-active-text-field={textModel.primaryField.id}',
    'ariaLabel={`${textModel.primaryField.label} for ${card.id}`}',
    'placeholder={textModel.primaryField.placeholder}',
    'onCommit={nextValue => onCommitText(card, textModel.primaryField, nextValue)}',
    'data-kg-storyboard-card-output-pane="1"',
    'const outputField = textModel.secondaryEditable ? textModel.secondaryField : null',
    'CARD_TEXT_SURFACE_VIEW_CLASS_NAME',
    'CARD_TEXT_SURFACE_EDIT_CLASS_NAME',
    'CARD_TEXT_SURFACE_TEXT_CLASS_NAME',
    'mediaCommandMode="external"',
    'inlineChipDensity="compact"',
    'showCommandLaunchers={false}',
    "textModel.secondaryEditable && textModel.secondaryField?.id === 'output' ? (",
    '<StoryboardCardOutputEditSurface card={card} textModel={textModel} onActivate={() => onSelect(card)} onCommitText={onCommitPrimaryText} />',
    'ariaLabel={`${outputField.label} for ${card.id}`}',
    'placeholder={outputField.placeholder}',
    'markdownCommandMenus={false}',
    'onCommit={nextValue => onCommitText(card, outputField, nextValue)}',
    '<StoryboardCardMetaScrollRail card={card} onCommitLane={onCommitLane} onCommitType={onCommitType} onSourceReferenceActivate={onSourceReferenceActivate} />',
    'card, runCard: onRun',
    'void runWorkflowNode?.(card.id)',
  ]) {
    assert(source.includes(snippet), `expected Storyboard card overlay to keep readable text layout snippet: ${snippet}`)
  }
  const metaRailIndex = source.indexOf('<StoryboardCardMetaScrollRail card={card} onCommitLane={onCommitLane} onCommitType={onCommitType} onSourceReferenceActivate={onSourceReferenceActivate} />')
  const summaryScrollIndex = source.indexOf('data-kg-storyboard-card-summary-scroll="1"')
  assert(metaRailIndex >= 0 && summaryScrollIndex >= 0 && metaRailIndex < summaryScrollIndex, 'expected Storyboard card metadata rail to render above the summary editor')
  const titleLabelIndex = source.indexOf('ariaLabel={`Storyboard title for ${card.id}`}')
  const titleViewerSurfaceIndex = source.indexOf('editorSurface="viewer"', titleLabelIndex)
  const titleCommitIndex = source.indexOf('onCommit={nextValue => onCommitTitle(card, nextValue)}', titleLabelIndex)
  assert(titleLabelIndex >= 0 && titleViewerSurfaceIndex > titleLabelIndex && titleViewerSurfaceIndex < titleCommitIndex, 'expected Storyboard title editor to opt into the shared Viewer edit surface')
  for (const snippet of [
    'data-kg-storyboard-card-meta-row="1"',
    'data-kg-storyboard-card-meta-scroll="1"',
    'data-kg-canvas-wheel-ignore="true"',
    'data-kg-canvas-pointer-ignore="true"',
    'data-kg-media-scroll-surface="1"',
    'overflow-x-auto overflow-y-hidden overscroll-contain',
    'handleStoryboardCardMetaWheelEvent(event, event.currentTarget)',
    'rail.addEventListener(\'wheel\', handleWheel, { passive: false, capture: true })',
    '<header',
    'border-b pb-1',
    'max-w-[5.75rem] shrink-0 truncate rounded border',
    'max-w-[8.75rem] shrink-0 truncate rounded border',
    '<StoryboardCardInvocationChips tokens={card.invocationTokens} />',
  ]) {
    assert(metaRail.includes(snippet), `expected Storyboard card metadata rail to own local scroll and gesture guard snippet: ${snippet}`)
  }
  assert(!metaRail.includes('<footer'), 'expected top Storyboard card metadata rail not to use footer semantics')
  assert(!metaRail.includes('mt-auto'), 'expected top Storyboard card metadata rail not to reserve bottom alignment')
  assert(metaRail.includes('value={card.lane || \'Storyboard\'}'), 'expected Storyboard card metadata rail to own compact lane metadata')
  assert(metaRail.includes('value={card.typeLabel}'), 'expected Storyboard card metadata rail to own compact type metadata')
  assert(!source.includes('value={card.lane || \'Storyboard\'}'), 'expected Storyboard card header not to duplicate metadata rail lane metadata')
  assert(!source.includes('value={card.typeLabel}'), 'expected Storyboard card header not to duplicate metadata rail type metadata')
  assert(surface.includes('runWorkflowNode: (nodeId: string) => Promise<void> | void'), 'expected Storyboard surface to accept the shared workflow runner for fixed card Run')
  assert(surface.includes('runWorkflowNode={props.runWorkflowNode}'), 'expected Storyboard surface to pass the shared workflow runner into fixed cards')
  assert(runtime.includes('runWorkflowNode={runWorkflowNode}'), 'expected Storyboard runtime to thread fixed card Run through the shared workflow runner')
  assert(!source.includes('grid-rows-[auto_minmax(0,1fr)_auto]'), 'expected Storyboard card text column not to reserve a blank middle row that hides useful card copy')
  assert(!source.includes('translate3d(${box.left}px, ${box.top}px, 0) scale(${box.scale})'), 'expected Storyboard card projection not to scale a composited transform texture at max zoom')
  assert(!source.includes('const paintScale = fixedLayoutEnabled ? 1 : transformScale'), 'expected fixed Storyboard cards to follow the shared camera scale instead of remaining screen-fixed')
  assert(!source.includes('if (fixedLayoutEnabled && previous)'), 'expected fixed Storyboard cards not to freeze their previous screen box during camera updates')
  assert(!source.includes("willChange: 'transform'"), 'expected Storyboard card projection not to request transform raster compositing')
  assert(!source.includes("backfaceVisibility: 'hidden'"), 'expected Storyboard card projection not to force a transformed compositor layer')
  assert(mediaResponsiveCss.includes("[data-kg-card-inline-chip-density='compact'] .kg-inline-chip-shell-15ch") && mediaResponsiveCss.includes('line-height: inherit') && mediaResponsiveCss.includes('padding-block: 0'), 'expected compact Card inline chip density to inherit Storyboard summary text metrics')
  assert(mediaResponsiveCss.includes("[data-kg-card-inline-chip-density='compact'] [data-kg-card-inline-keyword-pill='1']"), 'expected compact Card inline density to cover keyword and invocation chip line-height')
  assert(inlineEditor.includes("inlineChipDensity = 'regular'") && inlineEditor.includes('inlineChipDensity={inlineChipDensity}'), 'expected CardInlineTextEditor to keep compact chip density explicit and opt-in')
  assert(inlineDisplaySurface.includes('inlineChipDensity={props.inlineChipDensity}'), 'expected CardInlineTextDisplaySurface to thread compact density into CardMarkdownPreview')
  assert(cardMarkdownPreview.includes("inlineChipDensity?: 'regular' | 'compact'") && cardMarkdownPreview.includes("[font-size:inherit] [line-height:inherit]") && cardMarkdownPreview.includes('data-kg-card-inline-chip-density'), 'expected CardMarkdownPreview compact mode to inherit card typography instead of hardcoding text-xs leading-5')
  assert(inlineEditingSurface.includes("inlineChipDensity === 'compact' ? editorClassName"), 'expected compact Viewer card editor to avoid appending DataView control padding and text sizing')
  assert(cardTextSurfaceFrame.includes("export const CARD_TEXT_SURFACE_COLUMN_CLASS_NAME") && cardTextSurfaceFrame.includes('rounded border bg-[color:var(--kg-panel-bg)]/70 p-1.5'), 'expected shared Card text frame to own the readable bordered surface chrome')
  assert(cardTextSurfaceFrame.includes("export const CARD_TEXT_SURFACE_TEXT_CLASS_NAME") && cardTextSurfaceFrame.includes('text-[10px] font-medium leading-4 text-[color:var(--kg-text-secondary)]'), 'expected shared Card text frame to own summary typography')
  assert(cardTextSurfaceFrame.includes('UI_VIEW_EDIT_SURFACE_AREA_CLASS_NAME') && !cardTextSurfaceFrame.includes("'min-h-full min-h-[3rem]'"), 'expected shared Card edit surface to fill the read frame through the neutral area owner without competing minimum heights')
  const sharedPanelChromeClassName = getStoryboardWidgetPanelChromeClassName()
  assert(sharedPanelChromeClassName.split(/\s+/).includes('border') && !sharedPanelChromeClassName.includes('shadow'), 'expected the shared Storyboard Widget chrome owner to align Card and Rich Media frame styling without ghost shadows')
  assert(!source.includes('overflow-visible rounded-md shadow-md'), 'expected Storyboard Card to avoid a downstream frame-style override')
  assert(source.includes("from '@/lib/cards/cardTextSurfaceFrame'"), 'expected Storyboard Card summary to consume the shared Card text frame owner')
  assert(!source.includes('editorClassName="h-full min-h-[3rem] overflow-auto text-[10px] font-medium leading-4 text-[color:var(--kg-text-primary)]'), 'expected Storyboard summary edit mode not to mutate text tone from the read surface')
  assert(source.includes('nextValue,\n      preserveFormatting: true,'), 'expected Storyboard summary commits to preserve raw Viewer WYSIWYG text and spacing on graph writeback')
  assert(!source.includes('nextValue: readStoryboardCardSummaryText(nextValue)'), 'expected Storyboard summary commits not to reuse read-only display projection for graph writeback')
  assert(!source.includes('<p className="m-0 max-h-[2.625rem]'), 'expected Storyboard card body not to render widget text through a local paragraph surface')
  assert(!source.includes('textModel.secondaryDisplay || card.prompt'), 'expected Text Widget seed prompt not to duplicate below the shared summary Viewer')
  assert(!source.includes('editorClassName="min-w-[8rem] rounded border bg-[color:var(--kg-input-bg)]'), 'expected Storyboard title edit mode not to reuse local bordered input chrome')
  assert(inlineEditorSupport.includes("displayLineClamp?: 'density' | 'none'"), 'expected shared Card surface to expose an explicit density-clamp policy')
  assert(inlineEditor.includes("displayLineClamp === 'density'") && source.includes('displayLineClamp="none"'), 'expected full Storyboard Card surfaces to preserve caller-owned wrapping without Data View truncation')
  assert(overlayProxy.includes('[data-kg-canvas-pointer-ignore="true"]'), 'expected Storyboard overlay proxy to treat pointer-ignore scroll surfaces as interactive controls')
  assert(overlayProxy.includes('[data-kg-media-scroll-surface="1"]'), 'expected Storyboard overlay proxy to treat inner scroll surfaces as interactive controls')
  assert(overlayInteractions.includes('shouldStoryboardWidgetHeaderYieldToInteractiveTarget'), 'expected fixed Storyboard card header drag to reuse the shared header interactive target guard')
  assert(headerInteractiveTarget.includes('[data-kg-card-inline-edit="1"]'), 'expected Storyboard header drag to yield to Card inline editor display surfaces before edit mode')
  assert(panelChrome.includes('shouldStoryboardWidgetHeaderYieldToInteractiveTarget(event.target)'), 'expected reusable Storyboard widget header chrome to yield before starting header drag')
  assert(overlayInteractions.includes('shouldForwardWheel: event => !isWidgetInnerPanelWheelTarget(event, root)'), 'expected Storyboard overlay wheel forwarding to yield to card-owned scroll surfaces')
  assert(source.includes('propertyKeys: field.propertyKeys'), 'expected Storyboard primary text commits to reuse the selected graph card text field spec')
  assert(!source.includes('onCommitSummary'), 'expected Storyboard primary text commits not to hardwire prompt-backed Text Widgets into summary')
  assert(!source.includes('React.useState(0)'), 'expected Storyboard cards not to auto-open every Viewer editor on mount')
}

export function testStoryboardCardOverlayProjectionSnapsToDevicePixels() {
  const box = computeStoryboardWidgetOverlayScreenBox({
    transform: { k: 2.72, x: 0.21, y: 0.39 },
    centerWorld: { x: 128, y: 96 },
    devicePixelRatio: 2,
    snapToDevicePixels: true,
    width: 101,
    height: 63,
  })
  assert(box.left === 211, `expected snapped card left to land on a device pixel, got ${box.left}`)
  assert(box.top === 176, `expected snapped card top to land on a device pixel, got ${box.top}`)
  assert(box.scale === 2.72, `expected snapping to preserve zoom scale, got ${box.scale}`)
}

export function testStoryboardCardOverlayLayoutKeepsSharedAspectRatioSizing() {
  const card = { id: 'card-1', type: 'StoryboardFrame', label: 'Frame', properties: {} }
  const compactCard = { ...card, id: 'card-compact', properties: { 'visual:width': 284, 'visual:height': 160 } }
  const wide = readStoryboardCardSize2d(card, '16:9')
  const vertical = readStoryboardCardSize2d(card, '9:16')
  const compact = readStoryboardCardSize2d(compactCard, '16:9')
  assert(wide.width > wide.height, `expected 16:9 storyboard card size to stay landscape, got ${JSON.stringify(wide)}`)
  assert(vertical.height > vertical.width, `expected 9:16 storyboard card size to stay vertical, got ${JSON.stringify(vertical)}`)
  assert(compact.width === 284 && compact.height === 160, `expected explicit sub-default Card size to remain responsive without default-size snap-back, got ${JSON.stringify(compact)}`)
}

export function testStoryboardCardInvocationChipsReuseSharedInvocationRenderer() {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/StoryboardCardInvocationChips.tsx'), 'utf8')
  for (const snippet of [
    'resolveInlineInvocationChipClassName',
    'renderAgenticOsInvocationKeywordChip',
    'sourceLink: false',
    'UI_INLINE_CHIP_LABEL_15CH_CLASSNAME',
    'data-kg-storyboard-card-invocation-chips="1"',
    'overflow-x-auto overflow-y-hidden',
    'overscroll-contain',
    'data-kg-canvas-wheel-ignore="true"',
    'data-kg-canvas-pointer-ignore="true"',
    'data-kg-media-scroll-surface="1"',
    'className="shrink-0 list-none"',
    "token.startsWith('@')",
  ]) {
    assert(source.includes(snippet), `expected Storyboard invocation chips to reuse shared chip contract: ${snippet}`)
  }
}

export function testStoryboardCardMetaWheelScrollsInsideRail() {
  const dom = new JSDOM('<!doctype html><html><body><header></header></body></html>', { url: 'http://localhost' })
  const rail = dom.window.document.querySelector('header') as HTMLElement | null
  assert(rail, 'expected metadata rail fixture')
  Object.defineProperty(rail, 'clientWidth', { configurable: true, value: 100 })
  Object.defineProperty(rail, 'scrollWidth', { configurable: true, value: 220 })
  let prevented = 0
  let stopped = 0
  let stoppedImmediate = 0
  const event = {
    deltaX: 0,
    deltaY: 48,
    preventDefault: () => { prevented += 1 },
    stopImmediatePropagation: () => { stoppedImmediate += 1 },
    stopPropagation: () => { stopped += 1 },
  } as unknown as WheelEvent
  handleStoryboardCardMetaWheelEvent(event, rail)
  const firstScrollLeft = Number(rail.scrollLeft)
  assert(firstScrollLeft === 48, `expected metadata wheel to scroll the rail horizontally, got ${firstScrollLeft}`)
  assert(prevented === 1 && stopped === 1 && stoppedImmediate === 1, 'expected metadata wheel to consume the event before canvas zoom or pan handlers')
  handleStoryboardCardMetaWheelEvent({ ...event, deltaY: 400 } as unknown as WheelEvent, rail)
  const clampedScrollLeft = Number(rail.scrollLeft)
  assert(clampedScrollLeft === 120, `expected metadata wheel to clamp to max horizontal scroll, got ${clampedScrollLeft}`)
}
