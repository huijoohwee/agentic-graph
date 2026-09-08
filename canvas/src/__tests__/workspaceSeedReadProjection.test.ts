import path from 'node:path'
import os from 'node:os'
import fsPromises from 'node:fs/promises'
import { readWorkspaceActiveEntrySnapshot } from '@/features/source-files/sourceFilesRuntimeShared'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { withFetchAndEnv, withStoreMirrorState } from './helpers/workspaceSeedMirrorHarness'
import { useGraphStore } from '@/hooks/useGraphStore'

const MIRROR_REPAIR_FIXTURE_BASENAME = 'mirror-active-validation.md'

const MIRROR_REPAIR_FIXTURE_PATH = `/docs/${MIRROR_REPAIR_FIXTURE_BASENAME}`

const withProjectionMirror = async (tempDocsRoot: string, run: () => Promise<void>): Promise<void> => {
  const requests: string[] = []
  let ownedReads = 0
  await withFetchAndEnv({
    VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: tempDocsRoot,
    VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT: undefined,
    VITE_AGENTIC_OS_STORAGE_BASE_URL: undefined,
  }, (async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    requests.push(url)
    if (url === '/__agentic_os_fs_list') {
      const body = JSON.parse(String(init?.body || '{}')) as { path?: string }
      if (body.path !== tempDocsRoot) return new Response('', { status: 404 })
      ownedReads += 1
      const files = await Promise.all((await fsPromises.readdir(tempDocsRoot)).map(async relPath => {
        const absolutePath = path.join(tempDocsRoot, relPath)
        return { relPath, text: await fsPromises.readFile(absolutePath, 'utf8'), updatedAtMs: (await fsPromises.stat(absolutePath)).mtimeMs }
      }))
      return new Response(JSON.stringify({ ok: true, files }), { headers: { 'content-type': 'application/json' } })
    }
    throw new Error(`unexpected projection fixture request: ${url}`)
  }) as typeof fetch, async () => {
    await withStoreMirrorState(async () => {
      useGraphStore.setState({
        sourceFiles: [], localMarkdownFolderHandle: null, localMarkdownFolderName: null,
        localMarkdownFolderAccessMode: null, localMarkdownFolderCacheId: null, localMarkdownSelectedFolderPath: tempDocsRoot,
      })
      await run()
      if (ownedReads !== 1 || requests.some(url => url !== '/__agentic_os_fs_list')) {
        throw new Error(`expected one owned local mirror read, got ${JSON.stringify(requests)}`)
      }
    })
  })
}

export async function testReadWorkspaceActiveEntrySnapshotPrefersCanonicalDocsMirrorForCorruptedFrontmatterLabelResidue() {
  const tempDocsRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kg-runtime-label-sanitize-'))
  const writes: Array<{ path: string; text: string }> = []
  const canonicalText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: floating_media_ingestion_source',
    '      type: FloatingPanelMediaSourceWidget',
    '      label: {key: label, type: string, value: "FloatingPanel Media Source"}',
    '---',
    '',
  ].join('\n')
  const staleText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: floating_media_ingestion_source',
    '      type: FloatingPanelMediaSourceWidget',
    '      label: {key: label, type: string, value: "FloatingPanel Media SourceFloatingPanel Media Source XFloatingPanel Media Source TEST-629B"}',
    '---',
    '',
  ].join('\n')
  try {
    await fsPromises.writeFile(path.join(tempDocsRoot, MIRROR_REPAIR_FIXTURE_BASENAME), canonicalText, 'utf8')
    await withProjectionMirror(tempDocsRoot, async () => {
      let persistedText = staleText
      let freshReads = 0
      const fs: WorkspaceFs = {
        ensureSeed: async () => false,
        listEntries: async () => [],
        readFileText: async requestedPath => {
          if (requestedPath !== MIRROR_REPAIR_FIXTURE_PATH) return null
          freshReads += 1
          return persistedText
        },
        writeFileText: async (path: string, text: string) => {
          writes.push({ path: String(path || ''), text: String(text || '') })
          if (path === MIRROR_REPAIR_FIXTURE_PATH) persistedText = text
        },
        createFile: async () => '/docs/tmp.md',
        createFolder: async () => '/docs',
        deleteEntry: async () => void 0,
      }
      const snapshot = await readWorkspaceActiveEntrySnapshot({
        fs,
        activePath: MIRROR_REPAIR_FIXTURE_PATH,
        workspaceEntries: [
          {
            path: MIRROR_REPAIR_FIXTURE_PATH,
            parentPath: '/docs',
            kind: 'file',
            name: MIRROR_REPAIR_FIXTURE_BASENAME,
            text: staleText,
            updatedAtMs: 1,
          },
        ],
      })
      if (String(snapshot[0]?.text || '').trim() !== canonicalText.trim()) {
        throw new Error(`expected canonical docs mirror text to replace corrupted local label residue, got ${String(snapshot[0]?.text || '')}`)
      }
      if (freshReads < 1 || writes.length !== 0 || persistedText !== staleText) {
        throw new Error(`expected fresh canonical display projection to preserve persisted corrupt text without writes, reads=${freshReads}, writes=${JSON.stringify(writes)}`)
      }
    })
  } finally {
    await fsPromises.rm(tempDocsRoot, { recursive: true, force: true })
  }
}

