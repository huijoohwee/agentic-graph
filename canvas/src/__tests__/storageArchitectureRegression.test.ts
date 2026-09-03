import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testRootPackageDeclaresDrizzleForAgenticGraphStorageWorker() {
  const packagePath = resolve(process.cwd(), '..', 'package.json')
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as {
    dependencies?: Record<string, string>
    scripts?: Record<string, string>
  }
  if (!packageJson.dependencies?.['drizzle-orm']) {
    throw new Error('expected agentic-graph root package to declare drizzle-orm for the D1 storage worker')
  }
  if (!packageJson.scripts?.['storage:d1:migrate:remote']?.includes('wrangler d1 migrations apply')) {
    throw new Error('expected agentic-graph root package to declare Wrangler-driven D1 migration ownership')
  }
}

export function testCloudflareDeployScriptsSeedDocsMirrorIntoD1() {
  const packagePath = resolve(process.cwd(), '..', 'package.json')
  const seedScriptPath = resolve(process.cwd(), '..', 'scripts', 'seed-storage-docs-to-cloudflare.mjs')
  const seedSqlPath = resolve(process.cwd(), '..', 'scripts', 'lib', 'seed-storage-documents-d1.mjs')
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as {
    scripts?: Record<string, string>
  }
  const seedScriptText = readFileSync(seedScriptPath, 'utf8')
  const seedSqlText = readFileSync(seedSqlPath, 'utf8')
  const scripts = packageJson.scripts || {}
  if (!scripts['storage:d1:seed:docs']?.includes('seed-storage-docs-to-cloudflare.mjs')) {
    throw new Error('expected storage:d1:seed:docs to own docs mirror seeding into D1')
  }
  if (!scripts['pages:deploy-cloudflare']?.includes('npm run storage:d1:seed:docs')) {
    throw new Error('expected pages:deploy-cloudflare to seed D1 after the static Pages upload')
  }
  if (!scripts['storage:deploy']?.includes('npm run storage:d1:seed:docs')) {
    throw new Error('expected storage:deploy to seed D1 after migrations and storage Worker deploy')
  }
  if (scripts['workers:deploy'] !== 'npm run storage:deploy && npm run payment:worker:deploy') {
    throw new Error('expected workers:deploy to reuse storage:deploy so D1 migrations, Worker deploy, and docs seeding stay together')
  }
  if (!seedScriptText.includes('buildReconciliationMutations')
    || !seedScriptText.includes('stale-source-files=')
    || !seedScriptText.includes('Source Files mismatch after seed')) {
    throw new Error('expected D1 docs seeding to reconcile stale Source Files instead of leaving an append-only Cloudflare cache')
  }
  if (!seedScriptText.includes("process.env.AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT")
    || !seedScriptText.includes("DEFAULT_CANONICAL_DOCS_ROOT = 'agentic-canvas-os/docs'")) {
    throw new Error('expected D1 docs seeding to project the release-resolved Agentic Canvas OS docs source into canonical storage paths')
  }
  if (!seedSqlText.includes('ON CONFLICT(workspace_id, canonical_path) DO UPDATE SET')
    || !seedSqlText.includes('AND document_id = (${documentIdentitySql});')) {
    throw new Error('expected direct D1 seeding to preserve canonical-path ownership and attach chunks to the resolved document identity')
  }
}

