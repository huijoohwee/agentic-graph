import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildRichMediaWidgetOutputPatch } from '@/features/chat/richMediaRun'
import { buildGeneratedMediaWorkspaceEntries } from '@/features/chat/richMediaRunStorage'
import { buildUploadedMediaInlineCommandCandidate } from '@/lib/command-menu/inlineUploadedMediaCandidates'
import { buildUploadedMediaPanelItemFromStorage } from '@/lib/storage/uploadedMediaPanelItems'
import type { UploadedMediaStorageResult } from '@/lib/storage/uploadedMediaStorage'
import { hasIsoBmffAudioTrackBytes, hasMediaAudioTrack, MEDIA_AUDIO_PROBE_SLICE_BYTES } from '@/features/chat/mediaAudioTrackProbe'
import { resolveMediaPatchActiveTab } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPublication'
import { getNodeMediaSpec } from '@/lib/canvas/graph-elements/mediaSpec'
import type { GraphNode } from '@/lib/graph/types'

const buildIsoBox = (type: string, children: Uint8Array[]): Uint8Array => {
  const payloadSize = children.reduce((size, child) => size + child.length, 0)
  const bytes = new Uint8Array(8 + payloadSize)
  new DataView(bytes.buffer).setUint32(0, bytes.length)
  for (let index = 0; index < 4; index += 1) bytes[4 + index] = type.charCodeAt(index)
  let offset = 8
  for (const child of children) {
    bytes.set(child, offset)
    offset += child.length
  }
  return bytes
}

const buildMediaContainer = (handlerType: 'soun' | 'vide'): Uint8Array => {
  const handlerPayload = new Uint8Array(12)
  for (let index = 0; index < 4; index += 1) handlerPayload[8 + index] = handlerType.charCodeAt(index)
  return buildIsoBox('moov', [buildIsoBox('trak', [buildIsoBox('mdia', [buildIsoBox('hdlr', [handlerPayload])])])])
}

export async function testVideoWidgetOutputPatchProjectsOnePersistedAssetToVideoAndAudio() {
  const patch = buildRichMediaWidgetOutputPatch({
    kind: 'video',
    asset: {
      blob: new Blob(['video'], { type: 'video/mp4' }),
      renderUrl: '/api/storage/blob/workspace/demo/master.mp4',
      model: 'provider-selected-video-model',
    },
    hasAudioTrack: true,
    outputPath: '/workspace/master.mp4',
  })
  if (patch.videoUrl !== patch.audioUrl || patch.videoUrl !== '/api/storage/blob/workspace/demo/master.mp4') {
    throw new Error(`expected the generated master identity to feed both video and audio projections, got ${JSON.stringify(patch)}`)
  }
  const audioContainer = buildMediaContainer('soun')
  if (!hasIsoBmffAudioTrackBytes(audioContainer) || !await hasMediaAudioTrack(new Blob([audioContainer], { type: 'video/mp4' }))) {
    throw new Error('expected the returned MP4 container to prove its audio track before audio projection')
  }
  if (hasIsoBmffAudioTrackBytes(buildMediaContainer('vide'))) {
    throw new Error('expected a video-only MP4 track to remain insufficient audio proof')
  }
  const tailAudioContainer = new Blob([
    new Uint8Array(MEDIA_AUDIO_PROBE_SLICE_BYTES + 32),
    audioContainer,
  ], { type: 'video/mp4' })
  if (!await hasMediaAudioTrack(tailAudioContainer)) {
    throw new Error('expected the bounded tail probe to find a media audio track without reading the whole MP4')
  }
  if (resolveMediaPatchActiveTab({ existingActiveTab: 'text', patch }) !== 'video') {
    throw new Error('expected stale panel tabs to yield to newly generated video')
  }
  if (resolveMediaPatchActiveTab({ existingActiveTab: 'audio', patch }) !== 'audio') {
    throw new Error('expected an audio panel to keep its tab only when the generated patch proves audio')
  }
  const silentVideoPatch = buildRichMediaWidgetOutputPatch({
    kind: 'video',
    asset: { blob: new Blob(['video']), renderUrl: '/master.mp4', model: 'video-model' },
    hasAudioTrack: false,
    outputPath: '/master.mp4',
  })
  if (silentVideoPatch.audioUrl || resolveMediaPatchActiveTab({ existingActiveTab: 'audio', patch: silentVideoPatch }) !== 'video') {
    throw new Error('expected silent video to avoid audio projection and select the visible video tab')
  }

  const workflowMediaHandlers = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowMediaRunHandlers.ts'), 'utf8')
  if (!workflowMediaHandlers.includes('publishMediaRunOutputToRichMediaPanel({ anchorNode: args.node, patch: outputPatch })')) {
    throw new Error('expected image/video generation success to materialize through the shared downstream Rich Media Panel owner')
  }
}

