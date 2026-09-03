import {
  resolveWorkspaceSiblingArtifactPath,
  writeWorkspaceBlobArtifactAtPath,
  writeWorkspaceTextArtifactAtPath,
} from '@/features/chat/chatHistoryWorkspace.output'
import type { ImageToGlbRuntimeArtifacts } from './imageToGlbRuntimeExport'

export type ImageToGlbArtifactPaths = {
  glbPath: string | null
  gltfPath: string | null
  proceduralProgramPath: string | null
  reviewLedgerPath: string | null
  manifestPath: string | null
  externalBufferPaths: readonly string[]
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function safeArtifactStem(value: unknown): string {
  const normalized = cleanString(value)
    .replace(/\.[A-Za-z0-9]+$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'image-to-glb'
}

function buildArtifactFileName(args: { artifactStem: string; suffix: string }): string {
  return `${safeArtifactStem(args.artifactStem)}${args.suffix}`
}

function buildArtifactManifest(args: {
  artifacts: ImageToGlbRuntimeArtifacts
  paths: ImageToGlbArtifactPaths
}): string {
  const { artifacts, paths } = args
  return [
    '---',
    'kind: agentic_graph_image_to_glb_artifacts',
    `schema: ${JSON.stringify(artifacts.job.schema)}`,
    `source_url: ${JSON.stringify(artifacts.job.source.url)}`,
    `source_kind: ${JSON.stringify(artifacts.job.source.kind)}`,
    `geometry_contract: ${JSON.stringify('procedural-js-ts-only')}`,
    `glb_path: ${JSON.stringify(paths.glbPath || '')}`,
    `gltf_path: ${JSON.stringify(paths.gltfPath || '')}`,
    `procedural_program_path: ${JSON.stringify(paths.proceduralProgramPath || '')}`,
    `vision_review_ledger_path: ${JSON.stringify(paths.reviewLedgerPath || '')}`,
    `external_buffer_paths: ${JSON.stringify(paths.externalBufferPaths)}`,
    'embedded_gltf_resources: 0',
    '---',
    '',
    '# Image to GLB artifact set',
    '',
    'The generated model is a native Three.js procedural scene exported as GLB.',
    'The editable scene companion is glTF with external binary buffers only.',
    'The procedural program is reviewable source and is never evaluated from text at runtime.',
    '',
  ].join('\n')
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'function') throw new Error('Image to GLB output requires the browser FileReader runtime.')
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('Could not encode the GLB artifact.'))
    reader.onloadend = () => {
      const value = typeof reader.result === 'string' ? reader.result : ''
      if (!value.startsWith('data:model/gltf-binary;base64,')) {
        reject(new Error('Image to GLB output did not encode a model/gltf-binary data URL.'))
        return
      }
      resolve(value)
    }
    reader.readAsDataURL(blob)
  })
}

/**
 * The browser panel uses the GLB data URL immediately; when the active
 * workspace is writable, the same native artifacts are mirrored beside the
 * source document for inspection and subsequent scene editing.
 */
export async function persistImageToGlbArtifacts(args: {
  artifactStem: string
  artifacts: ImageToGlbRuntimeArtifacts
  workspacePath?: string | null
}): Promise<ImageToGlbArtifactPaths> {
  const workspacePath = cleanString(args.workspacePath)
  const empty: ImageToGlbArtifactPaths = {
    glbPath: null,
    gltfPath: null,
    proceduralProgramPath: null,
    reviewLedgerPath: null,
    manifestPath: null,
    externalBufferPaths: [],
  }
  if (!workspacePath) return empty

  const resolvePath = (suffix: string): string | null => resolveWorkspaceSiblingArtifactPath({
    workspacePath,
    fileName: buildArtifactFileName({ artifactStem: args.artifactStem, suffix }),
  })
  const glbPath = resolvePath('.glb')
  const gltfPath = resolvePath('.gltf')
  const programPath = resolvePath('.procedural.ts')
  const reviewPath = resolvePath('.vision-review.json')
  const externalBufferPaths = args.artifacts.gltf.externalBuffers
    .map(buffer => resolveWorkspaceSiblingArtifactPath({ workspacePath, fileName: buffer.fileName }))
    .filter((path): path is string => !!path)

  await Promise.all([
    writeWorkspaceBlobArtifactAtPath({ absolutePath: glbPath, blob: args.artifacts.glb.blob }),
    writeWorkspaceTextArtifactAtPath({ absolutePath: gltfPath, text: args.artifacts.gltf.text }),
    writeWorkspaceTextArtifactAtPath({
      absolutePath: programPath,
      text: `${args.artifacts.job.program.source.trim()}\n`,
    }),
    writeWorkspaceTextArtifactAtPath({
      absolutePath: reviewPath,
      text: `${JSON.stringify(args.artifacts.job.visionReviewPasses, null, 2)}\n`,
    }),
    ...args.artifacts.gltf.externalBuffers.map((buffer, index) => writeWorkspaceBlobArtifactAtPath({
      absolutePath: externalBufferPaths[index] || null,
      blob: buffer.blob,
    })),
  ])

  const paths: ImageToGlbArtifactPaths = {
    glbPath,
    gltfPath,
    proceduralProgramPath: programPath,
    reviewLedgerPath: reviewPath,
    manifestPath: null,
    externalBufferPaths,
  }
  const manifestPath = resolvePath('.manifest.md')
  if (!manifestPath) return paths
  const writtenManifestPath = await writeWorkspaceTextArtifactAtPath({
    absolutePath: manifestPath,
    text: buildArtifactManifest({ artifacts: args.artifacts, paths }),
  })
  return { ...paths, manifestPath: writtenManifestPath }
}
