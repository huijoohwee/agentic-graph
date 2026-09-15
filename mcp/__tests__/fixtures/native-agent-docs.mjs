import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import packageJson from '../../../package.json' with { type: 'json' };

export async function writeNativeProofFixture(root) {
  const content = '---\nschema: unavailable\nstatus: unavailable\n---\n';
  await fs.mkdir(path.join(root, 'runtime/agents/history'), { recursive: true });
  await fs.mkdir(path.join(root, 'runtime/agents/docs'), { recursive: true });
  await fs.writeFile(path.join(root, 'runtime/agents/history/LIVE-AGENT-PROVIDER-PROOF.md'), content);
  await fs.writeFile(path.join(root, 'runtime/agents/docs/PROGRESSIVE-AGENTS.md'), content);
  await fs.writeFile(path.join(root, 'runtime/agents/MIGRATION-DOCS.json'), JSON.stringify({ history: [{
    source: 'docs/LIVE-AGENT-PROVIDER-PROOF.md', sourceRevision: 'a'.repeat(40),
    editable: false, currentRuntimeProof: false,
    sha256: createHash('sha256').update(content).digest('hex'),
  }] }));
}

export function pinnedAgentDocsFetch(requests = []) {
  const revision = packageJson.dependencies['agentic-os'].split('/').at(-1);
  const root = fileURLToPath(new URL('../', import.meta.resolve('agentic-os/invocation')));
  const prefix = `https://raw.githubusercontent.com/huijoohwee/agentic-os/${revision}/`;
  return async input => {
    const url = String(input);
    if (!url.startsWith(prefix) || url.includes('..')) throw new Error(`Unexpected source read: ${url}`);
    requests.push(url);
    return new Response(await fs.readFile(path.join(root, url.slice(prefix.length))));
  };
}