export async function testReadWorkspaceActiveEntrySnapshotPrefersCanonicalDocsMirrorForCorruptedFrontmatterNodeTypeResidue() {
  const tempDocsRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kg-runtime-node-type-sanitize-'))
  const writes: Array<{ path: string; text: string }> = []
  const canonicalText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '---',
    '',
  ].join('\n')
  const staleText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: compute_summary',
    '      type: ComputeWidgetComputeWidget stale ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '---',
    '',
  ].join('\n')
  try {
    await fsPromises.writeFile(path.join(tempDocsRoot, MIRROR_REPAIR_FIXTURE_BASENAME), canonicalText, 'utf8')
    await withProjectionMirror(tempDocsRoot, async () => {
      let persistedText = staleText
      let freshReads = 0
      const fs: WorkspaceFs = {
        ensureSeed: async () => false,
        listEntries: async () => [],
        readFileText: async requestedPath => {
          if (requestedPath !== MIRROR_REPAIR_FIXTURE_PATH) return null
          freshReads += 1
          return persistedText
        },
        writeFileText: async (path: string, text: string) => {
          writes.push({ path: String(path || ''), text: String(text || '') })
          if (path === MIRROR_REPAIR_FIXTURE_PATH) persistedText = text
        },
        createFile: async () => '/docs/tmp.md',
        createFolder: async () => '/docs',
        deleteEntry: async () => void 0,
      }
      const snapshot = await readWorkspaceActiveEntrySnapshot({
        fs,
        activePath: MIRROR_REPAIR_FIXTURE_PATH,
        workspaceEntries: [
          {
            path: MIRROR_REPAIR_FIXTURE_PATH,
            parentPath: '/docs',
            kind: 'file',
            name: MIRROR_REPAIR_FIXTURE_BASENAME,
            text: staleText,
            updatedAtMs: 1,
          },
        ],
      })
      if (String(snapshot[0]?.text || '').trim() !== canonicalText.trim()) {
        throw new Error(`expected canonical docs mirror text to replace corrupted local node type residue, got ${String(snapshot[0]?.text || '')}`)
      }
      if (freshReads < 1 || writes.length !== 0 || persistedText !== staleText) {
        throw new Error(`expected fresh canonical display projection to preserve persisted corrupt text without writes, reads=${freshReads}, writes=${JSON.stringify(writes)}`)
      }
    })
  } finally {
    await fsPromises.rm(tempDocsRoot, { recursive: true, force: true })
  }
}

