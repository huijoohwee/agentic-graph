import {
  buildFloatingPanelChatComposerDisplayText,
  buildFloatingPanelChatComposerOverlayParts,
  deleteFloatingPanelChatComposerProjectedTokenDisplayRange,
  isFloatingPanelChatComposerProjectedCaretInsideChip,
  mapFloatingPanelChatComposerDisplayIndexToRawIndex,
  mapFloatingPanelChatComposerRawIndexToDisplayIndex,
  resolveFloatingPanelChatComposerRawText,
  resolveFloatingPanelChatComposerProjectedCaretEnd,
} from '@/features/chat/floatingPanelChat/FloatingPanelChatComposerMediaOverlay'

export function testFloatingPanelChatComposerMediaProjectionPreservesInvocationGrammar() {
  const raw = '/prd-tad.create ![strybldr-starter-source.png](https://example.com/media/strybldr-starter-source.png) #media'
  const display = buildFloatingPanelChatComposerDisplayText(raw)
  if (display !== '/prd-tad.create @strybldr-starter-source.png #media') throw new Error(`expected / @ # composer display grammar to stay intact, got ${JSON.stringify(display)}`)
  const overlay = buildFloatingPanelChatComposerOverlayParts(raw)
  const mediaPart = overlay.parts.find(part => part.kind === 'media')
  const invocationMetrics = overlay.parts.flatMap(part => part.kind === 'invocation' ? [`${part.tokenKind}:${part.text}`] : [])
  if (!overlay.hasOverlay || !mediaPart || mediaPart.displayText !== '@strybldr-starter-source.png') {
    throw new Error(`expected @ media projection in the shared overlay, got ${JSON.stringify(overlay)}`)
  }
  if (JSON.stringify(invocationMetrics) !== JSON.stringify(['slash:/prd-tad.create', 'keyword:#media'])) throw new Error(`expected / and # tokens to render shared invocation chip metrics next to @ media, got ${JSON.stringify(invocationMetrics)}`)
  const rawRoundTrip = resolveFloatingPanelChatComposerRawText(display, raw)
  if (rawRoundTrip !== raw) {
    throw new Error(`expected projected @ media display to resolve back to raw media markdown, got ${JSON.stringify(rawRoundTrip)}`)
  }
  const compactInvocationRoundTrip = resolveFloatingPanelChatComposerRawText('I can ...#storyboard ../soul.load#media@operator, better in#storyboard', 'I can ...#storyboard ../soul.load#media@operator, better in#storyboard')
  if (compactInvocationRoundTrip !== 'I can ...#storyboard ../soul.load#media@operator, better in#storyboard') {
    throw new Error(`expected compact adjacent / # @ composer text to preserve raw edit text before submit, got ${JSON.stringify(compactInvocationRoundTrip)}`)
  }
  const displayMediaStart = display.indexOf('@strybldr-starter-source.png')
  const rawMediaStart = raw.indexOf('![')
  if (mapFloatingPanelChatComposerDisplayIndexToRawIndex(raw, displayMediaStart) !== rawMediaStart) {
    throw new Error('expected caret before projected @ media chip to map to the raw media start')
  }
  const displayMediaEnd = displayMediaStart + '@strybldr-starter-source.png'.length
  const rawMediaEnd = raw.indexOf(' #media')
  if (mapFloatingPanelChatComposerDisplayIndexToRawIndex(raw, displayMediaEnd) !== rawMediaEnd) {
    throw new Error('expected caret after projected @ media chip to map to the raw media end')
  }
  if (mapFloatingPanelChatComposerRawIndexToDisplayIndex(raw, rawMediaEnd) !== displayMediaEnd) {
    throw new Error('expected raw media end to map back to the projected @ media chip boundary')
  }
  const slashDelete = deleteFloatingPanelChatComposerProjectedTokenDisplayRange({ text: raw, selectionStart: '/prd-tad.create'.length, selectionEnd: '/prd-tad.create'.length, direction: 'backward' })
  if (slashDelete !== null) throw new Error(`expected projected deletion to leave / invocation text non-atomic, got ${JSON.stringify(slashDelete)}`)
  const keywordDelete = deleteFloatingPanelChatComposerProjectedTokenDisplayRange({ text: raw, selectionStart: display.length, selectionEnd: display.length, direction: 'backward' })
  if (keywordDelete !== null) {
    throw new Error(`expected projected deletion to leave # invocation text non-atomic, got ${JSON.stringify(keywordDelete)}`)
  }
  if (!isFloatingPanelChatComposerProjectedCaretInsideChip(raw, '/prd-tad.create'.length, '/prd-tad.create'.length)) throw new Error('expected leading / route caret to resolve inside the projected invocation chip')
  if (!isFloatingPanelChatComposerProjectedCaretInsideChip(raw, display.length, display.length)) throw new Error('expected trailing # keyword caret to resolve inside the projected invocation chip')
  const slashStart = display.indexOf('/prd-tad.create')
  if (resolveFloatingPanelChatComposerProjectedCaretEnd(raw, slashStart + 3) !== slashStart + '/prd-tad.create'.length) {
    throw new Error('expected clicking inside a slash chip to place edits at the token end')
  }
  const keywordStart = display.indexOf('#media')
  if (resolveFloatingPanelChatComposerProjectedCaretEnd(raw, keywordStart + 2) !== keywordStart + '#media'.length) {
    throw new Error('expected clicking inside a keyword chip to place edits at the token end')
  }
}

