import { execFileSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(__filename);
const repoRoot = path.resolve(scriptsDir, '..');
const publishRepoRoot = path.resolve(repoRoot, '../huijoohwee');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const readEnvPresence = (name) => (String(process.env[name] || '').trim() ? 'present' : 'missing');

const runStep = ({ name, command, args, cwd }) => {
  process.stdout.write(`\n[agnes-readiness] ${name}\n`);
  process.stdout.write(`$ ${[command, ...args].join(' ')}\n`);
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
};

runStep({
  name: 'canvas focused Agnes checks',
  command: npmCommand,
  args: ['--prefix', 'canvas', 'run', 'test:smoke:agnes:source'],
  cwd: repoRoot,
});

runStep({
  name: 'publish sync drift check',
  command: process.execPath,
  args: ['./scripts/sync-pages-agenticgraph.mjs', '--check'],
  cwd: repoRoot,
});

runStep({
  name: 'production Pages proxy smoke',
  command: process.execPath,
  args: ['./scripts/smoke-test-integrations.mjs'],
  cwd: publishRepoRoot,
});

process.stdout.write('\n[agnes-readiness] env key presence\n');
process.stdout.write(`AGNES_API_KEY=${readEnvPresence('AGNES_API_KEY')}\n`);
process.stdout.write(`AGENTICGRAPH_CHAT_PROXY_AGNES_API_KEY=${readEnvPresence('AGENTICGRAPH_CHAT_PROXY_AGNES_API_KEY')}\n`);
process.stdout.write(
  '[agnes-readiness] live deployed BYOK smoke still requires a real Agnes key and a pushed/deployed publish repo.\n',
);