export async function testReadWorkspaceActiveEntrySnapshotPrefersCanonicalDocsMirrorForCorruptedFrontmatterNodeStringPropertyResidue() {
  const tempDocsRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kg-runtime-property-sanitize-'))
  const writes: Array<{ path: string; text: string }> = []
  const canonicalText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '      compute:',
    '        key: compute',
    '        type: string',
    '        value: |',
    '          inputs => ({ outputSrcDoc: "frame summary" })',
    '---',
    '',
  ].join('\n')
  const staleText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '      compute:',
    '        key: compute',
    '        type: string',
    '        value: |',
    '          inputs => ({ outputSrcDoc: "frame summary" })inputs => ({ outputSrcDoc: "frame summary" }) // stale append',
    '---',
    '',
  ].join('\n')
  try {
    await fsPromises.writeFile(path.join(tempDocsRoot, MIRROR_REPAIR_FIXTURE_BASENAME), canonicalText, 'utf8')
    await withProjectionMirror(tempDocsRoot, async () => {
      let persistedText = staleText
      let freshReads = 0
      const fs: WorkspaceFs = {
        ensureSeed: async () => false,
        listEntries: async () => [],
        readFileText: async requestedPath => {
          if (requestedPath !== MIRROR_REPAIR_FIXTURE_PATH) return null
          freshReads += 1
          return persistedText
        },
        writeFileText: async (path: string, text: string) => {
          writes.push({ path: String(path || ''), text: String(text || '') })
          if (path === MIRROR_REPAIR_FIXTURE_PATH) persistedText = text
        },
        createFile: async () => '/docs/tmp.md',
        createFolder: async () => '/docs',
        deleteEntry: async () => void 0,
      }
      const snapshot = await readWorkspaceActiveEntrySnapshot({
        fs,
        activePath: MIRROR_REPAIR_FIXTURE_PATH,
        workspaceEntries: [
          {
            path: MIRROR_REPAIR_FIXTURE_PATH,
            parentPath: '/docs',
            kind: 'file',
            name: MIRROR_REPAIR_FIXTURE_BASENAME,
            text: staleText,
            updatedAtMs: 1,
          },
        ],
      })
      if (String(snapshot[0]?.text || '').trim() !== canonicalText.trim()) {
        throw new Error(`expected canonical docs mirror text to replace corrupted local property residue, got ${String(snapshot[0]?.text || '')}`)
      }
      if (freshReads < 1 || writes.length !== 0 || persistedText !== staleText) {
        throw new Error(`expected fresh canonical display projection to preserve persisted corrupt text without writes, reads=${freshReads}, writes=${JSON.stringify(writes)}`)
      }
    })
  } finally {
    await fsPromises.rm(tempDocsRoot, { recursive: true, force: true })
  }
}