export function testFloatingPanelChatComposerKeepsWorkspaceDocumentLinksAuthored() {
  const documentLink = '[AI视频-执行总表.md](workspace:/docs/AI视频-执行总表.md)'
  const raw = `/video-agent @video-generation-demo-script #spec.low ${documentLink}`
  const display = buildFloatingPanelChatComposerDisplayText(raw)
  const overlay = buildFloatingPanelChatComposerOverlayParts(raw)
  const expectedDisplay = '/video-agent @video-generation-demo-script #spec.low @AI视频-执行总表.md'
  if (display !== expectedDisplay) {
    throw new Error(`expected workspace Markdown source link to project as one @filename chip, got ${JSON.stringify(display)}`)
  }
  if (overlay.hasMedia || overlay.parts.some(part => part.kind === 'media')) {
    throw new Error(`expected workspace Markdown source link not to become an image/media chip, got ${JSON.stringify(overlay)}`)
  }
  const sourceBinding = overlay.parts.find(part => part.kind === 'source-binding')
  if (!sourceBinding || sourceBinding.displayText !== '@AI视频-执行总表.md' || sourceBinding.sourceUrl !== 'workspace:/docs/AI视频-执行总表.md') {
    throw new Error(`expected a typed workspace source-binding projection, got ${JSON.stringify(overlay)}`)
  }
  const invocationTokens = overlay.parts.flatMap(part => part.kind === 'invocation' ? [part.text] : [])
  if (JSON.stringify(invocationTokens) !== JSON.stringify(['/video-agent', '@video-generation-demo-script', '#spec.low'])) {
    throw new Error(`expected workspace document URL path to remain text rather than slash-command chips, got ${JSON.stringify(invocationTokens)}`)
  }
  if (resolveFloatingPanelChatComposerRawText(expectedDisplay, raw) !== raw) {
    throw new Error('expected workspace Markdown source link to round-trip without mutation')
  }
  const prefixedDisplay = `Draft ${expectedDisplay}`
  if (resolveFloatingPanelChatComposerRawText(prefixedDisplay, raw) !== `Draft ${raw}`) {
    throw new Error('expected typing before projected chips to mutate raw text without flattening the source link')
  }
  const displayStart = expectedDisplay.indexOf('@AI视频-执行总表.md')
  const rawStart = raw.indexOf(documentLink)
  if (mapFloatingPanelChatComposerDisplayIndexToRawIndex(raw, displayStart) !== rawStart || mapFloatingPanelChatComposerDisplayIndexToRawIndex(raw, displayStart + 1) !== rawStart + documentLink.length) {
    throw new Error('expected projected source-binding caret edges to map to the authored Markdown boundaries')
  }
  if (resolveFloatingPanelChatComposerProjectedCaretEnd(raw, displayStart + 3) !== displayStart + '@AI视频-执行总表.md'.length) {
    throw new Error('expected clicking inside a Markdown source chip to place edits at the chip end')
  }
  const insertedInsideChip = `${expectedDisplay.slice(0, displayStart + 1)}X${expectedDisplay.slice(displayStart + 1)}`
  if (resolveFloatingPanelChatComposerRawText(insertedInsideChip, raw) !== `${raw.slice(0, rawStart + documentLink.length)}X${raw.slice(rawStart + documentLink.length)}`) {
    throw new Error('expected typing on a projected source chip to preserve the raw Markdown token and insert at its boundary')
  }
}