export function testStorageSyncDocumentDeclaresTieredSourceAuthorityContract() {
  const storageDocPath = resolve(process.cwd(), '..', 'docs', 'documents', 'agentic-graph-storage-sync-document.md')
  const companionPath = resolve(process.cwd(), '..', 'docs', 'documents', 'agentic-graph-storage-sync-document.companion.md')
  const storageDocText = readFileSync(storageDocPath, 'utf8')
  const companionText = readFileSync(companionPath, 'utf8')
  const requiredStorageDocFragments = [
    'Authored Markdown remains canonical.',
    'Browser records, shared D1 rows, R2',
    'objects, collaboration rooms, and generated mirrors are supporting stores with explicit roles.',
    'exactly one room provider owns updates and recovery',
    'no dual-write between room providers',
    '| Working store | Store | IndexedDB/Dexie or explicit memory adapter',
    'memory fallback is not called durable',
    'Route identity source',
    'does not deploy storage Worker',
    'local_rung: "spec-complete"',
    'delivered_rung: "undocumented"',
  ]
  for (const fragment of requiredStorageDocFragments) {
    if (!storageDocText.includes(fragment)) {
      throw new Error(`expected storage sync document to declare tiered source-authority fragment: ${fragment}`)
    }
  }
  if (storageDocText.includes('D1 becomes SSOT') || storageDocText.includes('flip SSOT to D1') || storageDocText.includes('Yjs doc update event (debounced 5s)')) {
    throw new Error('expected storage sync document to avoid D1-as-SSOT and update-event commit wording for concurrent editing')
  }
  const requiredCompanionFragments = [
    'fallback is visible and not called durable',
    'exactly one active room owner',
    'No Evidence Reference in this document proves a configured shared Worker',
    'The generic blob handler has no auth/entitlement check.',
    'The protected Pages release does not deploy the storage Worker.',
  ]
  for (const fragment of requiredCompanionFragments) {
    if (!companionText.includes(fragment)) {
      throw new Error(`expected storage sync companion to declare current owner/security fragment: ${fragment}`)
    }
  }
  for (const forbidden of [
    'D1 becomes SSOT',
    'flip SSOT to D1',
    'PocketBase + Yjs as the concurrent-editing layer',
    'dual-write PocketBase and Durable Objects',
  ]) {
    if (storageDocText.includes(forbidden) || companionText.includes(forbidden)) {
      throw new Error(`expected consolidated storage docs to avoid legacy authority claim: ${forbidden}`)
    }
  }
}

export function testStorageSyncDocumentDeclaresActualBinaryRouteSecurityContract() {
  const storageDocPath = resolve(process.cwd(), '..', 'docs', 'documents', 'agentic-graph-storage-sync-document.md')
  const companionPath = resolve(process.cwd(), '..', 'docs', 'documents', 'agentic-graph-storage-sync-document.companion.md')
  const binaryContractPath = resolve(process.cwd(), '..', 'docs', 'documents', 'agentic-graph-artifact-media-storage-architecture.md')
  const storageDocText = readFileSync(storageDocPath, 'utf8')
  const companionText = readFileSync(companionPath, 'utf8')
  const binaryContractText = readFileSync(binaryContractPath, 'utf8')
  const requiredStorageDocFragments = [
    'binary_contract: "docs/documents/agentic-graph-artifact-media-storage-architecture.md"',
    'The generic blob handler currently has no auth and permits overwrite at a workspace/path key.',
    'run-media token checks expiry and run id but is not signed.',
    'security/overwrite gaps documented separately',
  ]
  for (const fragment of requiredStorageDocFragments) {
    if (!storageDocText.includes(fragment)) {
      throw new Error(`expected storage sync document to declare generated binary persistence fragment: ${fragment}`)
    }
  }
  const requiredCompanionFragments = [
    'Generic blobs',
    'unauthenticated and overwriteable until hardened',
    'Run media',
    'current base64url token is not a signed entitlement',
    'Blob/media auth gap | delivery boundary closed',
  ]
  for (const fragment of requiredCompanionFragments) {
    if (!companionText.includes(fragment)) {
      throw new Error(`expected storage sync companion to declare generated binary persistence fragment: ${fragment}`)
    }
  }
  for (const fragment of [
    'the generic blob route is workspace/path addressed, unauthenticated in the current handler, and',
    'overwriteable;',
    'currently only base64url JSON and is not a signed entitlement or a Durable Object lookup.',
    'This is the sole declaration site for these three route identities.',
    'The production Pages release does not deploy this Worker.',
  ]) {
    if (!binaryContractText.includes(fragment)) {
      throw new Error(`expected binary storage contract to declare current route truth: ${fragment}`)
    }
  }
}

