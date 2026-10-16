import assert from 'node:assert/strict'
import { buildMermaidGanttTimelineModel as parse } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { formatMermaidGanttFrameSamplesToken as encode, readMermaidGanttFrameSamples } from '@/lib/mermaid/mermaidGanttFrameThumbnailToken'
import { readVideoSequenceSourceAnnotations as read, resolveVideoSequenceSourceAnnotations as resolve, resolveVideoSequenceAnnotationTimelinePosition as position } from '@/components/timeline/videoSequenceSourceAnnotations'
import { readVideoSequenceTimelineModelFromMarkdown, type VideoSequenceTimelineSource } from '@/components/timeline/videoSequenceTimeline'
import { buildVideoAgentUrlImportMarkdown } from '@/features/markdown-workspace/workspaceImport/videoAgentUrlImport'
import { readYamlFrontmatterMermaidDiagramCodes } from '@/lib/mermaid/mermaidDiagramCode'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'

export function testVideoSequenceSourceAnnotations() {
  const samples = [48.9, 0, 16.3].map(timestampSeconds => ({ timestampSeconds, url: `/frames/${timestampSeconds}.png?fixture=authored` }))
  const spans = parse(['gantt', 'title Video Sequence', ...['a', 'b'].flatMap(id => [
    `Source video : ${id}_video, 00:00, 1m`,
    `Frame-by-frame annotation samples (3) : ${id}_fbf, ${encode(samples)}, 00:00, 1m`,
  ])].join('\n')).taskSpans
  const sources = ['a', 'b'].map(id => ({ id, durationSeconds: 60 } as VideoSequenceTimelineSource))
  const links = ['a', 'b'].map(id => ({ schema: 'source-annotations/v1' as const, videoTrackId: `${id}_video`, annotationTrackId: `${id}_fbf`, sourceId: id, frameAnalysisNodeId: `${id}_analysis`, annotationStartMinutes: 0, annotationDurationMinutes: 1, sourceStartSeconds: 0, sourceEndSeconds: 60 }))
  const markdown = (value: unknown) => `---\nkgVideoSequenceAnnotations: ${JSON.stringify(value)}\n---\n`
  const input = { associations: read(markdown(links)), taskSpans: spans, sources }
  const groups = resolve(input)
  assert.equal(groups.length, 2)
  assert.equal(groups[1].videoSpan, spans[2])
  assert.deepEqual(groups[0].samples, samples)
  assert.equal(position(groups[0], 16.3), 16.3 / 60)
  const one = { ...input, associations: [links[0]] }
  for (const changed of [
    { associations: [] }, { associations: [links[0], links[0]] },
    { sources: [sources[0], sources[0]] }, { sources: [] }, { taskSpans: [...spans, spans[0]] },
    { taskSpans: [...spans, { ...spans[0], raw: spans[0].raw.replace('a_video,', 'a_video, a_video,') }] },
    { associations: [{ ...links[0], videoTrackId: 'a_video_split_left' }] },
    ...[{ startMinutes: 0.1, endMinutes: 1.1 }, { durationMinutes: 2, endMinutes: 2 },
      { raw: spans[1].raw.replace('a_fbf,', 'a_fbf, kgsrc_10_60,') },
      { label: 'Cel onion skin', raw: spans[1].raw.replace('Frame-by-frame annotation samples (3)', 'Cel onion skin') }]
      .map(change => ({ taskSpans: [spans[0], { ...spans[1], ...change }] })),
  ]) assert.equal(resolve({ ...one, ...changed }).length, 0)
  const video = { ...spans[0], startMinutes: 5, durationMinutes: 2, endMinutes: 7, raw: spans[0].raw.replace('a_video,', 'a_video, kgsrc_10_50,') }
  const [trimmed] = resolve({ ...one, taskSpans: [video, spans[1]] })
  assert.deepEqual(trimmed.samples, [samples[0], samples[2]])
  assert.equal(position(trimmed, 10), 5)
  assert.equal(position(trimmed, 50), 7)
  assert.equal(position(trimmed, 16.3), 5.315)
  const [retimed] = resolve({ ...one, taskSpans: [{ ...video, raw: spans[0].raw }, spans[1]] })
  assert.equal(position(retimed, 30), 6)
  for (const time of [0, 51, NaN, Infinity]) assert.equal(position(trimmed, time), null)
  for (const value of [null, {}, Array(65).fill(links[0]), [{ ...links[0], schema: 'unknown' }],
    [{ ...links[0], sourceId: 'x'.repeat(257) }], [{ ...links[0], sourceEndSeconds: 0 }],
    [{ ...links[0], annotationDurationMinutes: '1' }]]) assert.deepEqual(read(markdown(value)), [])
  assert.deepEqual(read('---\nkgVideoSequenceAnnotations: [\n---'), [])
  assert.deepEqual(read(markdown(links) + '字'.repeat(170000)), [])
  assert.equal(resolve({ ...one, associations: [{ ...links[0], annotationDurationMinutes: Infinity }] }).length, 0)
  const imported = buildVideoAgentUrlImportMarkdown({ sourceUrl: 'https://youtu.be/BudgetFrame01', sourceText: 'Source payload retained', sourceTranscriptJsonText: JSON.stringify({ segments: [{ start: 51.25, duration: 1, text: 'Fractional ending' }] }) })
  const [roundtrip] = resolve({ associations: read(imported), taskSpans: parse(readYamlFrontmatterMermaidDiagramCodes(imported, 'gantt')[0]).taskSpans, sources: readVideoSequenceTimelineModelFromMarkdown(imported)!.sources })
  assert(roundtrip, 'Imported fractional source must resolve its explicit annotation link')
  assert.equal(roundtrip.sourceWindow.sourceEndSeconds, 52.25)
  assert.deepEqual(roundtrip.samples, readMermaidGanttFrameSamples(roundtrip.annotationSpan.raw).map(({ timestampSeconds, url }) => ({ timestampSeconds, url })))
  assert(imported.includes('Fractional ending') && imported.includes(roundtrip.association.frameAnalysisNodeId))
  const legacy = parseMarkdownFrontmatter(splitMarkdownLines(imported)).meta
  delete legacy.kgVideoSequenceAnnotations
  const persisted = (meta: unknown) => `---\n${JSON.stringify(meta)}\n---\n`
  assert.deepEqual(read(persisted(legacy)), [roundtrip.association])
  const typed = { ...legacy, flow_nodes: { type: 'array', value: (legacy.flow as any).nodes }, flow: undefined }
  assert.deepEqual(read(persisted(typed)), [roundtrip.association])
  const legacyInput = { ...one, associations: read(persisted(typed)), sources: readVideoSequenceTimelineModelFromMarkdown(imported)!.sources,
    taskSpans: parse(readYamlFrontmatterMermaidDiagramCodes(imported, 'gantt')[0]).taskSpans }
  assert.equal(resolve(legacyInput).length, 1)
  const moved = legacyInput.taskSpans.map(span => span === resolve(legacyInput)[0].annotationSpan ? { ...span, startMinutes: 1, endMinutes: 1 + span.durationMinutes } : span)
  assert.equal(resolve({ ...legacyInput, taskSpans: moved }).length, 0)
  for (const invalid of [null, [], 'broken']) assert.deepEqual(read(persisted({ ...typed, kgVideoSequenceAnnotations: invalid })), [])
  const copied = JSON.parse(JSON.stringify(typed))
  copied.flow_nodes.value.push({ ...copied.flow_nodes.value[0], id: 'another_pipeline' })
  assert.deepEqual(read(persisted(copied)), [])
  const wrongSource = { ...typed, kgVideoSequenceSources: [(legacy.kgVideoSequenceSources as any[])[0], { ...(legacy.kgVideoSequenceSources as any[])[0], id: 'another_source' }] }
  assert.deepEqual(read(persisted(wrongSource)), [])
  const mismatched = JSON.parse(JSON.stringify(typed))
  const spec = mismatched.flow_nodes.value.find(node => node.properties['flow:widgetFormId'] === 'htmlVideoRenderSpecInput')
  const data = JSON.parse(spec.properties.data_json)
  data.timelineTracks[1].frameSamples[0].frameImageUrl = '/frames/unrelated.png'
  spec.properties.data_json = JSON.stringify(data)
  assert.deepEqual(read(persisted(mismatched)), [])
  const rounded = JSON.parse(JSON.stringify(typed))
  rounded.kgVideoSequenceSources[0].durationSeconds = 52
  const roundedText = persisted(rounded)
  const roundedInput = { ...legacyInput, associations: read(roundedText), sources: readVideoSequenceTimelineModelFromMarkdown(roundedText)!.sources }
  const [bridged] = resolve(roundedInput)
  assert.equal(bridged.sourceWindow.sourceEndSeconds, 52.25)
  assert.deepEqual(bridged.samples, roundtrip.samples)
  assert.equal(position(bridged, 26.125), bridged.videoSpan.durationMinutes / 2)
  for (const change of [{ durationSeconds: 53 }, { sourceUrl: '/different.mp4' }]) assert.equal(resolve({ ...roundedInput, sources: roundedInput.sources.map(source => ({ ...source, ...change })) }).length, 0)
  assert.equal(resolve({ ...roundedInput, associations: read(persisted({ ...rounded, kgVideoSequenceAnnotations: [{ ...bridged.association, legacyDurationSeconds: 52.25 }] })) }).length, 0)
  rounded.kgVideoSequenceSources[0].durationSeconds = 51
  assert.deepEqual(read(persisted(rounded)), [])
  assert.equal(resolve({ ...one, taskSpans: [{ ...spans[0], raw: '字'.repeat(170000) }, spans[1]] }).length, 0)
}
