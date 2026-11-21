import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const baseRepo = 'huijoohwee/agentic-base'
const workflow = '.github/workflows/ci.yml'
const branch = 'automation/graph-adapter-pin'
const sha = value => {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error('Expected an immutable Git revision')
  return value
}

function request(path, method = 'GET', body) {
  const args = ['api', `repos/${baseRepo}/${path}`, '--method', method]
  if (body) args.push('--input', '-')
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', input: JSON.stringify(body) }))
}
const content = (api, ref) => Buffer.from(api(`contents/${workflow}?ref=${sha(ref)}`).content, 'base64').toString()
const mainTip = api => sha(api('git/ref/heads/main').object.sha)
const branchTip = api => api(`git/matching-refs/heads/${branch}`)
  .find(entry => entry.ref === `refs/heads/${branch}`)?.object.sha ?? null
const pulls = api => api(`pulls?base=main&head=${baseRepo.split('/')[0]}:${branch}&state=all&per_page=1`)

export function replacePin(source, previous, next) {
  const pattern = new RegExp(`^( +ref: +)${sha(previous)}([ \\t]*(?:#.*)?)$`, 'gm')
  if ([...source.matchAll(pattern)].length !== 1) throw new Error('Expected one addressable Graph checkout ref')
  return source.replace(pattern, (_, prefix, suffix) => prefix + sha(next) + suffix)
}

function checkoutContract(source, graphRepo) {
  // The publication job has a sparse checkout and no installed Graph dependencies.
  const steps = JSON.parse(execFileSync('ruby', ['-ryaml', '-rjson', '-e',
    'puts JSON.generate(YAML.safe_load(STDIN.read).fetch("jobs").fetch("check").fetch("steps"))'],
  { encoding: 'utf8', input: source }))
  const checkouts = steps.filter(step =>
    step.uses?.startsWith('actions/checkout@') && step.with?.repository === graphRepo)
  if (checkouts.length !== 1) throw new Error('Expected one Graph checkout in the required Base check')
  const config = checkouts[0].with
  const paths = config['sparse-checkout'].trim().split(/\s+/).map(entry => {
    if (!/^\/[\w./-]+$/.test(entry) || entry.split('/').includes('..')) throw new Error('Expected literal sparse paths')
    return entry.slice(1)
  })
  return { pin: sha(config.ref), paths }
}

export function changedSince(previous, next, paths, cwd) {
  const git = args => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
    if (![0, 1].includes(result.status)) throw result.error ?? new Error(result.stderr || 'git comparison failed')
    return result.status
  }
  if (git(['merge-base', '--is-ancestor', sha(next), sha(previous)]) === 0) return false
  if (git(['merge-base', '--is-ancestor', previous, next]) !== 0) throw new Error('Graph revisions have diverged')
  return git(['--literal-pathspecs', 'diff', '--quiet', previous, next, '--', ...paths]) === 1
}

export function plan(next, graphRepo, api = request, changed = changedSince) {
  const base = mainTip(api)
  const source = content(api, base)
  const { pin, paths } = checkoutContract(source, graphRepo)
  if (!changed(pin, next, paths)) return null
  const tip = branchTip(api)
  if (tip) {
    const comparison = api(`compare/${base}...${sha(tip)}`)
    const ancestor = content(api, comparison.merge_base_commit.sha)
    const topic = content(api, tip)
    const { pin: prior } = checkoutContract(topic, graphRepo)
    if (comparison.files.some(file => file.filename !== workflow) ||
        replacePin(topic, prior, checkoutContract(ancestor, graphRepo).pin) !== ancestor)
      throw new Error('Refresh branch contains edits beyond the managed pin')
    if (!changed(prior, next, paths)) {
      // Recover a published branch if PR creation was interrupted. Honor a closed review.
      if (prior === pin || pulls(api).some(pr => pr.state === 'open' || pr.head.sha === tip)) return null
      return { base, tip, pin, next: prior, write: false }
    }
  }
  return { base, tip, pin, next: sha(next), write: true }
}

export function publish({ base, tip, pin, next, write }, api = request) {
  if (mainTip(api) !== base || branchTip(api) !== tip) throw new Error('Base refs changed since planning; rerun the gate')
  if (write) {
    const text = replacePin(content(api, base), pin, next)
    const parent = api(`git/commits/${sha(base)}`)
    const tree = api('git/trees', 'POST', {
      base_tree: parent.tree.sha, tree: [{ path: workflow, mode: '100644', type: 'blob', content: text }],
    })
    const commit = api('git/commits', 'POST', {
      message: `ci: refresh the Graph adapter pin to ${next}`, tree: tree.sha,
      parents: [...new Set([base, tip].filter(Boolean))],
    })
    if (tip) api(`git/refs/heads/${branch}`, 'PATCH', { sha: commit.sha, force: false })
    else api('git/refs', 'POST', { ref: `refs/heads/${branch}`, sha: commit.sha })
  }
  const open = pulls(api).find(pr => pr.state === 'open')
  return open ?? api('pulls', 'POST', {
    base: 'main', head: branch, title: 'Refresh the Graph adapter revision',
    body: 'The pin commit identifies the Graph revision. Base’s required Integration Gate runs its adapter suite against the candidate Base package.',
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'plan') {
    const result = plan(sha(process.env.GITHUB_SHA), process.env.GITHUB_REPOSITORY)
    console.log(result ?? 'Base already covers the current Graph adapter inputs.')
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `plan=${result ? JSON.stringify(result) : ''}\n`)
  } else if (process.argv[2] === 'publish') {
    let result = JSON.parse(process.env.PIN_PLAN)
    if (mainTip(request) !== result.base || branchTip(request) !== result.tip)
      result = plan(sha(process.env.GITHUB_SHA), process.env.GITHUB_REPOSITORY)
    console.log(result ? publish(result).html_url : 'Base already covers the current Graph adapter inputs.')
  } else throw new Error('Expected plan or publish')
}
