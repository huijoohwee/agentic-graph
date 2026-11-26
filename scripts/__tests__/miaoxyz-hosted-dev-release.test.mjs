import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import YAML from 'yaml'

import { digest } from '../miaoxyz-production-release-core.mjs'
import {
  createDevConfig, DEV_DATABASE_ID, DEV_DATABASE_NAME, DEV_WORKER_NAME, validateDevConfig,
  validateDevDatabaseInfo, validateDevPromotionReceipt,
} from '../miaoxyz-hosted-dev-release.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const sourceConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'cloudflare/workers/miaoxyz/wrangler.jsonc'), 'utf8'))
const productionId = sourceConfig.env.production.d1_databases[0].database_id
const config = createDevConfig(sourceConfig)
const stagedWorkflow = YAML.parse(fs.readFileSync(path.join(repoRoot, '.github/workflows/miaoxyz-hosted-staged-release.yml'), 'utf8'))
const releaseWorkflow = YAML.parse(fs.readFileSync(path.join(repoRoot, '.github/workflows/release.yml'), 'utf8'))

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
  assert.equal(verify.environment, undefined)
  assert.equal(dev.environment.name, 'development')
  assert.deepEqual(production.needs, ['miaoxyz_verify', 'miaoxyz_dev_deploy'])
  assert.match(production.if, /needs\.miaoxyz_dev_deploy\.result == 'success'/)
  assert.match(production.steps.find(step => step.name === 'Verify the same candidate passed Dev').run, /miaoxyz-hosted-dev-release\.mjs verify/)
  assert.match(production.steps.find(step => step.name === 'Download exact successful Dev readback receipt').with.name,
    /miaoxyz-dev-receipt-\$\{\{ inputs\.source_sha \}\}-\$\{\{ github\.run_id \}\}/)
  assert.match(releaseWorkflow.jobs.miaoxyz_release.uses, /miaoxyz-hosted-staged-release\.yml/)
})
