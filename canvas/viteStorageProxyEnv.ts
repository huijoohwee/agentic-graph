const normalizeString = (value: unknown): string => String(value || '').trim()

export const resolveAgenticGraphStorageDevProxyTarget = (args: {
  processEnv: Record<string, string | undefined>
  fileEnv: Record<string, string | undefined>
}): string => normalizeString(
  args.processEnv.AGENTICGRAPH_STORAGE_DEV_PROXY_TARGET
    || args.fileEnv.AGENTICGRAPH_STORAGE_DEV_PROXY_TARGET
    || 'https://airvio.co',
).replace(/\/+$/, '') || 'https://airvio.co'
