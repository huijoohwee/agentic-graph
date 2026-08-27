#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const APPLY_CONFIRMATION = 'configure-pages-github-write'
const DEFAULT_PROJECT = 'joohwee'
const DEFAULT_REPOSITORY = 'huijoohwee/huijoohwee'
const DEFAULT_BRANCH = 'main'
const DEFAULT_ROUTE = 'https://airvio.co/agenticgraph/api/workspace/github/write'

const hasFlag = (name) => args.includes(name)
const readArgValue = (name, fallback = '') => {
  const index = args.indexOf(name)
  if (index >= 0 && typeof args[index + 1] === 'string') return args[index + 1]
  const prefix = `${name}=`
  const match = args.find(arg => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}
const readEnv = (key) => String(process.env[key] || '').trim()

const options = {
  apply: hasFlag('--apply'),
  allowOauthToken: hasFlag('--allow-oauth-token'),
  branch: readArgValue('--branch', readEnv('AGENTICGRAPH_GITHUB_WRITE_BRANCH') || DEFAULT_BRANCH),
  confirm: readArgValue('--confirm', ''),
  json: hasFlag('--json'),
  projectName: readArgValue('--project-name', DEFAULT_PROJECT),
  repository: readArgValue('--repository', readEnv('AGENTICGRAPH_GITHUB_WRITE_REPOSITORY') || DEFAULT_REPOSITORY),
  route: readArgValue('--route', DEFAULT_ROUTE),
  writeSmoke: hasFlag('--write-smoke'),
  yes: hasFlag('--yes'),
}

const checks = []
const actions = []
const addCheck = (name, status, details) => checks.push({ name, status, details })
const addAction = (name, target) => actions.push({ name, target })

const run = (command, commandArgs, input = '') => spawnSync(command, commandArgs, {
  cwd: process.cwd(),
  encoding: 'utf8',
  input,
  stdio: ['pipe', 'pipe', 'pipe'],
})

const redact = (text) => {
  const token = readEnv('AGENTICGRAPH_GITHUB_WRITE_TOKEN')
  return token ? String(text || '').split(token).join('<redacted>') : String(text || '')
}

const requireApplyConfirmation = () => {
  if (!options.apply) return true
  if (options.yes && options.confirm === APPLY_CONFIRMATION) return true
  addCheck(
    'apply-confirmation',
    'fail',
    `Mutation requires --apply --yes --confirm=${APPLY_CONFIRMATION}.`,
  )
  return false
}

const validateRepository = () => {
  const parts = options.repository.split('/').map(part => part.trim()).filter(Boolean)
  if (parts.length !== 2) {
    addCheck('repository-shape', 'fail', 'Repository must use owner/name form.')
    return false
  }
  addCheck('repository-shape', 'pass', `Repository target is ${options.repository}.`)
  addAction('AGENTICGRAPH_GITHUB_WRITE_REPOSITORY', 'cloudflare-pages-secret')
  return true
}

const validateBranch = () => {
  if (!options.branch || /[\s~^:?*[\\\]]/.test(options.branch)) {
    addCheck('branch-shape', 'fail', 'Branch is missing or contains invalid Git ref characters.')
    return false
  }
  addCheck('branch-shape', 'pass', `Branch target is ${options.branch}.`)
  addAction('AGENTICGRAPH_GITHUB_WRITE_BRANCH', 'cloudflare-pages-secret')
  return true
}

const validateToken = (tokenSecretExists) => {
  const token = readEnv('AGENTICGRAPH_GITHUB_WRITE_TOKEN')
  if (!token) {
    if (!options.apply && tokenSecretExists) {
      addCheck(
        'token-input',
        'pass',
        'No local token was provided; the existing production Pages secret will be used for live route smoke.',
      )
      return true
    }
    addCheck(
      'token-input',
      'fail',
      'Missing AGENTICGRAPH_GITHUB_WRITE_TOKEN in the process environment. Use a fine-grained GitHub token limited to the target repository with Contents read/write.',
    )
    return false
  }
  if (token.startsWith('gho_') && !options.allowOauthToken) {
    addCheck(
      'token-shape',
      'fail',
      'Refusing GitHub OAuth tokens by default. Use a fine-grained github_pat_ token, or pass --allow-oauth-token if you intentionally accept that broader credential.',
    )
    return false
  }
  if (!/^(github_pat_|ghp_|gho_)/.test(token)) {
    addCheck('token-shape', 'fail', 'GitHub token must look like github_pat_, ghp_, or an explicitly allowed gho_ token.')
    return false
  }
  addCheck('token-input', 'pass', 'GitHub token is present in process environment and will not be printed.')
  addAction('AGENTICGRAPH_GITHUB_WRITE_TOKEN', 'cloudflare-pages-secret')
  return true
}

const putSecret = (name, value) => {
  const result = run('npx', [
    'wrangler',
    'pages',
    'secret',
    'put',
    name,
    '--project-name',
    options.projectName,
  ], value)
  if (result.status === 0) {
    addCheck(`put-${name}`, 'pass', `Uploaded ${name} to Pages project ${options.projectName}.`)
    return true
  }
  addCheck(`put-${name}`, 'fail', redact(result.stderr || result.stdout || `wrangler failed with status ${result.status}`))
  return false
}

const listSecrets = () => {
  const result = run('npx', ['wrangler', 'pages', 'secret', 'list', '--project-name', options.projectName])
  if (result.status !== 0) {
    addCheck('pages-secret-list', 'fail', redact(result.stderr || result.stdout || `wrangler failed with status ${result.status}`))
    return new Set()
  }
  const names = new Set()
  for (const line of String(result.stdout || '').split('\n')) {
    const match = line.match(/-\s+([A-Z0-9_]+):\s+Value Encrypted/)
    if (match?.[1]) names.add(match[1])
  }
  addCheck('pages-secret-list', 'pass', `Read ${names.size} production Pages secret name(s).`)
  return names
}

const smokeRoute = () => {
  const result = run('curl', [
    '-sS',
    '-X',
    'POST',
    options.route,
    '-H',
    'content-type: application/json',
    '--data',
    JSON.stringify({
      dryRun: !options.writeSmoke,
      files: [{
        workspacePath: '/chat-log/configure-smoke/kgc_configure-smoke.md',
        text: '# configure smoke',
      }],
    }),
  ])
  if (result.status !== 0) {
    addCheck('live-route-smoke', 'fail', result.stderr || `curl failed with status ${result.status}`)
    return
  }
  let body = null
  try {
    body = JSON.parse(result.stdout)
  } catch {
    body = null
  }
  if (body?.ok === true) {
    addCheck(
      'live-route-smoke',
      'pass',
      options.writeSmoke
        ? `Live route wrote ${body.files?.length || 0} file(s).`
        : `Live route accepted dry-run GitHub write config for ${body.files?.length || 0} file(s).`,
    )
    return
  }
  const missing = Array.isArray(body?.missing) ? body.missing.join(', ') : ''
  const upstream = body?.upstreamStatus ? ` upstream ${body.upstreamStatus}${body.upstreamMessage ? ` ${body.upstreamMessage}` : ''}` : ''
  addCheck(
    'live-route-smoke',
    missing || options.writeSmoke ? 'fail' : 'warn',
    missing
      ? `Live route is still missing: ${missing}. Redeploy Pages after secret changes.`
      : `Live route returned ${body?.error || 'non-ok response'}.${upstream} Use --write-smoke only when a real GitHub test commit is intended.`,
  )
}

const repositoryOk = validateRepository()
const branchOk = validateBranch()
const canApply = requireApplyConfirmation()
const existingSecrets = listSecrets()
for (const name of ['AGENTICGRAPH_GITHUB_WRITE_REPOSITORY', 'AGENTICGRAPH_GITHUB_WRITE_BRANCH', 'AGENTICGRAPH_GITHUB_WRITE_TOKEN']) {
  addCheck(`existing-${name}`, existingSecrets.has(name) ? 'pass' : 'fail', existingSecrets.has(name) ? `${name} exists on production Pages.` : `${name} is absent from production Pages.`)
}
const tokenOk = validateToken(existingSecrets.has('AGENTICGRAPH_GITHUB_WRITE_TOKEN'))

if (options.apply && canApply) {
  if (repositoryOk) putSecret('AGENTICGRAPH_GITHUB_WRITE_REPOSITORY', options.repository)
  if (branchOk) putSecret('AGENTICGRAPH_GITHUB_WRITE_BRANCH', options.branch)
  if (tokenOk) putSecret('AGENTICGRAPH_GITHUB_WRITE_TOKEN', readEnv('AGENTICGRAPH_GITHUB_WRITE_TOKEN'))
}

if (!options.apply) {
  addCheck(
    'apply-mode',
    'skip',
    `Dry run only. To mutate Pages secrets, export AGENTICGRAPH_GITHUB_WRITE_TOKEN and pass --apply --yes --confirm=${APPLY_CONFIRMATION}. Add --write-smoke only when a real GitHub test commit is intended.`,
  )
}

smokeRoute()

const failed = checks.filter(check => check.status === 'fail')
const output = {
  ok: failed.length === 0,
  projectName: options.projectName,
  repository: options.repository,
  branch: options.branch,
  actions,
  checks,
}

if (options.json) {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
} else {
  for (const check of checks) {
    const label = check.status === 'pass' ? 'ok' : check.status === 'skip' ? 'skip' : check.status === 'warn' ? 'warn' : 'not ok'
    process.stdout.write(`${label} ${check.name}: ${check.details}\n`)
  }
}

process.exit(failed.length > 0 ? 1 : 0)