export function testVideoAgentTypedMediaIdentityReachesCardsWidgetsAndPanels() {
  const imageUrl = '/api/storage/blob/workspace/demo/keyframe.png'
  const videoUrl = '/api/storage/blob/workspace/demo/master.mp4'
  const imagePatch = buildRichMediaWidgetOutputPatch({
    kind: 'image',
    asset: { blob: new Blob(['image'], { type: 'image/png' }), renderUrl: imageUrl, model: 'image-model' },
    outputPath: '/workspace/keyframe.png',
  })
  const videoPatch = buildRichMediaWidgetOutputPatch({
    kind: 'video',
    asset: { blob: new Blob(['video'], { type: 'video/mp4' }), renderUrl: videoUrl, model: 'video-model' },
    hasAudioTrack: true,
    outputPath: '/workspace/master.mp4',
  })
  const nodes = [
    { id: 'image-widget', type: 'ImageGeneration', label: 'Image Widget', properties: imagePatch },
    { id: 'image-panel', type: 'RichMediaPanel', label: 'Image Rich Media Panel', properties: { ...imagePatch, richMediaActiveTab: 'image' } },
    { id: 'video-widget', type: 'VideoGeneration', label: 'Video Widget', properties: videoPatch },
    { id: 'video-panel', type: 'RichMediaPanel', label: 'Video Rich Media Panel', properties: { ...videoPatch, richMediaActiveTab: 'video' } },
  ] as GraphNode[]
  for (const node of nodes) {
    const spec = getNodeMediaSpec(node)
    const expectedKind = node.id.startsWith('image') ? 'image' : 'video'
    const expectedUrl = expectedKind === 'image' ? imageUrl : videoUrl
    if (spec?.kind !== expectedKind || spec.url !== expectedUrl) {
      throw new Error(`expected ${node.id} to expose the persisted ${expectedKind} identity to shared Card/Widget/Panel rendering, got ${JSON.stringify(spec)}`)
    }
  }

  for (const relativePath of [
    ['components', 'StoryboardCanvas.tsx'],
    ['components', 'StoryboardWidget', 'WidgetEditorFormContent.tsx'],
    ['components', 'RichMediaPanelDirectMediaSurface.tsx'],
  ]) {
    const source = readFileSync(resolve(process.cwd(), 'src', ...relativePath), 'utf8')
    if (!source.includes('CardMediaPreview')) {
      throw new Error(`expected ${relativePath.join('/')} to reuse the shared CardMediaPreview renderer`)
    }
  }
}

export function testVideoAgentGeneratedMediaRegistersAsInvocableMedia() {
  const storage = {
    workspaceId: 'workspace-video-agent',
    runId: 'upload-media-hash',
    stageId: 'image',
    shotId: 'keyframe-media-hash',
    objectKey: 'media/runs/upload-media-hash/image/keyframe.png',
    publicPath: '/api/storage/media/media/runs/upload-media-hash/image/keyframe.png',
    publicUrl: 'https://storage.example/api/storage/media/keyframe.png',
    accessUrl: 'https://storage.example/api/storage/media/keyframe.png?agentic_os_media_token=token',
    contentHash: 'sha256:media-hash',
    contentType: 'image/png',
    provenance: { fileName: 'keyframe.png', sizeBytes: 1024 },
    response: { ok: true, artifactId: 'artifact-keyframe' },
  } as unknown as UploadedMediaStorageResult
  const item = buildUploadedMediaPanelItemFromStorage(storage)
  const candidate = item ? buildUploadedMediaInlineCommandCandidate(item) : null
  if (
    !item
    || !candidate
    || candidate.kind !== 'image'
    || candidate.label !== 'keyframe.png'
    || !candidate.url.startsWith(storage.publicUrl)
    || !candidate.url.includes('agentic_os_media_token=')
  ) {
    throw new Error(`expected generated storage identity to reuse the shared Media @ candidate, got ${JSON.stringify({ item, candidate })}`)
  }

  const storageSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'chat', 'richMediaRunStorage.ts'), 'utf8')
  if (!storageSource.includes('uploadMediaFileToAgenticGraphStorage') || !storageSource.includes('registerUploadedMediaPanelStorage(storage)')) {
    throw new Error('expected generated media persistence to reuse the FloatingPanel Media storage and registry owners')
  }
}

export function testVideoAgentGeneratedArtifactsReachSourceFilesAndDownloadOverlays() {
  const entries = buildGeneratedMediaWorkspaceEntries({
    outputPath: '/docs/keyframe.png',
    outputManifestPath: '/docs/keyframe-image-output.md',
    manifestText: '# Keyframe output',
    updatedAtMs: 1_720_000_000_000,
  })
  if (entries.length !== 2 || entries[0]?.path !== '/docs/keyframe.png' || entries[1]?.text !== '# Keyframe output') {
    throw new Error(`expected binary and manifest to enter Source Files together, got ${JSON.stringify(entries)}`)
  }
  const runSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'chat', 'richMediaRun.ts'), 'utf8')
  if (!runSource.includes('createdPaths: [outputPath, outputManifestPath]') || !runSource.includes('buildGeneratedMediaWorkspaceEntries({')) {
    throw new Error('expected generated binary and manifest paths to reuse the Source Files import owner')
  }
  for (const relativePath of [
    ['components', 'StoryboardWidgetCanvas', 'StoryboardCardMediaDropSlot2d.tsx'],
    ['components', 'RichMediaPanelDirectMediaSurface.tsx'],
  ]) {
    const source = readFileSync(resolve(process.cwd(), 'src', ...relativePath), 'utf8')
    if (!source.includes('MediaDownloadOverlay') || !source.includes('appearance="hover"')) {
      throw new Error(`expected ${relativePath.join('/')} to reuse the shared hover download overlay`)
    }
  }
}
