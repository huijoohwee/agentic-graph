import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import YAML from 'yaml'

import { digest } from '../miaoxyz-production-release-core.mjs'
import {
  createDevConfig, DEV_DATABASE_ID, DEV_DATABASE_NAME, DEV_WORKER_NAME, validateDevConfig,
  validateDevDatabaseInfo, validateDevPromotionReceipt, workersDevOrigin,
} from '../miaoxyz-hosted-dev-release.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const sourceConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'cloudflare/workers/miaoxyz/wrangler.jsonc'), 'utf8'))
const productionId = sourceConfig.env.production.d1_databases[0].database_id
const config = createDevConfig(sourceConfig)
const stagedWorkflow = YAML.parse(fs.readFileSync(path.join(repoRoot, '.github/workflows/miaoxyz-hosted-staged-release.yml'), 'utf8'))
const releaseWorkflow = YAML.parse(fs.readFileSync(path.join(repoRoot, '.github/workflows/release.yml'), 'utf8'))
const sourcePrepAction = YAML.parse(fs.readFileSync(path.join(repoRoot, '.github/actions/prepare-miaoxyz-source/action.yml'), 'utf8'))

test('hosted Dev is isolated from Production and does not bind a custom route or cron', () => {
  const validated = validateDevConfig(config, productionId)
  assert.equal(validated.dev.name, DEV_WORKER_NAME)
  assert.equal(validated.database.database_name, DEV_DATABASE_NAME)
  assert.equal(validated.database.database_id, DEV_DATABASE_ID)
  assert.notEqual(validated.database.database_id, productionId)
  assert.deepEqual(validated.dev.routes, [])
  assert.deepEqual(validated.dev.triggers.crons, [])
  assert.equal(validated.dev.vars.DEPLOYMENT_ENV, 'dev')
  assert.equal(validated.dev.vars.DATA_REGION_APPROVED, 'false')
})

test('hosted Dev preflight rejects Production bindings, public routes, and scheduled triggers', () => {
  const sameDatabase = structuredClone(config)
  sameDatabase.d1_databases[0] = structuredClone(sourceConfig.env.production.d1_databases[0])
  assert.throws(() => validateDevConfig(sameDatabase, productionId), /Dev must use only its provisioned/)

  const routed = structuredClone(config)
  routed.routes.push({ pattern: 'airvio.co/MiaoXYZ/*', zone_name: 'airvio.co' })
  assert.throws(() => validateDevConfig(routed, productionId), /must not bind custom-domain routes/)

  const scheduled = structuredClone(config)
  scheduled.triggers.crons.push('17 3 * * *')
  assert.throws(() => validateDevConfig(scheduled, productionId), /cron triggers must be disabled/)
})

test('hosted Dev database readback is bound to the APAC isolated D1', () => {
  const { database } = validateDevConfig(config, productionId)
  const info = {
    result: {
      name: database.database_name,
      uuid: database.database_id,
      running_in_region: 'APAC',
      jurisdiction: null,
      read_replication: { mode: 'disabled' },
    },
  }
  assert.deepEqual(validateDevDatabaseInfo(info, database), {
    runningInRegion: 'APAC', jurisdiction: null, readReplicationMode: 'disabled',
  })
  assert.throws(() => validateDevDatabaseInfo({ result: { ...info.result, uuid: 'wrong' } }, database), /does not match/)
})

test('hosted Dev reads the exact Worker subdomain exposure under the Worker-scoped token', { concurrency: false }, async t => {
  const previousFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = previousFetch })
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options })
    return new Response(JSON.stringify({ success: true, errors: [], result: { enabled: true, previews_enabled: false } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }

  assert.equal(await workersDevOrigin({
    accountId: 'a'.repeat(32), token: 'test-token', workerName: DEV_WORKER_NAME, subdomain: 'huijoohwee',
  }), 'https://agentic-miaoxyz-dev.huijoohwee.workers.dev')
  assert.equal(requests[0].url,
    `https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/workers/scripts/${DEV_WORKER_NAME}/subdomain`)
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-token')

  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true, errors: [], result: { enabled: true, previews_enabled: true },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  await assert.rejects(workersDevOrigin({
    accountId: 'a'.repeat(32), token: 'test-token', workerName: DEV_WORKER_NAME, subdomain: 'huijoohwee',
  }), /preview URLs disabled/)
})

