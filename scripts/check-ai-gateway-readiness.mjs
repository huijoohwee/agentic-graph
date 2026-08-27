import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(__filename);
const repoRoot = path.resolve(scriptsDir, '..');
const canvasRoot = path.resolve(repoRoot, 'canvas');
const publishRepoRoot = path.resolve(repoRoot, '../huijoohwee');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const projectName = 'joohwee';
const defaultOrigin = 'https://airvio.co';
const liveOrigin = String(process.env.AGENTICGRAPH_AI_GATEWAY_PAGES_ORIGIN || defaultOrigin).replace(/\/+$/g, '');
const liveOnly = process.argv.includes('--live-only');
const skipLive = process.argv.includes('--skip-live');
const skipSyncCheck = process.argv.includes('--skip-sync-check');

const runStep = ({ name, command, args, cwd, capture = false }) => {
  process.stdout.write(`\n[ai-gateway-readiness] ${name}\n`);
  process.stdout.write(`$ ${[command, ...args].join(' ')}\n`);
  return execFileSync(command, args, {
    cwd,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
    encoding: capture ? 'utf8' : undefined,
  });
};

const readEnvPresence = (name) => (String(process.env[name] || '').trim() ? 'present' : 'missing');

const tsxCommand = (() => {
  const localTsx = path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  if (existsSync(localTsx)) return { command: localTsx, argsPrefix: [] };
  return { command: npxCommand, argsPrefix: ['--yes', 'tsx'] };
})();

const runExportedTest = ({ name, relativeFilePath, exportName }) => {
  const snippet = [
    'void (async () => {',
    `const mod = await import(${JSON.stringify(relativeFilePath)});`,
    `const fn = mod[${JSON.stringify(exportName)}];`,
    `if (typeof fn !== 'function') throw new Error(${JSON.stringify(`Missing exported test ${exportName}`)});`,
    'await fn();',
    "console.log('ok');",
    '})()',
  ].join('\n');
  runStep({
    name,
    command: tsxCommand.command,
    args: [...tsxCommand.argsPrefix, '-e', snippet],
    cwd: canvasRoot,
  });
};

const inspectPagesSecretList = () => {
  const output = runStep({
    name: 'Cloudflare Pages production secret list',
    command: npxCommand,
    args: ['--yes', 'wrangler@latest', 'pages', 'secret', 'list', '--project-name', projectName],
    cwd: repoRoot,
    capture: true,
  });
  process.stdout.write(output);
  const acceptedSecretNames = [
    'AGENTICGRAPH_CHAT_PROXY_AI_GATEWAY_TOKEN',
    'AI_GATEWAY_TOKEN',
    'CLOUDFLARE_API_TOKEN',
  ];
  return {
    acceptedSecretNames,
    acceptedSecretPresent: acceptedSecretNames.some((name) => output.includes(`${name}: Value Encrypted`)),
  };
};