export function testMainPanelCloudflareMediaAssetSyncUsesSharedRuntimeContract() {
  const contractText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'storage', 'agentic-graph-storage-sync-contract.ts'), 'utf8')
  const routePathsText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'storage', 'agentic-graph-storage-route-paths.ts'), 'utf8')
  const topologyText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'storage', 'cloudflareMediaAssetTopology.ts'), 'utf8')
  const uploadHelperText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'storage', 'uploadedMediaStorage.ts'), 'utf8')
  const commandMenuText = readFileSync(resolve(process.cwd(), 'src', 'features', 'command-menu', 'CommandMenuCatalogPanel.tsx'), 'utf8')
  const helpCloudflareText = readFileSync(resolve(process.cwd(), 'src', 'features', 'panels', 'views', 'HelpCloudflareMediaSection.tsx'), 'utf8')
  const helpSectionsText = readFileSync(resolve(process.cwd(), 'src', 'features', 'panels', 'views', 'HelpSections.tsx'), 'utf8')
  const workerIndexText = readFileSync(resolve(process.cwd(), '..', 'cloudflare', 'workers', 'agentic-graph-storage', 'index.ts'), 'utf8')
  const assetSyncText = readFileSync(resolve(process.cwd(), '..', 'cloudflare', 'workers', 'agentic-graph-storage', 'mediaAssetSync.ts'), 'utf8')
  const mediaAuthText = readFileSync(resolve(process.cwd(), '..', 'cloudflare', 'workers', 'agentic-graph-storage', 'mediaAuth.ts'), 'utf8')
  const mediaCapabilityText = readFileSync(resolve(process.cwd(), '..', 'cloudflare', 'workers', 'agentic-graph-storage', 'storageMediaCapability.ts'), 'utf8')
  const canvasRoomText = readFileSync(resolve(process.cwd(), '..', 'cloudflare', 'workers', 'agentic-graph-storage', 'canvasSyncRoom.ts'), 'utf8')
  const wranglerText = readFileSync(resolve(process.cwd(), '..', 'cloudflare', 'workers', 'agentic-graph-storage', 'wrangler.toml'), 'utf8')
  const requiredContractFragments = [
    "canvasRoomPrefix: '/api/storage/canvas-room/'",
    "mediaAssetPersist: '/api/storage/media/assets'",
    "mediaCapability: '/api/storage/media-capabilities'",
    "mediaPrefix: '/api/storage/media/'",
    'AGENTIC_OS_STORAGE_R2_MEDIA_BINDING_NAME = AGENTIC_OS_STORAGE_R2_BLOB_BINDING_NAME',
    "AGENTIC_OS_STORAGE_R2_MEDIA_OBJECT_PREFIX = 'airvio'",
    "AGENTIC_OS_STORAGE_MEDIA_ACCESS_KV_BINDING_NAME = 'AGENTIC_OS_MEDIA_ACCESS_KV'",
    "AGENTIC_OS_STORAGE_CANVAS_ROOM_BINDING_NAME = 'AGENTIC_OS_CANVAS_ROOM'",
    'AgenticGraphMediaAssetPersistRequest',
    'AgenticGraphMediaAssetPersistResponse',
    'buildAgenticGraphStorageCanvasRoomPath',
  ]
  for (const fragment of requiredContractFragments) {
    if (!contractText.includes(fragment) && !routePathsText.includes(fragment)) {
      throw new Error(`expected shared storage contract to declare Cloudflare media asset fragment: ${fragment}`)
    }
  }
  for (const fragment of [
    'CLOUDFLARE_MEDIA_ASSET_SYNC_SERVICES',
    'buildAgenticGraphStorageMediaAssetPersistPath()',
    "buildAgenticGraphStorageMediaPath('airvio/runs/{runId}/{stageId}/{shotId}.{ext}')",
    "id: 'r2'",
    "id: 'd1'",
    "id: 'kv'",
    "id: 'durableObject'",
    'https://developers.cloudflare.com/r2/api/workers/workers-api-reference/',
    'https://developers.cloudflare.com/d1/worker-api/',
    'https://developers.cloudflare.com/kv/api/write-key-value-pairs/',
    'https://developers.cloudflare.com/durable-objects/best-practices/websockets/',
  ]) {
    if (!topologyText.includes(fragment)) {
      throw new Error(`expected Cloudflare media asset topology to own service fragment: ${fragment}`)
    }
  }
  if (commandMenuText.includes('CLOUDFLARE_MEDIA_ASSET_SYNC_SERVICES')
    || commandMenuText.includes('data-kg-command-menu-cloudflare-media-service')
    || commandMenuText.includes("bindingName: 'AGENTIC_OS_STORAGE_BLOB_BUCKET'")) {
    throw new Error('expected FloatingPanel Media to avoid owning Cloudflare storage configuration rows')
  }
  if (!helpCloudflareText.includes('CLOUDFLARE_MEDIA_ASSET_SYNC_SERVICES')
    || !helpCloudflareText.includes('data-kg-main-panel-cloudflare-media-service')
    || !helpCloudflareText.includes('data-kg-main-panel-cloudflare-binding')
    || !helpSectionsText.includes('<HelpCloudflareMediaSection')) {
    throw new Error('expected MainPanel Help to project the shared Cloudflare media topology without local binding literals')
  }
  for (const fragment of [
    'uploadMediaFileToAgenticGraphStorage',
    'readUploadedMediaKind',
    'AGENTIC_OS_STORAGE_R2_MEDIA_OBJECT_PREFIX',
    '`${AGENTIC_OS_STORAGE_R2_MEDIA_OBJECT_PREFIX}/runs/${runId}/${stageId}/${shotId}.${readFileExtension(args.file)}`',
    'buildAgenticGraphStorageMediaPath(objectKey)',
    'buildAgenticGraphStorageMediaAssetPersistPath()',
    'requestMediaCapability',
    "'x-agentic-graph-media-capability'",
    'presignedUrl: accessUrl',
    "source: 'floatingPanel.media.upload'",
  ]) {
    if (!uploadHelperText.includes(fragment)) {
      throw new Error(`expected New Media upload helper to reuse Cloudflare media runtime fragment: ${fragment}`)
    }
  }
  if (!mediaAuthText.includes("searchParams.get('kg_media_token')")
    || !mediaAuthText.includes('browser-openable, short-lived media links')) {
    throw new Error('expected media auth to accept short-lived query tokens for browser-openable media links')
  }
  for (const fragment of [
    "'HMAC'",
    'agenticGraphWorkspaceId',
    'AGENTIC_OS_STORAGE_MEDIA_CAPABILITY_SCHEMA',
    "operation: MediaOperation",
    "searchParams.get('kg_media_capability')",
  ]) {
    if (!mediaCapabilityText.includes(fragment)) {
      throw new Error(`expected production media capability owner to include ${fragment}`)
    }
  }
  for (const fragment of [
    'handleMediaAssetPersist',
    'isAgenticGraphStorageMediaAssetRoute',
    'upsertMediaArtifact',
    'findMediaArtifactByHash',
    'AGENTIC_OS_STORAGE_BLOB_BUCKET',
    'AGENTIC_OS_MEDIA_ACCESS_KV',
    'AGENTIC_OS_CANVAS_ROOM',
    'presignedUrl',
  ]) {
    if (!assetSyncText.includes(fragment) && !workerIndexText.includes(fragment)) {
      throw new Error(`expected storage Worker to wire Cloudflare media asset runtime fragment: ${fragment}`)
    }
  }
  if (!canvasRoomText.includes('class AgenticGraphCanvasSyncRoom')
    || !canvasRoomText.includes("`asset:${workspaceId}:${roomId}:${artifactId}`")
    || !canvasRoomText.includes('this.state.storage.put(storageKey')
    || !canvasRoomText.includes('this.state.acceptWebSocket')
    || !canvasRoomText.includes("type: 'asset.synced'")
    || !workerIndexText.includes('handleCanvasRoomProxy')
    || !workerIndexText.includes('x-agentic-graph-room-workspace-id')
    || !workerIndexText.includes('canvasRoomPrefix')) {
    throw new Error('expected Durable Object canvas room to proxy authenticated collaboration joins and persist media asset sync notifications')
  }
  if (!wranglerText.includes('AGENTIC_OS_STORAGE_BLOB_BUCKET')
    || !wranglerText.includes('agentic-graph-storage-blobs')
    || wranglerText.includes('AGENTIC_OS_MEDIA_BUCKET')
    || !wranglerText.includes('AGENTIC_OS_CANVAS_ROOM')
    || !wranglerText.includes('AgenticGraphCanvasSyncRoom')) {
    throw new Error('expected agentic-graph-storage wrangler config to bind media bytes to agentic-graph-storage-blobs and the canvas sync Durable Object')
  }
  if (/id\s*=\s*"(operator|fake|placeholder|todo|test)[^"]*"/i.test(wranglerText)) {
    throw new Error('expected wrangler config to avoid fake KV namespace ids for media access cache')
  }
}

