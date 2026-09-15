// Source-time adapter. Existing storage IDs remain stable across native source ownership moves.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readStableBoundedFile } from '../mcp/bounded-file-reader.js';
import { AGENT_HISTORY_MANIFEST, GRAPH_DOC_PATHS, agentDocSourcePath } from '../mcp/agentic-os-doc-sources.mjs';
import { resolveAgenticCanvasOsDocsRevision, resolveAgenticCanvasOsDocsRoot } from '../mcp/agentic-canvas-os-docs-runtime.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const dictionaryNames = ['DICTIONARY-COMMAND.md', 'DICTIONARY-SEMANTIC.md', 'DICTIONARY-BINDING.md'];
export async function readRuntimeDocsSources({ docsRoot, graphRoot = path.resolve(import.meta.dirname, '..') } = {}) {
  const absoluteDocsRoot = docsRoot || resolveAgenticCanvasOsDocsRoot({ rootDir: graphRoot });
  const revision = await resolveAgenticCanvasOsDocsRevision({ absoluteDocsRoot });
  const osRoot = path.resolve(absoluteDocsRoot, '../..');
  const { content: manifestBytes } = await readStableBoundedFile({
    filePath: path.join(osRoot, AGENT_HISTORY_MANIFEST), containingDirectory: osRoot, maximumBytes: 500_000,
  });
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schema !== 'agentic-os/native-doc-migration/v1'
      || !Array.isArray(manifest.files) || !Array.isArray(manifest.history)
      || manifest.files.length + manifest.history.length > 100) throw new Error('Invalid native docs migration manifest');
  const records = new Map();
  let totalBytes = 0;
  async function add(fileName, repositoryRoot, sourcePath, expectedHash) {
    if (records.has(fileName)) throw new Error(`Duplicate document source: ${fileName}`);
    const filePath = path.join(repositoryRoot, sourcePath);
    if ((await fs.realpath(filePath)) !== filePath || !(await fs.lstat(filePath)).isFile()) throw new Error('Document source must be a regular unaliased file');
    const { content: bytes } = await readStableBoundedFile({ filePath, containingDirectory: repositoryRoot, maximumBytes: 500_000 });
    totalBytes += bytes.length;
    if (bytes.length > 500_000 || totalBytes > 8_000_000) throw new Error('Document source byte bound exceeded');
    if (expectedHash && hash(bytes) !== expectedHash) throw new Error(`Document source digest drift: ${fileName}`);
    records.set(fileName, { fileName, filePath, sourcePath, bytes,
      sourceRepository: repositoryRoot === osRoot ? 'huijoohwee/agentic-os' : 'huijoohwee/agentic-graph',
      canonicalPath: `agentic-canvas-os/docs/${fileName}` });
  }
  for (const fileName of dictionaryNames) await add(fileName, osRoot, agentDocSourcePath(fileName));
  for (const entry of [...manifest.files, ...manifest.history]) {
    const match = /^docs\/([A-Z][A-Z-]+\.md)$/.exec(entry.source);
    if (!match || entry.destination !== agentDocSourcePath(match[1]) || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error('Invalid native document mapping');
    if (manifest.history.includes(entry) && (entry.editable !== false || entry.currentRuntimeProof !== false)) throw new Error('Historical documents cannot grant current readiness');
    await add(match[1], osRoot, entry.destination, entry.sha256);
  }
  for (const fileName of ['AGENTS.md', 'RUNTIME-PROOF.md']) await add(fileName, osRoot, agentDocSourcePath(fileName));
  for (const [fileName, sourcePath] of Object.entries(GRAPH_DOC_PATHS)) {
    if (fileName.endsWith('.md')) await add(fileName, graphRoot, sourcePath);
  }
  await add('workspace-seeds/agentic-graph-physics-playground-demo.md', graphRoot,
    'docs/workspace-seeds/agentic-graph-physics-playground-demo.md');
  if (revision !== await resolveAgenticCanvasOsDocsRevision({ absoluteDocsRoot })) throw new Error('Document source changed during observation');
  return [...records.values()].sort((a, b) => a.fileName.localeCompare(b.fileName));
}

export async function readDocsSourceFileContent(filePath, sourceBytes) {
  const bytes = sourceBytes || await fs.readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  return { contentMd: bytes.toString(extension === '.glb' ? 'base64' : 'utf8'),
    contentHash: hash(bytes), docType: extension === '.glb' ? 'glb' : extension === '.gltf' ? 'gltf' : 'markdown' };
}
