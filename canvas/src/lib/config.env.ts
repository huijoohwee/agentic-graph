import { readEnvString as readSharedEnvString } from 'grph-shared/config/env'

export * from 'grph-shared/config/env'

export function readEnvStringFromRecord(
  env: Record<string, unknown> | undefined,
  key: string,
): string | null {
  if (!env) return null
  const raw = env[key]
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function readEnvString(key: string, defaultValue: string): string {
  const metaEnv = (() => {
    if (typeof import.meta === 'undefined') return undefined
    try {
      return {
        VITE_IFRAME_ALLOWED_HOSTS: import.meta.env.VITE_IFRAME_ALLOWED_HOSTS,
        VITE_MARKDOWN_PIPELINE_BASENAME: import.meta.env.VITE_MARKDOWN_PIPELINE_BASENAME,
        VITE_MARKDOWN_PIPELINE_INPUT_REL_PATH: import.meta.env.VITE_MARKDOWN_PIPELINE_INPUT_REL_PATH,
        VITE_MARKDOWN_PIPELINE_OUTPUT_DIR: import.meta.env.VITE_MARKDOWN_PIPELINE_OUTPUT_DIR,
        VITE_KNOWGRPH_STORAGE_BASE_URL: import.meta.env.VITE_KNOWGRPH_STORAGE_BASE_URL,
        VITE_KNOWGRPH_AGENT_READY_BASE_URL: import.meta.env.VITE_KNOWGRPH_AGENT_READY_BASE_URL,
        VITE_KNOWGRPH_STORAGE_WORKSPACE_ID: import.meta.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID,
        VITE_KNOWGRPH_STORAGE_RUNTIME_SYNC_ENABLED: import.meta.env.VITE_KNOWGRPH_STORAGE_RUNTIME_SYNC_ENABLED,
        VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN: import.meta.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN,
        VITE_KNOWGRPH_RUN_READY_DEMO: import.meta.env.VITE_KNOWGRPH_RUN_READY_DEMO,
        VITE_KNOWGRPH_RUN_READY_REPO_LOCAL: import.meta.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL,
        VITE_KNOWGRPH_WORKSPACE_SEEDS_ABS_ROOT: import.meta.env.VITE_KNOWGRPH_WORKSPACE_SEEDS_ABS_ROOT,
        VITE_KNOWGRPH_GITHUB_WRITE_BASE_URL: import.meta.env.VITE_KNOWGRPH_GITHUB_WRITE_BASE_URL,
        VITE_KNOWGRPH_GITHUB_WRITE_ENABLED: import.meta.env.VITE_KNOWGRPH_GITHUB_WRITE_ENABLED,
        VITE_KNOWGRPH_VIDEO_AGENT_VALIDATION_DOC_PATH: import.meta.env.VITE_KNOWGRPH_VIDEO_AGENT_VALIDATION_DOC_PATH,
        VITE_KNOWGRPH_VIDEO_AGENT_VALIDATION_URLS: import.meta.env.VITE_KNOWGRPH_VIDEO_AGENT_VALIDATION_URLS,
        VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH: import.meta.env.VITE_TEST_VALIDATION_SOURCE_FILE_REL_PATH,
        VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: import.meta.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT,
        VITE_WORKSPACE_INITIALIZATION_DOCS_ROOT_REL_PATH: import.meta.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ROOT_REL_PATH,
        VITE_WORKSPACE_IMPORT_IMAGE_URL_TEST: import.meta.env.VITE_WORKSPACE_IMPORT_IMAGE_URL_TEST,
        VITE_WORKSPACE_IMPORT_URL_TEST: import.meta.env.VITE_WORKSPACE_IMPORT_URL_TEST,
        VITE_WORKSPACE_SEED_SYNC_ENABLED: import.meta.env.VITE_WORKSPACE_SEED_SYNC_ENABLED,
        VITE_WORKSPACE_SEED_SYNC_POLL_MS: import.meta.env.VITE_WORKSPACE_SEED_SYNC_POLL_MS,
        VITE_VIDEO_DOWNLOAD_ENDPOINT: import.meta.env.VITE_VIDEO_DOWNLOAD_ENDPOINT,
      } satisfies Record<string, unknown>
    } catch {
      return undefined
    }
  })()
  const browserValue = readEnvStringFromRecord(metaEnv, key)
  if (browserValue) return browserValue
  return readSharedEnvString(key, defaultValue)
}