export function testBrowserCacheLegacyShimFilesAreRemoved() {
  const storagePath = resolve(process.cwd(), 'src', 'lib', 'storage', 'rxdbStorage.ts')
  const recoveryPath = resolve(process.cwd(), 'src', 'lib', 'storage', 'rxdbRecovery.ts')
  if (existsSync(storagePath)) {
    throw new Error('expected the dead legacy browser-cache shim rxdbStorage.ts to be removed')
  }
  if (existsSync(recoveryPath)) {
    throw new Error('expected the dead legacy browser-cache shim rxdbRecovery.ts to be removed')
  }
}

export function testPaymentSettingsDoNotOwnBrowserServerSecretKeys() {
  const keyText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'config.ls.keys.ts'), 'utf8')
  const ownerText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'config.ls.owners.ts'), 'utf8')
  const registryText = readFileSync(resolve(process.cwd(), 'src', 'features', 'settings', 'registry-payments.ts'), 'utf8')
  const forbiddenBrowserSecretKeys = ['paymentsStripeSecretKey', 'paymentsStripeWebhookSecret']
  for (const key of forbiddenBrowserSecretKeys) {
    if (keyText.includes(key) || ownerText.includes(key) || registryText.includes(key)) {
      throw new Error(`expected Stripe server secret setting ${key} to stay out of browser localStorage ownership`)
    }
  }
  if (registryText.includes('LS_KEYS.paymentsStripeSecretKey') || registryText.includes('LS_KEYS.paymentsStripeWebhookSecret')) {
    throw new Error('expected payment settings registry to avoid browser reads/writes for Stripe server secrets')
  }
  if (!registryText.includes("key: 'payments.stripe.secretKey'") || !registryText.includes("key: 'payments.stripe.webhookSecret'")) {
    throw new Error('expected payment settings registry to keep explicit server-secret rows for operator docs')
  }
  const serverSecretSourceCount = (registryText.match(/source: 'backendEnv'/g) || []).length
  if (serverSecretSourceCount < 2) {
    throw new Error('expected Stripe server secret settings to be labeled as backendEnv-owned')
  }
}