export async function testReadWorkspaceActiveEntrySnapshotPrefersCanonicalDocsMirrorForCorruptedFrontmatterEdgeStringResidue() {
  const tempDocsRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kg-runtime-edge-sanitize-'))
  const writes: Array<{ path: string; text: string }> = []
  const canonicalText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: source_input',
    '      type: InputWidget',
    '      label: {key: label, type: string, value: "Source Input"}',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '  edges:',
    '    - id: edge_metric',
    '      source: {key: source, type: string, value: "source_input"}',
    '      sourceHandle: {key: sourceHandle, type: string, value: "input_metric_target"}',
    '      target: {key: target, type: string, value: "compute_summary"}',
    '      targetHandle: {key: targetHandle, type: string, value: "input_metric_target"}',
    '      label: {key: label, type: string, value: "input_metric_target"}',
    '      type: {key: type, type: string, value: "template_number_signal"}',
    '---',
    '',
  ].join('\n')
  const staleText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: source_input',
    '      type: InputWidget',
    '      label: {key: label, type: string, value: "Source Input"}',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '  edges:',
    '    - id: edge_metric',
    '      source: {key: source, type: string, value: "source_input"}',
    '      sourceHandle: {key: sourceHandle, type: string, value: "input_metric_targetinput_metric_targetinput_metric_target // stale append"}',
    '      target: {key: target, type: string, value: "compute_summary"}',
    '      targetHandle: {key: targetHandle, type: string, value: "input_metric_target"}',
    '      label: {key: label, type: string, value: "input_metric_target"}',
    '      type: {key: type, type: string, value: "template_number_signal"}',
    '---',
    '',
  ].join('\n')
  try {
    await fsPromises.writeFile(path.join(tempDocsRoot, MIRROR_REPAIR_FIXTURE_BASENAME), canonicalText, 'utf8')
    await withProjectionMirror(tempDocsRoot, async () => {
      let persistedText = staleText
      let freshReads = 0
      const fs: WorkspaceFs = {
        ensureSeed: async () => false,
        listEntries: async () => [],
        readFileText: async requestedPath => {
          if (requestedPath !== MIRROR_REPAIR_FIXTURE_PATH) return null
          freshReads += 1
          return persistedText
        },
        writeFileText: async (path: string, text: string) => {
          writes.push({ path: String(path || ''), text: String(text || '') })
          if (path === MIRROR_REPAIR_FIXTURE_PATH) persistedText = text
        },
        createFile: async () => '/docs/tmp.md',
        createFolder: async () => '/docs',
        deleteEntry: async () => void 0,
      }
      const snapshot = await readWorkspaceActiveEntrySnapshot({
        fs,
        activePath: MIRROR_REPAIR_FIXTURE_PATH,
        workspaceEntries: [
          {
            path: MIRROR_REPAIR_FIXTURE_PATH,
            parentPath: '/docs',
            kind: 'file',
            name: MIRROR_REPAIR_FIXTURE_BASENAME,
            text: staleText,
            updatedAtMs: 1,
          },
        ],
      })
      if (String(snapshot[0]?.text || '').trim() !== canonicalText.trim()) {
        throw new Error(`expected canonical docs mirror text to replace corrupted local edge residue, got ${String(snapshot[0]?.text || '')}`)
      }
      if (freshReads < 1 || writes.length !== 0 || persistedText !== staleText) {
        throw new Error(`expected fresh canonical display projection to preserve persisted corrupt text without writes, reads=${freshReads}, writes=${JSON.stringify(writes)}`)
      }
    })
  } finally {
    await fsPromises.rm(tempDocsRoot, { recursive: true, force: true })
  }
}

export async function testReadWorkspaceActiveEntrySnapshotPrefersCanonicalDocsMirrorForCorruptedFrontmatterEdgeEndpointResidue() {
  const tempDocsRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kg-runtime-edge-endpoint-sanitize-'))
  const writes: Array<{ path: string; text: string }> = []
  const canonicalText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: source_input',
    '      type: InputWidget',
    '      label: {key: label, type: string, value: "Source Input"}',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '  edges:',
    '    - id: edge_metric',
    '      source: {key: source, type: string, value: "source_input"}',
    '      sourceHandle: {key: sourceHandle, type: string, value: "input_metric_target"}',
    '      target: {key: target, type: string, value: "compute_summary"}',
    '      targetHandle: {key: targetHandle, type: string, value: "input_metric_target"}',
    '      label: {key: label, type: string, value: "input_metric_target"}',
    '      type: {key: type, type: string, value: "template_number_signal"}',
    '---',
    '',
  ].join('\n')
  const staleText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: source_input',
    '      type: InputWidget',
    '      label: {key: label, type: string, value: "Source Input"}',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '  edges:',
    '    - id: edge_metric',
    '      source: {key: source, type: string, value: "source_inputsource_input stale source_input"}',
    '      sourceHandle: {key: sourceHandle, type: string, value: "input_metric_target"}',
    '      target: {key: target, type: string, value: "compute_summarycompute_summary stale compute_summary"}',
    '      targetHandle: {key: targetHandle, type: string, value: "input_metric_target"}',
    '      label: {key: label, type: string, value: "input_metric_target"}',
    '      type: {key: type, type: string, value: "template_number_signal"}',
    '---',
    '',
  ].join('\n')
  try {
    await fsPromises.writeFile(path.join(tempDocsRoot, MIRROR_REPAIR_FIXTURE_BASENAME), canonicalText, 'utf8')
    await withProjectionMirror(tempDocsRoot, async () => {
      let persistedText = staleText
      let freshReads = 0
      const fs: WorkspaceFs = {
        ensureSeed: async () => false,
        listEntries: async () => [],
        readFileText: async requestedPath => {
          if (requestedPath !== MIRROR_REPAIR_FIXTURE_PATH) return null
          freshReads += 1
          return persistedText
        },
        writeFileText: async (path: string, text: string) => {
          writes.push({ path: String(path || ''), text: String(text || '') })
          if (path === MIRROR_REPAIR_FIXTURE_PATH) persistedText = text
        },
        createFile: async () => '/docs/tmp.md',
        createFolder: async () => '/docs',
        deleteEntry: async () => void 0,
      }
      const snapshot = await readWorkspaceActiveEntrySnapshot({
        fs,
        activePath: MIRROR_REPAIR_FIXTURE_PATH,
        workspaceEntries: [
          {
            path: MIRROR_REPAIR_FIXTURE_PATH,
            parentPath: '/docs',
            kind: 'file',
            name: MIRROR_REPAIR_FIXTURE_BASENAME,
            text: staleText,
            updatedAtMs: 1,
          },
        ],
      })
      if (String(snapshot[0]?.text || '').trim() !== canonicalText.trim()) {
        throw new Error(`expected canonical docs mirror text to replace corrupted local edge endpoint residue, got ${String(snapshot[0]?.text || '')}`)
      }
      if (freshReads < 1 || writes.length !== 0 || persistedText !== staleText) {
        throw new Error(`expected fresh canonical display projection to preserve persisted corrupt text without writes, reads=${freshReads}, writes=${JSON.stringify(writes)}`)
      }
    })
  } finally {
    await fsPromises.rm(tempDocsRoot, { recursive: true, force: true })
  }
}