test('Production promotion requires a receipt for the exact Dev candidate and runtime version', () => {
  const candidate = {
    source: { revision: 'a'.repeat(40) },
    candidateDigest: 'b'.repeat(64),
    worker: { artifactDigest: 'c'.repeat(64), wranglerConfigDigest: digest(sourceConfig) },
  }
  const body = {
    schema: 'agentic-miaoxyz-dev-deployment-receipt/v1',
    status: 'deployed',
    sourceRevision: candidate.source.revision,
    candidateDigest: candidate.candidateDigest,
    workerArtifactDigest: candidate.worker.artifactDigest,
    wranglerConfigDigest: candidate.worker.wranglerConfigDigest,
    devConfigDigest: digest(config),
    workerName: DEV_WORKER_NAME,
    databaseId: DEV_DATABASE_ID,
    deployedVersionId: '12345678-1234-4234-8234-123456789abc',
    workersDevOrigin: 'https://agentic-miaoxyz-dev.huijoohwee.workers.dev',
    workersDevSubdomain: 'huijoohwee',
    probePassed: true,
  }
  const receipt = { ...body, receiptDigest: digest(body) }
  assert.equal(validateDevPromotionReceipt({ receipt, candidate, config }), receipt)

  const wrongCandidate = { ...candidate, candidateDigest: 'd'.repeat(64) }
  assert.throws(() => validateDevPromotionReceipt({ receipt, candidate: wrongCandidate, config }), /exact candidate/)

  const tampered = { ...receipt, probePassed: false }
  assert.throws(() => validateDevPromotionReceipt({ receipt: tampered, candidate, config }), /receipt digest/)
})

test('the protected release workflow gates Production on the same successful Dev candidate', () => {
  const verify = stagedWorkflow.jobs.miaoxyz_verify
  const dev = stagedWorkflow.jobs.miaoxyz_dev_deploy
  const production = stagedWorkflow.jobs.miaoxyz_deploy
  assert.equal(verify.environment.name, 'miaoxyz-candidate-read')
  assert.equal(dev.environment.name, 'development')
  assert.equal(dev.steps.find(step => step.name === 'Deploy exact candidate to isolated Dev D1 and Worker').env.CLOUDFLARE_WORKERS_DEV_SUBDOMAIN,
    '${{ vars.CLOUDFLARE_WORKERS_DEV_SUBDOMAIN }}')
  assert.deepEqual(production.needs, ['miaoxyz_verify', 'miaoxyz_dev_deploy'])
  assert.match(production.if, /needs\.miaoxyz_dev_deploy\.result == 'success'/)
  assert.match(production.steps.find(step => step.name === 'Verify the same candidate passed Dev').run, /miaoxyz-hosted-dev-release\.mjs verify/)
  assert.match(production.steps.find(step => step.name === 'Download exact successful Dev readback receipt').with.name,
    /miaoxyz-dev-receipt-\$\{\{ inputs\.source_sha \}\}-\$\{\{ github\.run_id \}\}/)
  assert.match(releaseWorkflow.jobs.miaoxyz_release.uses, /miaoxyz-hosted-staged-release\.yml/)
  assert.equal(releaseWorkflow.jobs.miaoxyz_release.if, "inputs.release_target == 'miaoxyz'")
  assert.match(releaseWorkflow.jobs.miaoxyz_catalog_release.uses, /miaoxyz-production-release\.yml/)
  assert.equal(releaseWorkflow.jobs.miaoxyz_catalog_release.if, "inputs.release_target == 'miaoxyz-catalog'")
})

test('every hosted release stage installs Wrangler at the exact pinned MiaoXYZ source', () => {
  for (const jobName of ['miaoxyz_verify', 'miaoxyz_dev_deploy', 'miaoxyz_deploy']) {
    const job = stagedWorkflow.jobs[jobName]
    const prepare = job.steps.find(step => step.name === 'Prepare exact MiaoXYZ source and Wrangler')
    assert.equal(prepare.uses, './.github/actions/prepare-miaoxyz-source')
  }
  const pin = sourcePrepAction.runs.steps.find(step => step.name === 'Resolve exact MiaoXYZ product source pin')
  assert.equal(pin.id, 'miaoxyz_source')
  assert.match(pin.run, /miaoxyz-production-release-source\.json/)
  const source = sourcePrepAction.runs.steps.find(step => step.name === 'Checkout exact pinned MiaoXYZ product source')
  assert.equal(source.with.repository, 'huijoohwee/MiaoXYZ')
  assert.equal(source.with.ref, '${{ steps.miaoxyz_source.outputs.revision }}')
  assert.equal(source.with.path, 'MiaoXYZ-source')
  assert.equal(source.with['persist-credentials'], false)
  const currentMain = sourcePrepAction.runs.steps.find(step => step.name === 'Verify pinned source is current protected MiaoXYZ main')
  assert.match(currentMain.run, /git -C MiaoXYZ-source ls-remote origin refs\/heads\/main/)
  const install = sourcePrepAction.runs.steps.find(step => step.name === 'Install pinned MiaoXYZ Wrangler')
  assert.equal(install.run, 'npm ci --prefix MiaoXYZ-source')
  const sourceRoot = sourcePrepAction.runs.steps.find(step => step.name === 'Set MiaoXYZ source root for following steps')
  assert.match(sourceRoot.run, /MIAOXYZ_PRODUCT_SOURCE_ROOT=.*MiaoXYZ-source/)
  assert.equal(
    stagedWorkflow.jobs.miaoxyz_verify.steps.find(step => step.name === 'Check generated Worker bindings').run,
    'npm run types:check --prefix MiaoXYZ-source',
  )
})
