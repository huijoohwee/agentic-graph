import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canvasRoot = path.resolve(root, 'canvas');
const requestedWorkspaceRoot = process.env.AGENTIC_WORKSPACE_ROOT ? path.resolve(process.env.AGENTIC_WORKSPACE_ROOT) : null;
const candidateWorkspaceRoot = requestedWorkspaceRoot || path.resolve(root, '..');
const canvasOsRoot = path.resolve(process.env.AGENTIC_CANVAS_OS_ROOT || path.join(candidateWorkspaceRoot, 'agentic-canvas-os'));
const siblingManifest = path.join(canvasOsRoot, 'config', 'observability-workspace.json');
const manifestFile = path.resolve(process.env.VITE_OBSERVABILITY_WORKSPACE_MANIFEST || (existsSync(siblingManifest)
  ? siblingManifest : path.join(root, 'config', 'observability-workspace.build.json')));
const workspaceRoot = requestedWorkspaceRoot || (existsSync(siblingManifest) ? candidateWorkspaceRoot : root);
const vite = path.resolve(root, 'node_modules', '.bin', 'vite');
if (!existsSync(manifestFile) || !existsSync(vite)) throw new Error('observability workspace build prerequisites are unavailable');
const result = spawnSync(vite, ['build', '--configLoader', 'runner', '--config', path.join(canvasRoot, 'vite.observability.config.ts')], {
  cwd: root,
  env: { ...process.env, AGENTIC_WORKSPACE_ROOT: workspaceRoot, VITE_OBSERVABILITY_WORKSPACE_MANIFEST: manifestFile },
  stdio: 'inherit', shell: false,
});
if (result.status !== 0) process.exit(result.status || 1);
