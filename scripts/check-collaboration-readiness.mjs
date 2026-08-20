import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  ensureLocalCollaborationStack,
  resolveLocalCollaborationStackConfig,
} from './lib/collaboration-local-stack.js';
import { readContract } from './collaboration-contract.mjs';
import { resolveCanonicalSourceRoots } from './worktree-policy.mjs';

const __filename = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(__filename);
const repoRoot = path.resolve(scriptsDir, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const skipBrowser = process.argv.includes('--skip-browser');
const collaborationContract = await readContract();
const canonicalSourceRoots = resolveCanonicalSourceRoots({ cwd: repoRoot, contract: collaborationContract });
const agenticCanvasOsDocsSource = collaborationContract.local_development.canonical_sources
  .find((source) => source.id === 'agentic-canvas-os-docs');
if (!agenticCanvasOsDocsSource) {
  throw new Error('collaboration contract has no Agentic Canvas OS docs source');
}
const configuredAgenticCanvasOsDocsRoot = String(
  process.env.KG_COLLABORATION_E2E_AGENTIC_DOCS_ROOT || '',
).trim();
const agenticCanvasOsDocsRoot = configuredAgenticCanvasOsDocsRoot
  ? path.resolve(configuredAgenticCanvasOsDocsRoot)
  : path.resolve(
    canonicalSourceRoots.roots.get(agenticCanvasOsDocsSource.id),
    agenticCanvasOsDocsSource.required_path,
  );
const collaborationEnvironment = {
  ...process.env,
  KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_ROOT: agenticCanvasOsDocsRoot,
  VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT: agenticCanvasOsDocsRoot,
};
const localCollaborationStackConfig = resolveLocalCollaborationStackConfig({
  repoRoot,
  env: collaborationEnvironment,
  npmCommand,
});

const runStep = ({ name, command, args, cwd, env = process.env }) => {
  process.stdout.write(`\n[collaboration-readiness] ${name}\n`);
  process.stdout.write(`$ ${[command, ...args].join(' ')}\n`);
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env,
  });
};

runStep({
  name: 'shared smoke preparation',
  command: npmCommand,
  args: ['run', 'smoke:prepare'],
  cwd: repoRoot,
});

runStep({
  name: 'docs guard',
  command: npmCommand,
  args: ['--prefix', 'canvas', 'run', 'test:ci:unit', '--', 'multiUserCollaboration.docs'],
  cwd: repoRoot,
});

runStep({
  name: 'focused collaboration runtime and protocol checks',
  command: npmCommand,
  args: ['--prefix', 'canvas', 'run', 'test:ci:unit', '--', 'collaboration.'],
  cwd: repoRoot,
});

runStep({
  name: 'main panel collaboration UI checks',
  command: npmCommand,
  args: ['--prefix', 'canvas', 'run', 'test:ci:unit', '--', 'ui.mainPanel.collaboration'],
  cwd: repoRoot,
});

if (skipBrowser) {
  process.stdout.write('\n[collaboration-readiness] skipped browser smoke by request\n');
} else {
  const localCollaborationStack = await ensureLocalCollaborationStack(localCollaborationStackConfig, {
    log: (message) => process.stdout.write(message),
  });
  try {
    runStep({
      name: 'authenticated room browser smoke',
      command: npmCommand,
      args: ['--prefix', 'canvas', 'run', 'validate:multi-user-collaboration:e2e'],
      cwd: repoRoot,
      env: localCollaborationStack.browserEnv,
    });
  } finally {
    await localCollaborationStack.cleanup();
  }
}

process.stdout.write('\n[collaboration-readiness] ok\n');