export async function testReadWorkspaceActiveEntrySnapshotKeepsOrdinaryFrontmatterStringEdits() {
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const tempDocsRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'kg-runtime-no-clobber-'))
  const writes: Array<{ path: string; text: string }> = []
  const canonicalText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '      compute:',
    '        key: compute',
    '        type: string',
    '        value: |',
    '          inputs => ({ outputSrcDoc: "frame summary" })',
    '---',
    '',
  ].join('\n')
  const userEditedText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: compute_summary',
    '      type: ComputeWidget',
    '      label: {key: label, type: string, value: "Compute Summary V2"}',
    '      compute:',
    '        key: compute',
    '        type: string',
    '        value: |',
    '          inputs => ({ outputSrcDoc: "frame summary v2" })',
    '---',
    '',
  ].join('\n')
  await fsPromises.writeFile(path.join(tempDocsRoot, MIRROR_REPAIR_FIXTURE_BASENAME), canonicalText, 'utf8')
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = tempDocsRoot
  try {
    const fs: WorkspaceFs = {
      ensureSeed: async () => false,
      listEntries: async () => [],
      readFileText: async () => '',
      writeFileText: async (path: string, text: string) => {
        writes.push({ path: String(path || ''), text: String(text || '') })
      },
      createFile: async () => '/docs/tmp.md',
      createFolder: async () => '/docs',
      deleteEntry: async () => void 0,
    }
    const snapshot = await readWorkspaceActiveEntrySnapshot({
      fs,
      activePath: MIRROR_REPAIR_FIXTURE_PATH,
      workspaceEntries: [
        {
          path: MIRROR_REPAIR_FIXTURE_PATH,
          parentPath: '/docs',
          kind: 'file',
          name: MIRROR_REPAIR_FIXTURE_BASENAME,
          text: userEditedText,
          updatedAtMs: 1,
        },
      ],
    })
    if (String(snapshot[0]?.text || '').trim() !== userEditedText.trim()) {
      throw new Error(`expected ordinary frontmatter edits to survive startup without canonical override, got ${String(snapshot[0]?.text || '')}`)
    }
    if (writes.length !== 0) {
      throw new Error(`expected ordinary frontmatter edits to avoid repair writeback, got ${JSON.stringify(writes)}`)
    }
  } finally {
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    await fsPromises.rm(tempDocsRoot, { recursive: true, force: true })
  }
}
