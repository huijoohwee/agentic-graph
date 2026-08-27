import { useGraphStore } from '@/hooks/useGraphStore';
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader';
import { normalizeMermaidMmdToMarkdown } from 'grph-shared/markdown/mermaidInput';
import { parseSchemaText } from '@/features/schema/io';
import { emitGraphTraversalFloatingPanelOpen } from '@/features/panels/utils/graphTraversalFloatingPanel'
import { openSchemaConfigWorkspaceFile } from '@/features/panels/utils/schemaWorkspaceFiles'
import {
  CODEBASE_INDEX_PIPELINE_GRAPH_REL_PATH,
  CODEBASE_INDEX_PIPELINE_SCHEMA_REL_PATH,
  CODEBASE_INDEX_PIPELINE_ORCHESTRATOR_REL_PATH,
  PIPELINE_COMMAND_FALLBACK_STATUS_TEXT,
  PIPELINE_COMMAND_LOADED_STATUS_TEXT,
  PIPELINE_COMMAND_RUNNING_STATUS_TEXT,
  UI_COPY,
} from '@/lib/config';
import { importGraphRagWorkflowFromText } from '@/features/panels/hooks/workflowJsonLdActions';

type MarkdownPipelineRunnerWindow = Window & {
  agenticgraphRunMarkdownPipeline?: () => Promise<void> | void;
};

