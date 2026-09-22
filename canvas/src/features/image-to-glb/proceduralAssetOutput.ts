import type { WorkspaceFs } from '@/features/workspace-fs/types'
import type { ProceduralAssetSession } from './proceduralAssetSession'
import { saveProceduralAssetWorkspace } from './proceduralAssetWorkspace'

/** One export/persistence path for both workflow creation and manual controls. */
export async function prepareProceduralAssetOutput(args: {
  session: ProceduralAssetSession; fs: WorkspaceFs; parentPath: string
  isCurrent: () => boolean; signal?: AbortSignal
}) {
  const document = args.session.serialize()
  const assertCurrent = () => {
    if (args.signal?.aborted || !args.isCurrent() || args.session.serialize() !== document) throw new Error('Procedural output cancelled or document changed')
    void args.session.current
  }
  assertCurrent()
  const { modelDataUrl, ...paths } = await saveProceduralAssetWorkspace(args)
  assertCurrent()
  return {
    paths,
    patch: {
      proceduralAssetOutputPanel: true,
      proceduralAssetDocument: document,
      proceduralAssetManifestPath: paths.manifestPath,
      proceduralAssetWorkspaceParent: args.parentPath,
      modelUrl: modelDataUrl, mediaUrl: modelDataUrl, outputUrl: modelDataUrl,
      media_kind: 'model', media_interactive: true, richMediaActiveTab: 'model',
      outputMimeType: 'model/gltf-binary', outputModel: 'native-procedural-asset',
      outputPath: paths.modelPath, outputManifestPath: paths.manifestPath,
      output: 'Editable native model with construction recipe and source companions.',
    } as Record<string, unknown>,
  }
}