const inspectPagesProjectConfig = () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'kg-ai-gateway-pages-config-'));
  try {
    runStep({
      name: 'Cloudflare Pages project config download',
      command: npxCommand,
      args: ['--yes', 'wrangler@latest', 'pages', 'download', 'config', projectName, '--force'],
      cwd: tmpDir,
    });
    const configPath = path.join(tmpDir, 'wrangler.toml');
    const configText = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
    return {
      baseUrlPresent: configText.includes('AGENTICGRAPH_CHAT_PROXY_AI_GATEWAY_BASE_URL'),
      gatewayIdPresent: configText.includes('AGENTICGRAPH_CHAT_PROXY_AI_GATEWAY_GATEWAY_ID'),
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
};

const readJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const runLiveTransportSmoke = async () => {
  const endpoint = `${liveOrigin}/__chat_proxy/v1/responses`;
  process.stdout.write(`\n[ai-gateway-readiness] live Pages AI Gateway transport smoke\n`);
  process.stdout.write(`POST ${endpoint}\n`);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-kg-chat-provider': 'openai',
      // Force the deployed proxy onto the Cloudflare-hosted transport code path even when
      // Pages variables are being rolled out separately from the code deploy.
      'x-kg-chat-upstream': 'https://api.cloudflare.com/client/v4/accounts/test-account/ai',
      'x-kg-ai-gateway-route': 'dynamic/draft',
      'x-client-request-id': 'kg-ai-gateway-pages-readiness',
    },
    body: JSON.stringify({
      model: 'gpt-5-nano',
      input: [{ role: 'user', content: 'hello from agenticgraph ai gateway readiness smoke' }],
      stream: false,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const bodyText = await response.text();
  const payload = readJson(bodyText);
  const proxyMissingKey = Boolean(
    payload
    && payload.ok === false
    && /Missing Cloudflare AI Gateway token/i.test(String(payload.error || '')),
  );
  const proxyHostRejected = Boolean(
    payload
    && payload.ok === false
    && /upstream host is not allowed/i.test(String(payload.error || '')),
  );
  const summary = {
    origin: liveOrigin,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    proxyMissingKey,
    proxyHostRejected,
    bodyPreview: bodyText.slice(0, 240).replace(/[\r\n]+/g, ' '),
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (proxyMissingKey) {
    throw new Error(
      'The live Pages proxy still reports a missing AI Gateway secret. ' +
      'Create a fresh Pages deployment after setting AGENTICGRAPH_CHAT_PROXY_AI_GATEWAY_TOKEN, ' +
      'AI_GATEWAY_TOKEN, or CLOUDFLARE_API_TOKEN, then rerun this check.',
    );
  }
  if (proxyHostRejected) {
    throw new Error(
      'The live Pages proxy rejected the Cloudflare AI Gateway host. ' +
      'Deploy the updated publish-repo __chat_proxy owner before treating the AI Gateway lane as live.',
    );
  }
  if (response.status >= 500) {
    throw new Error(`Live Pages AI Gateway transport smoke expected a bounded non-5xx response; got ${response.status}.`);
  }
};

if (!liveOnly) {
  runExportedTest({
    name: 'source header contract for OpenAI draft route',
    relativeFilePath: './src/__tests__/chatEndpointProviders.test.ts',
    exportName: 'testOpenAiDraftRouteBuildsAiGatewayHeaders',
  });

  runExportedTest({
    name: 'source server-managed OpenAI contract',
    relativeFilePath: './src/__tests__/mainPanelOpenAiServerManagedKey.test.tsx',
    exportName: 'testMainPanelOpenAiApiKeyUsesServerManagedProxyContract',
  });

  runExportedTest({
    name: 'storage relay forwards Responses AI Gateway payload',
    relativeFilePath: './src/__tests__/storageChatRelayWorker.test.ts',
    exportName: 'testStorageChatRelayRouteForwardsOpenAiResponsesInput',
  });

  if (skipSyncCheck) {
    process.stdout.write('\n[ai-gateway-readiness] skipped publish sync drift check by request\n');
  } else {
    runStep({
      name: 'publish sync drift check',
      command: npmCommand,
      args: ['run', 'pages:check-sync'],
      cwd: repoRoot,
    });
  }

  runStep({
    name: 'production Pages proxy smoke',
    command: process.execPath,
    args: ['./scripts/smoke-test-integrations.mjs'],
    cwd: publishRepoRoot,
  });
}

process.stdout.write('\n[ai-gateway-readiness] local operator env presence\n');
process.stdout.write(`AGENTICGRAPH_CHAT_PROXY_AI_GATEWAY_TOKEN=${readEnvPresence('AGENTICGRAPH_CHAT_PROXY_AI_GATEWAY_TOKEN')}\n`);
process.stdout.write(`AI_GATEWAY_TOKEN=${readEnvPresence('AI_GATEWAY_TOKEN')}\n`);
process.stdout.write(`CLOUDFLARE_API_TOKEN=${readEnvPresence('CLOUDFLARE_API_TOKEN')}\n`);
process.stdout.write(`AGENTICGRAPH_CHAT_PROXY_AI_GATEWAY_BASE_URL=${readEnvPresence('AGENTICGRAPH_CHAT_PROXY_AI_GATEWAY_BASE_URL')}\n`);
process.stdout.write(`AGENTICGRAPH_CHAT_PROXY_AI_GATEWAY_GATEWAY_ID=${readEnvPresence('AGENTICGRAPH_CHAT_PROXY_AI_GATEWAY_GATEWAY_ID')}\n`);
const projectConfig = inspectPagesProjectConfig();
process.stdout.write('\n[ai-gateway-readiness] Cloudflare Pages project AI Gateway vars\n');
process.stdout.write(`AGENTICGRAPH_CHAT_PROXY_AI_GATEWAY_BASE_URL=${projectConfig.baseUrlPresent ? 'present' : 'missing'}\n`);
process.stdout.write(`AGENTICGRAPH_CHAT_PROXY_AI_GATEWAY_GATEWAY_ID=${projectConfig.gatewayIdPresent ? 'present' : 'missing (optional)'}\n`);

const pagesSecrets = inspectPagesSecretList();
const blockers = [];
if (!projectConfig.baseUrlPresent) {
  blockers.push(
    'Cloudflare Pages project joohwee is missing AGENTICGRAPH_CHAT_PROXY_AI_GATEWAY_BASE_URL in the downloaded project config.',
  );
}
if (!pagesSecrets.acceptedSecretPresent) {
  blockers.push(
    `Cloudflare Pages project ${projectName} is missing an AI Gateway secret. ` +
    `Expected one of ${pagesSecrets.acceptedSecretNames.join(', ')}.`,
  );
}
if (blockers.length > 0) {
  throw new Error(blockers.join(' '));
}

if (skipLive) {
  process.stdout.write('\n[ai-gateway-readiness] skipped live Pages AI Gateway transport smoke by request\n');
} else {
  await runLiveTransportSmoke();
}

process.stdout.write('\n[ai-gateway-readiness] ok\n');
