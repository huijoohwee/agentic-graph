import type { buildVideoAgentTranscriptImportArtifacts } from './videoAgentTranscriptImportArtifacts'

type Transcript = ReturnType<typeof buildVideoAgentTranscriptImportArtifacts>

export const VIDEO_IMPORT_SAMPLE_LIMIT = 16
const FILE_BYTE_LIMIT = 500_000
const encoder = new TextEncoder()

export function fitsVideoImportFile(text: string): boolean {
  if (text.length * 3 < FILE_BYTE_LIMIT) return true
  return text.length < FILE_BYTE_LIMIT && encoder.encode(text).byteLength < FILE_BYTE_LIMIT
}

/** encodeInto reports UTF-16 units consumed and stops before a partial UTF-8 code point. */
export function* videoImportTextParts(text: string): Generator<string> {
  const buffer = new Uint8Array(FILE_BYTE_LIMIT - 1)
  let offset = 0
  while (offset < text.length) {
    const { read } = encoder.encodeInto(text.slice(offset, offset + FILE_BYTE_LIMIT), buffer)
    yield text.slice(offset, offset + read)
    offset += read
  }
}

export function buildBoundedVideoImportPreview(
  transcript: Transcript,
  sourceText: string,
  render: (transcript: Transcript, body: string, sampled: boolean) => string,
): { markdown: string; sampled: boolean; storedGraph?: string } {
  const { sourceTranscript, frameByFrameTranscript } = transcript
  const segments = sourceTranscript.segments
  // Each cue adds markup and timing metadata even when its text is short.
  const minimumLength = segments.reduce((size, cue) => size + cue.text.length + 64, sourceText.length)
    + frameByFrameTranscript.reduce((size, row) => size + row.text.length, 0)
  if (minimumLength < FILE_BYTE_LIMIT) {
    const complete = render(transcript, sourceText, false)
    if (fitsVideoImportFile(complete)) return { markdown: complete, sampled: false }
  }

  const count = Math.min(segments.length, VIDEO_IMPORT_SAMPLE_LIMIT)
  const sampled = Array.from({ length: count }, (_, i) =>
    segments[Math.round(i * (segments.length - 1) / Math.max(1, count - 1))])
  // Frame rows repeat across connected panels. Bound each excerpt before projecting HTML or JSON.
  let storedGraph = ''
  for (const width of [160, 40, 0]) {
    const excerpt = (text: string) => {
      if (text.length <= width) return text
      return text.slice(0, width).replace(/[\uD800-\uDBFF]$/, '') + '…'
    }
    const preview = {
      sourceTranscript: {
        ...sourceTranscript,
        message: sourceTranscript.message && excerpt(sourceTranscript.message),
        segments: sampled.map(cue => ({ ...cue, text: excerpt(cue.text) })),
        preview: true,
      },
      frameByFrameTranscript: frameByFrameTranscript.map(row => ({ ...row, text: excerpt(row.text) })),
    }
    const body = `Transcript preview with ${sampled.length} sampled cues from ${segments.length}. [Full source text](./transcript.md) · [Source manifest](./source.json) · [Parsed transcript](./parse.json)`
    const markdown = render(preview, body, true)
    if (fitsVideoImportFile(markdown)) return { markdown, sampled: true }
    if (!storedGraph) storedGraph = markdown
  }
  // Long source URLs and other graph metadata can exceed the budget independently of cues.
  return { sampled: true, storedGraph, markdown: [
    '---', 'kgVideoAgentImport: true', 'kgVideoAgentTranscriptPreview: true', 'kgVideoAgentStoredGraph: true', '---',
    '', '# Video import', '', 'The graph is stored in parts because it exceeds the preview size limit.', '',
    '[Graph parts](./graph.md) · [Full source text](./transcript.md) · [Source manifest](./source.json) · [Parsed transcript](./parse.json)', '',
  ].join('\n') }
}
