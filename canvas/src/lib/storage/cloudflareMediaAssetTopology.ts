import {
  AGENTICGRAPH_STORAGE_CANVAS_ROOM_BINDING_NAME,
  AGENTICGRAPH_STORAGE_D1_BINDING_NAME,
  AGENTICGRAPH_STORAGE_MEDIA_ACCESS_KV_BINDING_NAME,
  AGENTICGRAPH_STORAGE_R2_MEDIA_BINDING_NAME,
  buildAgenticGraphStorageMediaAssetPersistPath,
  buildAgenticGraphStorageMediaPath,
} from './agenticgraphStorageSyncContract'

export type CloudflareMediaAssetServiceId = 'r2' | 'd1' | 'kv' | 'durableObject'

export type CloudflareMediaAssetService = {
  id: CloudflareMediaAssetServiceId
  label: string
  bindingName: string
  owner: string
  contract: string
  behavior: string
  docsUrl: string
}

export const CLOUDFLARE_MEDIA_ASSET_SYNC_SERVICES: readonly CloudflareMediaAssetService[] = [
  {
    id: 'r2',
    label: 'R2',
    bindingName: AGENTICGRAPH_STORAGE_R2_MEDIA_BINDING_NAME,
    owner: 'Binary blobs',
    contract: buildAgenticGraphStorageMediaPath('airvio/runs/{runId}/{stageId}/{shotId}.{ext}'),
    behavior: 'Workers API object head/get/put/delete surface for generated image, audio, and video blobs.',
    docsUrl: 'https://developers.cloudflare.com/r2/api/workers/workers-api-reference/',
  },
  {
    id: 'd1',
    label: 'D1',
    bindingName: AGENTICGRAPH_STORAGE_D1_BINDING_NAME,
    owner: 'Metadata + provenance',
    contract: buildAgenticGraphStorageMediaAssetPersistPath(),
    behavior: 'Worker binding prepared statements own media_artifacts metadata and provenance upserts.',
    docsUrl: 'https://developers.cloudflare.com/d1/worker-api/',
  },
  {
    id: 'kv',
    label: 'KV',
    bindingName: AGENTICGRAPH_STORAGE_MEDIA_ACCESS_KV_BINDING_NAME,
    owner: 'Access URL cache',
    contract: 'media-access:{workspaceId}:{artifactId}:{contentHash}',
    behavior: 'Short-lived access-cache entries use KV expirationTtl; missing binding is explicit, not faked.',
    docsUrl: 'https://developers.cloudflare.com/kv/api/write-key-value-pairs/',
  },
  {
    id: 'durableObject',
    label: 'Durable Object',
    bindingName: AGENTICGRAPH_STORAGE_CANVAS_ROOM_BINDING_NAME,
    owner: 'Canvas sync room',
    contract: 'asset-sync:{workspaceId}:{roomId}',
    behavior: 'Durable Object room state records latest media notifications for WebSocket-ready collaboration sync.',
    docsUrl: 'https://developers.cloudflare.com/durable-objects/best-practices/websockets/',
  },
] as const
