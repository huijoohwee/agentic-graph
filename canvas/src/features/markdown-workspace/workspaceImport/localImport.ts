import { persistImportInventory } from '@/features/workspace-fs/importInventoryPersistence'
import type { ImportInventoryItem } from '@/features/workspace-fs/importInventory'
import { beginLocalIncrementalImport } from './incrementalImport'
import type { WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { WORKSPACE_ROOT_PATH, normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { ensureWorkspaceFolderPathIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { parseWebkitRelativePath } from '@/features/source-files/webkitRelativePath'
import type { WorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { deriveMarkdownNameFromPdfFilename } from '@/features/toolbar/ingestUtils'
import {
  buildPendingLocalImportStub,
  clearPendingLocalImport,
  isPendingLocalImportStubText,
  setPendingLocalImport,
} from './pendingLocalImport'
import { isCsvJsonConvertibleImportName, materializeCsvJsonImportArtifacts } from './csvJsonConversion'
import { buildModelAssetMarkdownFromFile, deriveModelWorkspaceDocumentName } from './glbAsset'
import { importTextFileOrWorkspaceJsonLd } from './workspaceFileJsonLd'
import type { WorkspaceImportResult } from './types'
import {
  buildCorpusMediaMetadataMarkdown,
  buildCorpusMediaWorkspaceDocumentName,
  type CorpusSourceUnit,
} from '@/features/queryable-corpus/corpusGraph'
import { buildCorpusWorkspaceImportResult, createCorpusSourceUnitRecorder } from '@/features/queryable-corpus/sourceFilesCorpusManifest'
import { importXrImageWorkspaceAssetsFromFile, isXrImageAssetFile } from './xrImageAssets'
import {
  buildVideoSequenceWorkspaceDocumentName,
  materializeVideoSequenceTimelineImportDocument,
  type VideoSequenceImportAsset,
} from './videoSequenceTimelineImport'
import { materializeSpatialCaptureFilesetImports } from './spatialCaptureFilesetImport'
import { importPdfFile } from './localImportPdf'
import { deriveSpatialCaptureStandaloneManifestName, resolveSpatialCaptureStandaloneFormat } from './spatialCaptureFileset'
import { getModelAssetFormat, isCorpusMediaImportFile, isLocalTextWorkspaceImportName, isPdfFile, isSupportedWorkspaceImportFile, toFileArray } from './localImportFormats'
import {
  buildLocalSpatialCaptureManifest,
  pruneVideoSequenceSourceDocuments,
  pushLocalVideoSequenceImportAsset,
  recordCorpusSourceUnit,
  setPendingSpatialCaptureLocalImport,
  shouldDeferLargeLocalFileImport,
  shouldMaterializeFolderTextForCorpus,
} from './localImportShared'

async function persistLocalCsvJsonArtifacts(args: {
  fs: WorkspaceFs
  sourcePath: WorkspacePath
  sourceName: string
  sourceText: string
  originalName: string
  createdPaths: WorkspacePath[]
  sources: Array<{ path: WorkspacePath; source: WorkspaceEntrySource }>
  jsonSourceDocuments: Array<{ path: WorkspacePath; text: string }>
}): Promise<void> {
  if (!isCsvJsonConvertibleImportName(args.sourceName)) return
  const source = { kind: 'local' as const, originalName: args.originalName }
  const derived = await materializeCsvJsonImportArtifacts({
    fs: args.fs,
    sourcePath: args.sourcePath,
    sourceName: args.sourceName,
    sourceText: args.sourceText,
    source,
    options: { sourceKind: 'local', originalName: args.originalName },
  })
  if (derived.createdPaths.length === 0 && derived.jsonSourceDocuments.length === 0) return
  args.createdPaths.push(...derived.createdPaths)
  args.sources.push(...derived.sources)
  args.jsonSourceDocuments.push(...derived.jsonSourceDocuments)
}

export async function importWorkspaceLocalFiles(args: {
  fs: WorkspaceFs
  files: FileList | ReadonlyArray<File> | null
  parentPath?: WorkspacePath
  onProgress?: (p: {
    label?: string
    current: number
    total: number
    name?: string
    bytesCurrent?: number
    bytesTotal?: number
  }) => void
}): Promise<WorkspaceImportResult> {
  const files = toFileArray(args.files)
  if (files.length === 0) return { createdPaths: [], sources: [], skipped: [], failed: [] }
  const parentPath = args.parentPath || WORKSPACE_ROOT_PATH
  const inventory: ImportInventoryItem[] = []
  const createdPaths: WorkspacePath[] = []
  const sources: Array<{ path: WorkspacePath; source: WorkspaceEntrySource }> = []
  const jsonSourceDocuments: Array<{ path: WorkspacePath; text: string }> = []
  const skipped: Array<{ name: string; reason: 'unsupported' | 'missing-name' }> = []
  const failed: Array<{ name: string; error: string }> = []
  const sourceUnits: CorpusSourceUnit[] = []
  const videoSequenceAssets: VideoSequenceImportAsset[] = []
  const recordSourceUnit = createCorpusSourceUnitRecorder({ sourceUnits, importMode: 'file' })

  const bytesTotal = files.reduce((sum, f) => sum + Math.max(0, Number(f?.size || 0)), 0)
  let bytesCurrent = 0

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    const nameRaw = String(file?.name || '').trim()
    const name = nameRaw || 'file'
    const inventoryItem: ImportInventoryItem = { source: `local:${normalizeWorkspacePath(`${parentPath}/${nameRaw || `[unnamed input ${index + 1}]`}`)}`, status: 'not imported' }
    inventory.push(inventoryItem)
    try {
      bytesCurrent += Math.max(0, Number(file?.size || 0))
      args.onProgress?.({
        label: isPdfFile(file) ? 'Converting PDF' : 'Importing',
        current: index + 1,
        total: files.length,
        name,
        bytesCurrent,
        bytesTotal,
      })
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    } catch {
      void 0
    }

    if (!nameRaw) {
      inventoryItem.detail = 'Missing filename'
      skipped.push({ name: '', reason: 'missing-name' })
      continue
    }
    if (!isSupportedWorkspaceImportFile(file)) {
      inventoryItem.detail = 'Unsupported format'
      skipped.push({ name: nameRaw, reason: 'unsupported' })
      continue
    }
    const originalFs = args.fs
    let incremental: Awaited<ReturnType<typeof beginLocalIncrementalImport>> | null = null
    let succeeded = false
    try {
      incremental = await beginLocalIncrementalImport(originalFs, file, `local:${normalizeWorkspacePath(`${parentPath}/${nameRaw}`)}`)
      args = { ...args, fs: incremental.fs }
      succeeded = true
      if (incremental.cached) {
        for (const saved of incremental.cached) {
          createdPaths.push(saved.path); sources.push({ path: saved.path, source: saved.source })
          recordCorpusSourceUnit(recordSourceUnit, { path: saved.path, relativePath: nameRaw, originalName: nameRaw, text: saved.text, file, status: 'cached' })
        }
        continue
      }
      if (isXrImageAssetFile(file)) {
        const imported = await importXrImageWorkspaceAssetsFromFile({ fs: args.fs, file })
        createdPaths.push(...imported.createdPaths)
        sources.push(...imported.sources)
        recordCorpusSourceUnit(recordSourceUnit, {
          path: imported.createdPaths[0] || normalizeWorkspacePath(`${WORKSPACE_ROOT_PATH}/${nameRaw}`),
          relativePath: nameRaw,
          originalName: nameRaw,
          text: imported.sourceText,
          file,
          status: 'parsed',
        })
        continue
      }
      const spatialCaptureFormat = resolveSpatialCaptureStandaloneFormat(nameRaw, file.type)
      const modelFormat = getModelAssetFormat(file)
      const mediaMetadata = isCorpusMediaImportFile(file)
      const importName = spatialCaptureFormat
        ? deriveSpatialCaptureStandaloneManifestName(nameRaw)
        : mediaMetadata
        ? buildCorpusMediaWorkspaceDocumentName(nameRaw)
        : modelFormat ? deriveModelWorkspaceDocumentName(nameRaw, modelFormat) : nameRaw
      const desiredPath = normalizeWorkspacePath(`${parentPath}/${importName}`)
      const lowerName = nameRaw.toLowerCase()
      const looksLikeWorkspaceFile = lowerName.endsWith('.jsonld') || lowerName.endsWith('.json-ld')
      if (
        desiredPath
        && !looksLikeWorkspaceFile
        && !isPdfFile(file)
      ) {
        const existingText = await args.fs.readFileText(desiredPath)
        if (typeof existingText === 'string' && !isPendingLocalImportStubText(existingText)) {
          const nextText = spatialCaptureFormat
            ? buildLocalSpatialCaptureManifest({
                originalName: nameRaw,
                format: spatialCaptureFormat,
                sourceIdentity: nameRaw,
                pendingLocalPath: desiredPath,
                byteSize: file.size,
                mimeHint: file.type,
              })
            : shouldDeferLargeLocalFileImport(file, nameRaw)
            ? buildPendingLocalImportStub({
                kind: modelFormat || 'text',
                originalName: nameRaw,
                source: 'file',
                ...(modelFormat ? { pendingPath: desiredPath } : {}),
                bytes: Math.max(0, Number(file?.size || 0)),
              })
            : mediaMetadata
              ? buildCorpusMediaMetadataMarkdown({
                  originalName: nameRaw,
                  mimeHint: file.type,
                  byteSize: file.size,
                  importMode: 'file',
                  relativePath: nameRaw,
                })
              : modelFormat ? await buildModelAssetMarkdownFromFile(file, modelFormat) : await file.text()
          if (existingText === nextText) {
            await args.fs.writeFileText(desiredPath, nextText)
            if (spatialCaptureFormat) setPendingSpatialCaptureLocalImport(desiredPath, file, nameRaw, spatialCaptureFormat)
            createdPaths.push(desiredPath)
            sources.push({ path: desiredPath, source: { kind: 'local', originalName: file.name } })
            recordCorpusSourceUnit(recordSourceUnit, { path: desiredPath, relativePath: nameRaw, originalName: nameRaw, text: existingText, file, status: 'cached' })
            pushLocalVideoSequenceImportAsset(videoSequenceAssets, {
              workspacePath: desiredPath,
              relativePath: nameRaw,
              originalName: nameRaw,
              file,
              importMode: 'file',
            })
            continue
          }
          await args.fs.writeFileText(desiredPath, nextText)
          await persistLocalCsvJsonArtifacts({ fs: args.fs, sourcePath: desiredPath, sourceName: nameRaw, sourceText: nextText,
            originalName: file.name, createdPaths, sources, jsonSourceDocuments })
          if (spatialCaptureFormat) setPendingSpatialCaptureLocalImport(desiredPath, file, nameRaw, spatialCaptureFormat)
          else if (shouldDeferLargeLocalFileImport(file, nameRaw)) setPendingLocalImport(desiredPath, { kind: modelFormat || 'text', file, originalName: nameRaw })
          else clearPendingLocalImport(desiredPath)
          createdPaths.push(desiredPath)
          sources.push({ path: desiredPath, source: { kind: 'local', originalName: file.name } })
          recordCorpusSourceUnit(recordSourceUnit, { path: desiredPath, relativePath: nameRaw, originalName: nameRaw, text: nextText, file, status: spatialCaptureFormat || shouldDeferLargeLocalFileImport(file, nameRaw) ? 'pending' : mediaMetadata ? 'unsupported' : 'parsed' })
          pushLocalVideoSequenceImportAsset(videoSequenceAssets, { workspacePath: desiredPath, relativePath: nameRaw, originalName: nameRaw, file, importMode: 'file' })
          continue
        }
        if (typeof existingText === 'string' && isPendingLocalImportStubText(existingText)) {
          if (spatialCaptureFormat) {
            const manifestText = buildLocalSpatialCaptureManifest({
              originalName: nameRaw,
              format: spatialCaptureFormat,
              sourceIdentity: nameRaw,
              pendingLocalPath: desiredPath,
              byteSize: file.size,
              mimeHint: file.type,
            })
            await args.fs.writeFileText(desiredPath, manifestText)
            setPendingSpatialCaptureLocalImport(desiredPath, file, nameRaw, spatialCaptureFormat)
            createdPaths.push(desiredPath)
            sources.push({ path: desiredPath, source: { kind: 'local', originalName: file.name } })
            recordCorpusSourceUnit(recordSourceUnit, { path: desiredPath, relativePath: nameRaw, originalName: nameRaw, text: manifestText, file, status: 'pending' })
            continue
          }
          if (shouldDeferLargeLocalFileImport(file, nameRaw)) {
            const kind = modelFormat || 'text'
            await args.fs.writeFileText(desiredPath, buildPendingLocalImportStub({
              kind,
              originalName: nameRaw,
              source: 'file',
              ...(modelFormat ? { pendingPath: desiredPath } : {}),
              bytes: Math.max(0, Number(file?.size || 0)),
            }))
            setPendingLocalImport(desiredPath, { kind, file, originalName: nameRaw })
            createdPaths.push(desiredPath)
            sources.push({ path: desiredPath, source: { kind: 'local', originalName: file.name } })
            recordCorpusSourceUnit(recordSourceUnit, { path: desiredPath, relativePath: nameRaw, originalName: nameRaw, text: await args.fs.readFileText(desiredPath) || '', file, status: 'pending' })
            continue
          }
          if (mediaMetadata) {
            const metadataText = buildCorpusMediaMetadataMarkdown({
              originalName: nameRaw,
              mimeHint: file.type,
              byteSize: file.size,
              importMode: 'file',
              relativePath: nameRaw,
            })
            await args.fs.writeFileText(desiredPath, metadataText)
            clearPendingLocalImport(desiredPath)
            createdPaths.push(desiredPath)
            sources.push({ path: desiredPath, source: { kind: 'local', originalName: file.name } })
            recordCorpusSourceUnit(recordSourceUnit, { path: desiredPath, relativePath: nameRaw, originalName: nameRaw, text: metadataText, file, status: 'unsupported' })
            pushLocalVideoSequenceImportAsset(videoSequenceAssets, {
              workspacePath: desiredPath,
              relativePath: nameRaw,
              originalName: nameRaw,
              file,
              importMode: 'file',
            })
            continue
          }
          const rawText = modelFormat ? await buildModelAssetMarkdownFromFile(file, modelFormat) : await file.text()
          await args.fs.writeFileText(desiredPath, rawText)
          clearPendingLocalImport(desiredPath)
          createdPaths.push(desiredPath)
          sources.push({ path: desiredPath, source: { kind: 'local', originalName: file.name } })
          await persistLocalCsvJsonArtifacts({
            fs: args.fs,
            sourcePath: desiredPath,
            sourceName: nameRaw,
            sourceText: rawText,
            originalName: file.name,
            createdPaths,
            sources,
            jsonSourceDocuments,
          })
          recordCorpusSourceUnit(recordSourceUnit, { path: desiredPath, relativePath: nameRaw, originalName: nameRaw, text: rawText, file, status: 'parsed' })
          continue
        }
      }

      let unitText = ''
      let unitStatus: CorpusSourceUnit['status'] = 'parsed'
      const createdPath = spatialCaptureFormat
        ? await args.fs.createFile({
            parentPath,
            name: importName,
            text: (unitText = buildLocalSpatialCaptureManifest({
              originalName: nameRaw,
              format: spatialCaptureFormat,
              sourceIdentity: nameRaw,
              pendingLocalPath: desiredPath,
              byteSize: file.size,
              mimeHint: file.type,
            })),
          })
        : shouldDeferLargeLocalFileImport(file, nameRaw)
        ? await (async () => {
            const stubText = buildPendingLocalImportStub({
              kind: modelFormat || 'text',
              originalName: nameRaw,
              source: 'file',
              bytes: Math.max(0, Number(file?.size || 0)),
            })
            const created = await args.fs.createFile({
              parentPath,
              name: importName,
              text: stubText,
            })
            setPendingLocalImport(created, { kind: modelFormat || 'text', file, originalName: nameRaw })
            if (modelFormat) {
              unitText = buildPendingLocalImportStub({
                kind: modelFormat,
                originalName: nameRaw,
                source: 'file',
                pendingPath: created,
                bytes: Math.max(0, Number(file?.size || 0)),
              })
              await args.fs.writeFileText(created, unitText)
            } else {
              unitText = stubText
            }
            unitStatus = 'pending'
            return created
          })()
        : mediaMetadata
          ? await args.fs.createFile({
              parentPath,
              name: importName,
              text: (unitText = buildCorpusMediaMetadataMarkdown({
                originalName: nameRaw,
                mimeHint: file.type,
                byteSize: file.size,
                importMode: 'file',
                relativePath: nameRaw,
              })),
            })
        : isPdfFile(file)
          ? await importPdfFile({ fs: args.fs, file, parentPath })
          : modelFormat
            ? await args.fs.createFile({
                parentPath,
                name: importName,
                text: (unitText = await buildModelAssetMarkdownFromFile(file, modelFormat)),
              })
          : await importTextFileOrWorkspaceJsonLd({
              file,
              onText: async ({ name, text }) => {
                unitText = text
                return await args.fs.createFile({ parentPath, name, text })
              },
            })
      const normalized = normalizeWorkspacePath(createdPath)
      if (spatialCaptureFormat) {
        if (normalized !== desiredPath) {
          unitText = buildLocalSpatialCaptureManifest({
            originalName: nameRaw,
            format: spatialCaptureFormat,
            sourceIdentity: nameRaw,
            pendingLocalPath: normalized,
            byteSize: file.size,
            mimeHint: file.type,
          })
          await args.fs.writeFileText(normalized, unitText)
        }
        unitStatus = 'pending'
        setPendingSpatialCaptureLocalImport(normalized, file, nameRaw, spatialCaptureFormat)
      }
      if (mediaMetadata) unitStatus = 'unsupported'
      if (isPdfFile(file) && !unitText) {
        unitText = String((await args.fs.readFileText(normalized).catch(() => '')) || '')
        unitStatus = 'pending'
      }
      createdPaths.push(normalized)
      sources.push({ path: normalized, source: { kind: 'local', originalName: file.name } })
      await persistLocalCsvJsonArtifacts({
        fs: args.fs,
        sourcePath: normalized,
        sourceName: nameRaw,
        sourceText: unitText || String((await args.fs.readFileText(normalized).catch(() => '')) || ''),
        originalName: file.name,
        createdPaths,
        sources,
        jsonSourceDocuments,
      })
      recordCorpusSourceUnit(recordSourceUnit, { path: normalized, relativePath: nameRaw, originalName: nameRaw, text: unitText || String((await args.fs.readFileText(normalized).catch(() => '')) || ''), file, status: unitStatus })
      pushLocalVideoSequenceImportAsset(videoSequenceAssets, {
        workspacePath: normalized,
        relativePath: nameRaw,
        originalName: nameRaw,
        file,
        importMode: 'file',
      })
    } catch (e) {
      succeeded = false
      inventoryItem.detail = String((e as { message?: unknown })?.message ?? e)
      failed.push({ name: nameRaw, error: String((e as { message?: unknown })?.message ?? e) })
    } finally {
      args = { ...args, fs: originalFs }
      if (succeeded) await incremental?.commit()
    }
  }

  const videoSequencePath = await materializeVideoSequenceTimelineImportDocument({
    fs: args.fs,
    parentPath,
    assets: videoSequenceAssets,
  })
  const removedPaths = videoSequencePath
    ? await pruneVideoSequenceSourceDocuments({
        fs: args.fs,
        createdPaths,
        sources,
        assets: videoSequenceAssets,
      })
    : []
  if (videoSequencePath) {
    createdPaths.unshift(videoSequencePath)
    sources.unshift({ path: videoSequencePath, source: { kind: 'local', originalName: buildVideoSequenceWorkspaceDocumentName(videoSequenceAssets) } })
  }

  for (const unit of sourceUnits) {
    const item = inventory.find(row => row.source === `local:${normalizeWorkspacePath(`${parentPath}/${unit.relativePath}`)}`)
    if (!item) continue
    const sourcePath = normalizeWorkspacePath(unit.workspacePath)
    const path = videoSequencePath && removedPaths.includes(sourcePath) ? videoSequencePath : sourcePath
    item.outputs = [...(item.outputs || []), { path }]
    item.status = unit.status === 'pending' ? 'pending' : 'imported'
  }
  await persistImportInventory(args.fs, inventory)
  return {
    ...buildCorpusWorkspaceImportResult({ createdPaths, sources, skipped, failed, sourceUnits }),
    ...(removedPaths.length > 0 ? { removedPaths } : {}),
    ...(videoSequencePath ? { applyToGraph: true } : {}),
    ...(jsonSourceDocuments.length > 0 ? { jsonSourceDocuments } : {}),
  }
}

export { importWorkspaceLocalFolder } from './localFolderImport'