export function testPdfWorkspaceServerUsesCurrentArtifactLayoutOnly() {
  const serverText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'pdf', 'server', 'pdfWorkspaceServer.ts'), 'utf8')
  const forbiddenFragments = [
    "'modes'",
    '"modes"',
    "'text-only'",
    "'image-heavy'",
    "'scan-ocr'",
    'legacyPrefix',
    'legacyAssetsDirAbs',
  ]
  for (const fragment of forbiddenFragments) {
    if (serverText.includes(fragment)) {
      throw new Error(`expected PDF workspace server to avoid stale mode-layout artifact handling: ${fragment}`)
    }
  }
  for (const requiredFragment of ["path.join(docDirAbs, 'output.md')", "path.join(docDirAbs, 'anchor-map.json')", "path.join(docDirAbs, 'assets')"]) {
    if (!serverText.includes(requiredFragment)) {
      throw new Error(`expected PDF workspace server to use current artifact layout fragment: ${requiredFragment}`)
    }
  }
}

export function testAgenticGraphCanonicalStorageOwnerUsesPersistedCollectionStore() {
  const storagePath = resolve(process.cwd(), 'src', 'lib', 'storage', 'agentic-graph-storage-db.ts')
  const storageText = readFileSync(storagePath, 'utf8')
  if (storageText.includes('createRxDatabase') || storageText.includes("from 'rxdb/")) {
    throw new Error('expected agenticGraphStorageDb owner to avoid legacy runtime seams once D1 owns canonical persistence')
  }
  if (!storageText.includes('createPersistedCollectionDb')) {
    throw new Error('expected agenticGraphStorageDb owner to use the minimal persisted collection store')
  }
}

export function testSourceFilesDbUsesPersistedCollectionStore() {
  const storagePath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesDb.ts')
  const storageText = readFileSync(storagePath, 'utf8')
  if (storageText.includes('createRxDatabase') || storageText.includes("from 'rxdb/")) {
    throw new Error('expected sourceFilesDb owner to avoid legacy runtime seams once the cache layer is minimal')
  }
  if (!storageText.includes('createPersistedCollectionDb')) {
    throw new Error('expected sourceFilesDb owner to use the minimal persisted collection store')
  }
}

export function testMarkdownFsCacheUsesPersistedCollectionStore() {
  const storagePath = resolve(process.cwd(), 'src', 'features', 'source-files', 'markdownFsCache.ts')
  const storageText = readFileSync(storagePath, 'utf8')
  if (storageText.includes('createRxDatabase') || storageText.includes("from 'rxdb/")) {
    throw new Error('expected markdownFsCache owner to avoid legacy runtime seams once the cache layer is minimal')
  }
  if (!storageText.includes('createPersistedCollectionDb')) {
    throw new Error('expected markdownFsCache owner to use the minimal persisted collection store')
  }
}

