import { inspectGlbBytes } from '@/lib/assets/gltfFormat'
import { buildProceduralAsset, disposeProceduralAsset, type ProceduralAssetBuild } from './proceduralAssetBuilder'
import { parseProceduralAssetRecipe } from './proceduralAssetContract'
import { exportWithGltfExporter } from './proceduralAssetExportPrimitives'

export type ProceduralAssetArtifacts = {
  glb: { fileName: string; blob: Blob; bytes: ArrayBuffer }
  recipe: { fileName: string; text: string }
  source: { fileName: string; text: string }
  evidence: ProceduralAssetBuild['evidence']
}
/** Snapshots editable source before any await. No caller-supplied scene or executable source is trusted. */
export async function exportProceduralAsset(args: {
  recipe: unknown; artifactStem?: string; signal?: AbortSignal; isCurrent?: () => boolean
}): Promise<ProceduralAssetArtifacts> {
  const recipe = parseProceduralAssetRecipe(args.recipe)
  const assertCurrent = () => {
    if (args.signal?.aborted || args.isCurrent?.() === false) throw new Error('Procedural export cancelled or document changed')
  }
  assertCurrent()
  const build = buildProceduralAsset(recipe)
  const stem = String(args.artifactStem ?? 'procedural-asset').replace(/\.(glb|json|ts)$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'procedural-asset'
  try {
    const bytes = await exportWithGltfExporter(build.scene, true)
    assertCurrent()
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength > 8_000_000) throw new Error('Procedural export returned invalid or oversized GLB')
    const inspection = inspectGlbBytes(bytes)
    if (!inspection.validContainer || !inspection.validGltfAsset || !inspection.validBinReference) throw new Error('Procedural export produced invalid GLB')
    return {
      glb: { fileName: `${stem}.glb`, blob: new Blob([bytes], { type: 'model/gltf-binary' }), bytes },
      recipe: { fileName: `${stem}.recipe.json`, text: `${JSON.stringify(recipe, null, 2)}\n` },
      source: { fileName: `${stem}.procedural.ts`, text: build.source },
      evidence: build.evidence,
    }
  } finally { disposeProceduralAsset(build.scene) }
}
