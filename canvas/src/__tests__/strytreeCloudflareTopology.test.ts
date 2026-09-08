import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { StrytreeCreditLedgerActor, createAgenticGraphPaymentWorker } from '../../../cloudflare/workers/agentic-graph-payment/index.ts'

const repoRoot = () => resolve(process.cwd(), '..')

const readRepoFile = (...parts: string[]): string =>
  readFileSync(resolve(repoRoot(), ...parts), 'utf8')

const normalizeSql = (text: string): string =>
  text.toLowerCase().replace(/\s+/g, ' ').trim()

export function testStrytreeD1MigrationDefinesPrdTablesAndIndexes() {
  const migrationText = readRepoFile('cloudflare', 'd1', 'migrations', '0004_strytree_storytree.sql')
  const sql = normalizeSql(migrationText)
  const requiredTables = [
    'strytree_users',
    'strytree_sessions',
    'strytree_stories',
    'strytree_nodes',
    'strytree_assets',
    'strytree_node_asset_refs',
    'strytree_unlocks',
    'strytree_token_ledger',
    'strytree_payment_sessions',
    'strytree_generation_jobs',
    'strytree_candidate_runs',
    'strytree_branch_candidates',
    'strytree_candidate_merge_plans',
    'strytree_audit_events',
  ]
  for (const table of requiredTables) {
    if (!sql.includes(`create table if not exists ${table}`)) {
      throw new Error(`expected Strytree D1 migration to define ${table}`)
    }
  }
  const requiredFragments = [
    'parent_node_id text',
    'foreign key (parent_node_id) references strytree_nodes(id)',
    'ledger_event_id text not null',
    'event_type text not null',
    'idempotency_key text not null unique',
    'unique (user_id, node_id)',
    'balance_after_credits integer not null',
    'provider_session_id text',
    'create unique index if not exists idx_strytree_payment_sessions_provider',
    'debit_ledger_event_id text',
    'refund_ledger_event_id text',
    'check (max_candidates >= 1 and max_candidates <= 3)',
    'continuity_score real not null default 0',
    'publish_eligible integer not null default 0',
    'selected_candidate_id text not null',
    'foreign key (selected_candidate_id) references strytree_branch_candidates(id)',
    'create index if not exists idx_strytree_nodes_story_parent',
    'create index if not exists idx_strytree_token_ledger_user_created',
    'create unique index if not exists idx_strytree_token_ledger_provider_event',
    'create index if not exists idx_strytree_candidate_runs_user_parent',
    'create index if not exists idx_strytree_branch_candidates_run',
  ]
  for (const fragment of requiredFragments) {
    if (!sql.includes(fragment)) {
      throw new Error(`expected Strytree D1 migration to include ${fragment}`)
    }
  }
}

export function testStrytreePaymentWorkerDeclaresCloudflareRuntimeBindings() {
  const wrangler = readRepoFile('cloudflare', 'workers', 'agentic-graph-payment', 'wrangler.toml')
  const requiredWranglerFragments = [
    '[vars]',
    'STRYTREE_EXTERNAL_VIDEO_PROVIDER_BASE_URL = "https://api.external-video-provider.invalid"',
    'STRYTREE_EXTERNAL_VIDEO_PROVIDER_MAX_POLLS = "60"',
    'STRYTREE_EXTERNAL_VIDEO_PROVIDER_POLL_INTERVAL_MS = "1500"',
    'STRYTREE_DAILY_PROVIDER_BUDGET_CENTS = "0"',
    'pattern = "airvio.co/api/strytree*"',
    '[[d1_databases]]',
    'migrations_dir = "../../d1/migrations"',
    '[[queues.producers]]',
    'binding = "STRYTREE_GENERATION_QUEUE"',
    '[[queues.consumers]]',
    'max_batch_size = 3',
    '[[kv_namespaces]]',
    'binding = "STRYTREE_PROVIDER_BUDGET_KV"',
    '[[r2_buckets]]',
    'binding = "STRYTREE_MEDIA_BUCKET"',
    '[[durable_objects.bindings]]',
    'name = "STRYTREE_CREDIT_LEDGER"',
    'class_name = "StrytreeCreditLedgerActor"',
    '[[migrations]]',
    'new_sqlite_classes = [ "StrytreeCreditLedgerActor" ]',
  ]
  for (const fragment of requiredWranglerFragments) {
    if (!wrangler.includes(fragment)) {
      throw new Error(`expected Strytree Cloudflare binding config to include ${fragment}`)
    }
  }
  const worker = createAgenticGraphPaymentWorker()
  if (typeof StrytreeCreditLedgerActor !== 'function' || typeof worker.fetch !== 'function' || typeof worker.queue !== 'function') {
    throw new Error('expected the configured payment Worker to export its ledger actor and fetch/queue entrypoints')
  }
  const producer = [...wrangler.matchAll(/\[\[queues\.producers\]\]([\s\S]*?)(?=\n\[\[|$)/g)]
    .map(match => match[1]).find(block => block.includes('binding = "STRYTREE_GENERATION_QUEUE"'))
  const queue = producer?.match(/^queue\s*=\s*"([^"]+)"/m)?.[1]
  const consumers = [...wrangler.matchAll(/\[\[queues\.consumers\]\]([\s\S]*?)(?=\n\[\[|$)/g)]
  if (!queue || !consumers.some(match => match[1].match(/^queue\s*=\s*"([^"]+)"/m)?.[1] === queue)) {
    throw new Error('expected the generation producer and consumer to share one configured queue')
  }

}