export function testWorkspaceFsCacheOwnerUsesPersistedCollectionStore() {
  const storagePath = resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'workspaceFsPersisted.ts')
  const storageText = readFileSync(storagePath, 'utf8')
  if (storageText.includes('createRxDatabase') || storageText.includes("from 'rxdb/")) {
    throw new Error('expected workspaceFs cache owner to avoid legacy runtime seams once the cache layer is minimal')
  }
  if (!storageText.includes('createPersistedCollectionDb')) {
    throw new Error('expected workspaceFs cache owner to use the minimal persisted collection store')
  }
}

export function testGraphRecordCacheOwnerUsesPersistedCollectionStore() {
  const storagePath = resolve(process.cwd(), 'src', 'lib', 'graph-record-db', 'graphRecordDb.impl.ts')
  const storageText = readFileSync(storagePath, 'utf8')
  if (storageText.includes('createRxDatabase') || storageText.includes("from 'rxdb/")) {
    throw new Error('expected graphRecordDb cache owner to avoid legacy runtime seams once the cache layer is minimal')
  }
  if (!storageText.includes('createPersistedCollectionDb')) {
    throw new Error('expected graphRecordDb cache owner to use the minimal persisted collection store')
  }
}

export function testWorkflowPreviewSourceDocsAvoidRxdbTerminologyForActiveStorageDocs() {
  const docsDir = resolve(process.cwd(), '..', 'docs', 'documents')
  const sourceDocs = [
    'agentic-graph-local-storage-document.md',
    'agentic-graph-codebase-index-document.md',
    'agentic-graph-ui-ux-design-document.md',
    'agentic-graph-pipeline-deep-dive-document.md',
    'agentic-graph-pipeline-document.md',
  ]
  const stalePattern = /\bRxDB\b|\brxdb\b/
  for (const sourceDoc of sourceDocs) {
    const sourcePath = resolve(docsDir, sourceDoc)
    const sourceText = readFileSync(sourcePath, 'utf8')
    if (stalePattern.test(sourceText)) {
      throw new Error(`expected workflow preview source doc ${sourceDoc} to avoid stale RxDB terminology`)
    }
  }
}

export function testDocsUpdateScriptUsesCentralizedWorkflowPreviewOwner() {
  const packagePath = resolve(process.cwd(), '..', 'package.json')
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as {
    scripts?: Record<string, string>
  }
  if (packageJson.scripts?.['docs:update'] !== 'node ./scripts/update-docs.mjs') {
    throw new Error('expected docs:update to be owned by scripts/update-docs.mjs')
  }
  if (packageJson.scripts?.['docs:preview:update'] !== 'node ./scripts/update-docs.mjs --preview-only') {
    throw new Error('expected docs:preview:update to expose the bounded workflow-preview owner')
  }

  const ownerPath = resolve(process.cwd(), '..', 'scripts', 'update-docs.mjs')
  const ownerText = readFileSync(ownerPath, 'utf8')
  if (!ownerText.includes("const workflowPreviewOutputDir = 'data/outputs/agentic-graph-workflow-preview'")) {
    throw new Error('expected docs update owner to emit workflow preview artifacts under ignored data/outputs')
  }
  if (ownerText.includes("const workflowPreviewOutputDir = 'data/agentic-graph-workflow-preview'")) {
    throw new Error('expected docs update owner to avoid the tracked workflow preview output root')
  }
  const requiredDocuments = [
    'docs/documents/agentic-graph-pipeline-document.md',
    'docs/documents/agentic-graph-pipeline-deep-dive-document.md',
    'docs/documents/agentic-graph-ui-ux-design-document.md',
    'docs/documents/agentic-graph-codebase-index-document.md',
    'docs/documents/agentic-graph-local-storage-document.md',
  ]
  for (const requiredDocument of requiredDocuments) {
    if (!ownerText.includes(requiredDocument)) {
      throw new Error(`expected docs update owner to include ${requiredDocument}`)
    }
  }
}

export function testCanvasBuildUsesWorkflowPreviewDocsOwner() {
  const packagePath = resolve(process.cwd(), 'package.json')
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as {
    scripts?: Record<string, string>
  }
  const prebuild = packageJson.scripts?.prebuild
  if (!prebuild) {
    throw new Error('expected canvas package to declare a prebuild owner')
  }
  if (!prebuild.includes('npm --prefix .. run docs:preview:update')) {
    throw new Error('expected canvas prebuild to use the bounded workflow-preview docs owner')
  }
  if (prebuild.includes('npm --prefix .. run docs:update')) {
    throw new Error('expected canvas prebuild to avoid the wider docs:update owner')
  }
  if (!prebuild.includes('tsx src/cli/lint-doc.ts')) {
    throw new Error('expected canvas prebuild to keep document linting after preview generation')
  }
}