export function testFloatingPanelChatComposerAttachedMediaProjectionStaysDisplayOnly() {
  const raw = 'I can ...'
  const attachment = {
    mediaKind: 'image' as const,
    label: 'strybldr-starter-source.png',
    sourceUrl: 'http://localhost:5179/api/storage/media/airvio/runs/upload-demo/image/strybldr-starter-source.png?agentic_os_media_token=one',
    thumbnailUrl: 'http://localhost:5179/api/storage/media/airvio/runs/upload-demo/image/strybldr-starter-source.png?agentic_os_media_token=two',
  }
  const options = { mediaAttachments: [attachment] }
  const display = buildFloatingPanelChatComposerDisplayText(raw, options)
  if (display !== 'I can ... @strybldr-starter-source.png ') {
    throw new Error(`expected attached media to render as a compact @ chip after raw text, got ${JSON.stringify(display)}`)
  }
  const overlay = buildFloatingPanelChatComposerOverlayParts(raw, options)
  const mediaPart = overlay.parts.find(part => part.kind === 'media')
  if (!overlay.hasOverlay || !overlay.hasMedia || !mediaPart || mediaPart.displayText !== ' @strybldr-starter-source.png ') {
    throw new Error(`expected virtual attached media to participate in shared overlay projection, got ${JSON.stringify(overlay)}`)
  }
  const roundTrip = resolveFloatingPanelChatComposerRawText(display, raw, options)
  if (roundTrip !== raw) {
    throw new Error(`expected attached media projection to stay display-only on unchanged commit, got ${JSON.stringify(roundTrip)}`)
  }
  const editedRoundTrip = resolveFloatingPanelChatComposerRawText('I can summarize @strybldr-starter-source.png ', raw, options)
  if (editedRoundTrip !== 'I can summarize') {
    throw new Error(`expected attached media projection to avoid backfilling raw media while preserving edits, got ${JSON.stringify(editedRoundTrip)}`)
  }
  const mediaStart = display.indexOf('@strybldr-starter-source.png')
  if (mapFloatingPanelChatComposerDisplayIndexToRawIndex(raw, mediaStart, options) !== raw.length) {
    throw new Error('expected caret inside virtual @ media chip to map to the raw text boundary')
  }
  if (!isFloatingPanelChatComposerProjectedCaretInsideChip(raw, mediaStart, mediaStart, options)) {
    throw new Error('expected virtual @ media chip caret to resolve inside shared chip projection')
  }
  const authoredRaw = 'I can ... #storyboard @strybldr-s.tarter-source.png /soul.load'
  const authoredDisplay = buildFloatingPanelChatComposerDisplayText(authoredRaw, options)
  if (authoredDisplay !== authoredRaw) {
    throw new Error(`expected source-authored @ media reference to stay in place instead of appending a virtual chip, got ${JSON.stringify(authoredDisplay)}`)
  }
  const authoredOverlay = buildFloatingPanelChatComposerOverlayParts(authoredRaw, options)
  const authoredMediaParts = authoredOverlay.parts.filter(part => part.kind === 'media')
  if (authoredMediaParts.length) {
    throw new Error(`expected source-authored @ media reference to suppress duplicate virtual media projection, got ${JSON.stringify(authoredMediaParts)}`)
  }
  const authoredInvocationMetrics = authoredOverlay.parts.flatMap(part => part.kind === 'invocation' ? [`${part.tokenKind}:${part.text}`] : [])
  if (JSON.stringify(authoredInvocationMetrics) !== JSON.stringify(['keyword:#storyboard', 'binding:@strybldr-s.tarter-source.png', 'slash:/soul.load'])) {
    throw new Error(`expected source-authored / # @ references to keep their authored order, got ${JSON.stringify(authoredInvocationMetrics)}`)
  }
  const authoredRoundTrip = resolveFloatingPanelChatComposerRawText(authoredDisplay, authoredRaw, options)
  if (authoredRoundTrip !== authoredRaw) {
    throw new Error(`expected source-authored @ media reference to round-trip without strip/reappend mutation, got ${JSON.stringify(authoredRoundTrip)}`)
  }
}