function initMarkdownPipelineRunnerDevHook(): void {
  if (typeof window === 'undefined') return;
  if (typeof import.meta === 'undefined') return;
  const meta = import.meta as unknown as { env?: Record<string, unknown> };
  const env = meta.env;
  const isDev = !!(env && (env.DEV as unknown));
  if (!isDev) return;
  const anyWindow = window as unknown as MarkdownPipelineRunnerWindow;
  if (typeof anyWindow.agenticgraphRunMarkdownPipeline === 'function') return;
  anyWindow.agenticgraphRunMarkdownPipeline = async () => {
    try {
      const res = await fetch('/__run_markdown_pipeline', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      await res.text();
    } catch {
      void 0;
    }
  };
}

initMarkdownPipelineRunnerDevHook();

export function getCodebaseRootFromEnv(): string {
  if (typeof import.meta === 'undefined') return '';
  const meta = import.meta as unknown as { env?: Record<string, unknown> };
  const env = meta.env;
  const raw = env && env.VITE_CODEBASE_ROOT;
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  return trimmed;
}

function coerceSafeRepoRelPath(raw: string): string | null {
  const normalized = String(raw || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  if (!normalized) return null
  if (normalized.startsWith('..')) return null
  if (normalized.includes('\u0000')) return null
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return null
  for (const part of parts) {
    if (part === '..') return null
  }
  return parts.join('/')
}

export function buildCodebaseTextUrlForRelPath(relPath: string): string | null {
  const rel = coerceSafeRepoRelPath(relPath)
  if (!rel) return null
  return `/__codebase_file?path=${encodeURIComponent(rel)}`
}

export function buildCodebaseAssetUrlForRelPath(relPath: string): string | null {
  const rel = coerceSafeRepoRelPath(relPath)
  if (!rel) return null
  return `/__codebase_asset?path=${encodeURIComponent(rel)}`
}

export function buildFsUrlForRelPath(relPath: string): string | null {
  const rel = typeof relPath === 'string' ? relPath.trim() : '';
  if (!rel) return null;
  const rootRaw = getCodebaseRootFromEnv();
  const root = rootRaw.trim();
  const rootTrimmed = root.replace(/\/+$/, '');
  const cleanRel = rel.replace(/^\/+/, '');
  const abs = rootTrimmed ? `${rootTrimmed}/${cleanRel}` : `/${cleanRel}`;
  const absNormalized = abs.startsWith('/') ? abs : `/${abs}`;
  return `/@fs${absNormalized}`;
}

async function maybeRunMarkdownPipeline(): Promise<void> {
  if (typeof window === 'undefined') return;
  const anyWindow = window as unknown as MarkdownPipelineRunnerWindow;
  const fn = anyWindow.agenticgraphRunMarkdownPipeline;
  if (typeof fn !== 'function') return;
  try {
    const result = fn();
    if (result && typeof (result as Promise<void>).then === 'function') {
      await result;
    }
  } catch {
    void 0;
  }
}

async function fetchTextFromRelPath(relPath: string): Promise<string> {
  const cleanRel = typeof relPath === 'string' ? relPath.trim().replace(/^\/+/, '') : '';
  if (!cleanRel) throw new Error(UI_COPY.missingPathError);

  try {
    const url = buildCodebaseTextUrlForRelPath(cleanRel);
    if (!url) throw new Error(UI_COPY.missingPathError);
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      if (!text.trim()) throw new Error(UI_COPY.emptyResponseError);
      return text;
    }
  } catch {
    void 0;
  }

  const fsUrl = buildFsUrlForRelPath(cleanRel);
  if (!fsUrl) throw new Error(UI_COPY.missingPathError);
  const fsRes = await fetch(fsUrl);
  if (!fsRes.ok) throw new Error(UI_COPY.requestFailedStatus(fsRes.status));
  const fsText = await fsRes.text();
  if (!fsText.trim()) throw new Error(UI_COPY.emptyResponseError);
  return fsText;
}

export async function runMarkdownPipelineAndLoadArtifacts(): Promise<boolean> {
  try {
    await maybeRunMarkdownPipeline();
  } catch {
    void 0;
  }
  try {
    const [graphText, schemaText, orchText] = await Promise.all([
      fetchTextFromRelPath(CODEBASE_INDEX_PIPELINE_GRAPH_REL_PATH),
      fetchTextFromRelPath(CODEBASE_INDEX_PIPELINE_SCHEMA_REL_PATH),
      fetchTextFromRelPath(CODEBASE_INDEX_PIPELINE_ORCHESTRATOR_REL_PATH),
    ]);

    await loadGraphDataFromTextViaParser(CODEBASE_INDEX_PIPELINE_GRAPH_REL_PATH, graphText);

    try {
      const name = CODEBASE_INDEX_PIPELINE_GRAPH_REL_PATH;
      const normalizedText = normalizeMermaidMmdToMarkdown(name, graphText);
      if (normalizedText.trim()) {
        const store = useGraphStore.getState();
        try {
          void store.setActiveMarkdownDocument({
            name,
            text: normalizedText,
            normalizeMermaidMmd: false,
            sourceUrl: null,
            jsonSourceText: null,
          });
        } catch {
          void 0;
        }
      }
    } catch {
      void 0;
    }

    try {
      const schema = parseSchemaText(schemaText);
      const store = useGraphStore.getState();
      try {
        store.clearSchemaLintSummary();
      } catch {
        void 0;
      }
      try {
        store.setSchema(schema);
      } catch {
        void 0;
      }
      try {
        store.setSchemaImportLabel(CODEBASE_INDEX_PIPELINE_SCHEMA_REL_PATH);
      } catch {
        void 0;
      }
      try {
        store.setSchemaLastExportSnapshot(null);
      } catch {
        void 0;
      }
      try {
        store.setSchemaOpStatus(true, `Import OK: ${CODEBASE_INDEX_PIPELINE_SCHEMA_REL_PATH}`);
      } catch {
        void 0;
      }
    } catch {
      void 0;
    }

    try {
      importGraphRagWorkflowFromText(
        {
          markExported: () => void 0,
          setTransientExportStatus: () => void 0,
        },
        CODEBASE_INDEX_PIPELINE_ORCHESTRATOR_REL_PATH,
        orchText,
      );
    } catch {
      void 0;
    }

    try {
      useGraphStore.getState().setWorkspaceViewMode('canvas')
    } catch {
      void 0;
    }
    try {
      openSchemaConfigWorkspaceFile()
    } catch {
      void 0;
    }
    try {
      emitGraphTraversalFloatingPanelOpen()
    } catch {
      void 0;
    }

    return true;
  } catch {
    return false;
  }
}

export async function runMarkdownPipelineWithStatus(
  setStatus: (status: string | null) => void,
): Promise<void> {
  try {
    setStatus(PIPELINE_COMMAND_RUNNING_STATUS_TEXT);
  } catch {
    void 0;
  }
  let ok = false;
  try {
    ok = await runMarkdownPipelineAndLoadArtifacts();
  } catch {
    ok = false;
  }
  try {
    setStatus(ok ? PIPELINE_COMMAND_LOADED_STATUS_TEXT : PIPELINE_COMMAND_FALLBACK_STATUS_TEXT);
  } catch {
    void 0;
  }
}
