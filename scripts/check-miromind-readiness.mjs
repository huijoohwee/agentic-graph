import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(__filename);
const repoRoot = path.resolve(scriptsDir, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const PROJECT_NAME = 'joohwee';
const SECRET_NAME = 'MIROMIND_API_KEY';
const DEFAULT_ORIGIN = 'https://joohwee.pages.dev';
const LIVE_ORIGIN = String(process.env.AGENTIC_OS_MIROMIND_PAGES_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/g, '');
const LIVE_MODE = process.argv.includes('--live-only');
const SKIP_LIVE = process.argv.includes('--skip-live');

const runStep = ({ name, command, args, cwd, capture = false }) => {
  process.stdout.write(`\n[miromind-readiness] ${name}\n`);
  process.stdout.write(`$ ${[command, ...args].join(' ')}\n`);
  return execFileSync(command, args, {
    cwd,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
    encoding: capture ? 'utf8' : undefined,
  });
};

const assertSecretListIncludesMiroMind = () => {
  const output = runStep({
    name: 'Cloudflare Pages production secret list',
    command: 'npx',
    args: ['--yes', 'wrangler@latest', 'pages', 'secret', 'list', '--project-name', PROJECT_NAME],
    cwd: repoRoot,
    capture: true,
  });
  process.stdout.write(output);
  if (!output.includes(`${SECRET_NAME}: Value Encrypted`)) {
    throw new Error(`Cloudflare Pages project ${PROJECT_NAME} does not list ${SECRET_NAME} in production secrets.`);
  }
};

const readJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const runLiveSmoke = async () => {
  const endpoint = `${LIVE_ORIGIN}/__chat_proxy/v1/models`;
  process.stdout.write(`\n[miromind-readiness] live Pages proxy smoke\n`);
  process.stdout.write(`GET ${endpoint}\n`);
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-kg-chat-provider': 'miromind',
      'x-client-request-id': 'kg-miromind-pages-env-readiness',
    },
    signal: AbortSignal.timeout(15000),
  });
  const bodyText = await response.text();
  const payload = readJson(bodyText);
  const proxyMissingKey = Boolean(
    payload
    && payload.ok === false
    && /Missing MiroMind API key/i.test(String(payload.error || '')),
  );
  const summary = {
    origin: LIVE_ORIGIN,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    proxyMissingKey,
    bodyPreview: bodyText.slice(0, 240).replace(/[\r\n]+/g, ' '),
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (proxyMissingKey) {
    throw new Error(
      `${SECRET_NAME} is listed on the Pages project, but the live Pages Function does not see it on context.env. ` +
      `Create a fresh Pages deployment after the secret is configured, then rerun npm run miromind:readiness:check.`,
    );
  }
  if (response.status !== 200) {
    throw new Error(`MiroMind live proxy smoke expected HTTP 200 from ${endpoint}; got ${response.status}.`);
  }
};

if (!LIVE_MODE) {
  runStep({
    name: 'canvas focused MiroMind checks',
    command: npmCommand,
    args: ['--prefix', 'canvas', 'run', 'test:smoke:miromind:source'],
    cwd: repoRoot,
  });
}

assertSecretListIncludesMiroMind();

if (SKIP_LIVE) {
  process.stdout.write('\n[miromind-readiness] skipped live Pages proxy smoke by request\n');
} else {
  await runLiveSmoke();
}

process.stdout.write('\n[miromind-readiness] ok\n');