export function testCanvasStrictPortDevBuildsLinkedPackagesBeforeVite() {
  const packagePath = resolve(process.cwd(), 'package.json')
  const rootPackagePath = resolve(process.cwd(), '..', 'package.json')
  const viteConfigPath = resolve(process.cwd(), 'vite.config.ts')
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as {
    scripts?: Record<string, string>
  }
  const rootPackageJson = JSON.parse(readFileSync(rootPackagePath, 'utf8')) as {
    scripts?: Record<string, string>
    workspaces?: string[]
  }
  const viteConfigText = readFileSync(viteConfigPath, 'utf8')
  const scripts = packageJson.scripts || {}
  const rootScripts = rootPackageJson.scripts || {}
  for (const workspace of ['canvas', 'grph-shared', 'gympgrph', 'mcp']) {
    if (!rootPackageJson.workspaces?.includes(workspace)) {
      throw new Error(`expected root npm workspaces to include ${workspace}`)
    }
  }
  const prepareLinkedPackages = scripts['prepare:linked-packages'] || ''
  if (prepareLinkedPackages.includes('npm install') || prepareLinkedPackages.includes('--prefix ../grph-shared install') || prepareLinkedPackages.includes('--prefix ../gympgrph install')) {
    throw new Error('expected linked package preparation to avoid child package installs once root npm workspaces own installation')
  }
  if (prepareLinkedPackages !== 'npm run build:grph-shared && npm run build:gympgrph') {
    throw new Error('expected linked package preparation to build grph-shared before gympgrph')
  }
  if (scripts['build:grph-shared'] !== 'npm --prefix .. run build --workspace=grph-shared') {
    throw new Error('expected grph-shared build to run through the root workspace')
  }
  if (scripts['build:gympgrph'] !== 'npm --prefix .. run build --workspace=gympgrph') {
    throw new Error('expected gympgrph build to run through the root workspace')
  }
  for (const childLockfile of ['package-lock.json', '../gympgrph/package-lock.json', '../grph-shared/package-lock.json']) {
    if (existsSync(resolve(process.cwd(), childLockfile))) {
      throw new Error(`expected root package-lock.json to be the only npm lockfile, found ${childLockfile}`)
    }
  }
  if (rootScripts.setup !== 'npm install') {
    throw new Error('expected root setup to own npm workspace installation')
  }
  if (rootScripts.postinstall !== 'npm run hooks:install') {
    throw new Error('expected root postinstall to avoid nested npm installs')
  }
  if (rootScripts.dev !== 'npm run dev --workspace=@agentic-graph/canvas --') {
    throw new Error('expected root dev script to delegate through the canvas workspace')
  }
  if (!scripts.predev?.includes('npm run prepare:linked-packages')) {
    throw new Error('expected predev to own linked package preparation for every dev server entry')
  }
  if (
    !viteConfigText.includes("command === 'serve' ? '../grph-shared/src' : '../grph-shared/dist'") ||
    !viteConfigText.includes("const grphSharedAliasSuffix = command === 'serve' ? '' : '.js'") ||
    !viteConfigText.includes('replacement: path.resolve(grphSharedAliasRoot, `$1${grphSharedAliasSuffix}`)')
  ) {
    throw new Error('expected Vite serve aliases to resolve grph-shared client modules from source instead of generated dist')
  }
  if (scripts['predev:5173'] !== 'npm run predev') {
    throw new Error('expected dev:5173 lifecycle to reuse predev before starting the strict-port Vite server')
  }
  if (scripts['dev:5173'] !== 'vite --configLoader runner --port 5173 --strictPort') {
    throw new Error('expected dev:5173 to stay scoped to the strict-port Vite command')
  }
}

export function testCanvasDevUsesSingleLoopbackPortOwner() {
  const viteConfigText = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')
  if (!viteConfigText.includes("host: '127.0.0.1'") || !viteConfigText.includes('strictPort: true')) {
    throw new Error('expected normal Vite startup to own one strict IPv4 loopback port and reject competing localhost servers')
  }
}
