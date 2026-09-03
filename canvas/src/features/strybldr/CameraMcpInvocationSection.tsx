import React from 'react'
import { Eye, SlidersHorizontal, SquareTerminal, type LucideIcon } from 'lucide-react'
import { renderAgenticOsInvocationKeywordChip } from '@/features/agentic-os/agenticOsInvocationChips'
import {
  getAgenticOsDictionaryInvocations,
  type AgenticOsDictionaryInvocation,
  type AgenticOsDictionaryInvocationKind,
} from '@/features/agentic-os/agenticOsDocInvocations'
import { useAgenticOsRemoteGrammarCatalog } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import {
  FLOATING_PANEL_CATALOG_THREE_ROW_LAYOUT,
  floatingPanelCatalogThreeRowClassName,
  floatingPanelCatalogThreeRowThumbnailFrameClassName,
} from '@/lib/ui/floatingPanelCatalogLayout'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { UI_INLINE_CHIP_GROUP_CLASSNAME } from '@/lib/ui/textLayout'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  CAMERA_INVOCATION_BINDINGS,
  CAMERA_INVOCATION_COMMANDS,
  CAMERA_INVOCATION_SEMANTICS,
} from './cameraMcpContract.mjs'
import { inspectLocalCamera } from './cameraMcpRuntime'

const CAMERA_GRAMMAR_SIGILS = ['/', '#', '@'] as const
const CAMERA_TOKEN_LIMIT = 12
const cameraContractTokens = (contract: object): readonly string[] => (
  Object.values(contract).filter((token): token is string => typeof token === 'string')
)
export const CAMERA_REQUIRED_METADATA_TOKENS: readonly Readonly<{
  kind: AgenticOsDictionaryInvocationKind
  token: string
}>[] = Object.freeze([
  ...cameraContractTokens(CAMERA_INVOCATION_COMMANDS).map(token => ({ kind: 'command' as const, token })),
  ...cameraContractTokens(CAMERA_INVOCATION_SEMANTICS).map(token => ({ kind: 'semantic' as const, token })),
  ...cameraContractTokens(CAMERA_INVOCATION_BINDINGS).map(token => ({ kind: 'binding' as const, token })),
])

type CameraCatalogCardProps = {
  Icon: LucideIcon
  title: string
  description: string
  metadata: string
  footer: React.ReactNode
  dataAttributes?: Record<`data-${string}`, string | undefined>
}

const cameraCatalogEntryText = (entry: AgenticOsDictionaryInvocation): string => [
  entry.token,
  entry.label,
  entry.summary,
  ...(entry.keywords || []),
].join(' ').toLowerCase()

const cameraCatalogEntrySigilOrder = (entry: AgenticOsDictionaryInvocation): number => {
  const index = CAMERA_GRAMMAR_SIGILS.indexOf(entry.token[0] as (typeof CAMERA_GRAMMAR_SIGILS)[number])
  return index < 0 ? CAMERA_GRAMMAR_SIGILS.length : index
}

function CameraCatalogCard({
  Icon,
  title,
  description,
  metadata,
  footer,
  dataAttributes,
}: CameraCatalogCardProps) {
  const invocationTitle = /^[#/@]/.test(title)
  return (
    <article
      className={floatingPanelCatalogThreeRowClassName('cursor-default')}
      data-kg-camera-card-layout={FLOATING_PANEL_CATALOG_THREE_ROW_LAYOUT}
      {...dataAttributes}
    >
      <span
        className={floatingPanelCatalogThreeRowThumbnailFrameClassName('items-center justify-center')}
        role="img"
        aria-label={`${title} Camera runtime card`}
      >
        <Icon className={cn('size-7', UI_THEME_TOKENS.text.tertiary)} strokeWidth={1.6} aria-hidden />
      </span>
      <section className="grid min-w-0 grid-rows-[auto_auto_auto] gap-1" aria-label={`${title} Camera runtime summary`}>
        <header className="flex min-w-0 items-center justify-between gap-2" data-kg-floating-panel-card-row="title">
          <h4
            className={cn(invocationTitle ? UI_INLINE_CHIP_GROUP_CLASSNAME : 'truncate', 'text-xs font-semibold')}
            title={title}
            data-kg-camera-invocation-chip-renderer={invocationTitle ? 'shared-markdown-sigil' : undefined}
          >
            {renderMarkdownSigilInlineText(title, {
              renderKeywordChip: ({ value, className }) => renderAgenticOsInvocationKeywordChip({ value, className, sourceLink: false }),
            })}
          </h4>
        </header>
        <section className="grid min-w-0 gap-0.5" data-kg-floating-panel-card-row="meta">
          <p className={cn('m-0 line-clamp-2 text-[11px]', UI_THEME_TOKENS.text.secondary)} title={description}>{description}</p>
          <p className={cn('m-0 truncate text-[10px] uppercase tracking-wide', UI_THEME_TOKENS.text.tertiary)} title={metadata}>{metadata}</p>
        </section>
        <footer className="flex min-w-0 items-center gap-1 overflow-hidden" data-kg-floating-panel-card-row="description">{footer}</footer>
      </section>
    </article>
  )
}

function CameraInvocationTokenCard({ entry }: { entry: AgenticOsDictionaryInvocation }) {
  const source = entry.sourcePath || 'Native agentic-graph invocation catalog'
  const kind = String(entry.kind || 'invocation').trim() || 'invocation'
  return (
    <CameraCatalogCard
      Icon={SquareTerminal}
      title={entry.token}
      description={entry.summary || entry.label || 'Canonical Camera invocation token.'}
      metadata={`${kind} · ${entry.label || 'Camera'}`}
      footer={<code className={cn('block min-w-0 truncate text-[9px]', UI_THEME_TOKENS.text.tertiary)} title={source}>{source}</code>}
      dataAttributes={{
        'data-kg-camera-invocation-token': entry.token,
        'data-kg-camera-invocation-kind': kind,
        'data-kg-camera-invocation-source': source,
      }}
    />
  )
}

export function CameraMcpInvocationSection() {
  const grammarCatalog = useAgenticOsRemoteGrammarCatalog({ sigils: CAMERA_GRAMMAR_SIGILS })
  const camera = inspectLocalCamera()
  const cameraEntries = React.useMemo(() => {
    void grammarCatalog.version
    return getAgenticOsDictionaryInvocations()
      .filter(entry => cameraCatalogEntryText(entry).includes('camera'))
      .sort((left, right) => cameraCatalogEntrySigilOrder(left) - cameraCatalogEntrySigilOrder(right) || left.token.localeCompare(right.token))
      .slice(0, CAMERA_TOKEN_LIMIT)
  }, [grammarCatalog.version])
  const nativeInvocationReady = Boolean(camera.invocationGrammar)
  const metadataLoading = grammarCatalog.hydration.status === 'idle' || grammarCatalog.hydration.status === 'loading'
  const sourceMetadataReady = grammarCatalog.hydration.status === 'fresh'
    && CAMERA_REQUIRED_METADATA_TOKENS.every(required => grammarCatalog.entries.some(entry => entry.token === required.token && entry.kind === required.kind))

  return (
    <section
      className="grid gap-2"
      aria-label="Camera WebMCP and invocation catalog"
      data-kg-camera-webmcp-invocations="1"
      data-kg-camera-grammar-status={nativeInvocationReady ? 'native-ready' : 'unavailable'}
      data-kg-camera-metadata-status={grammarCatalog.hydration.status}
      data-kg-camera-metadata-version={String(grammarCatalog.version)}
    >
      <section className="grid gap-1" aria-label="Camera WebMCP tools">
        <CameraCatalogCard
          Icon={Eye}
          title="Inspect Local Camera"
          description="Read shared framing, XR motion, panel, and BottomPanel Timeline state without mutation."
          metadata="WebMCP · read-only"
          footer={<code className="block min-w-0 truncate text-[9px]" title={camera.webMcpTools.inspect}>{camera.webMcpTools.inspect}</code>}
          dataAttributes={{ 'data-kg-camera-webmcp-tool': camera.webMcpTools.inspect }}
        />
        <CameraCatalogCard
          Icon={SlidersHorizontal}
          title="Control Local Camera"
          description="Frame, apply subject-bound moves, play, pause, and scrub through structured input or canonical invocation tokens."
          metadata="WebMCP · local mutation"
          footer={<code className="block min-w-0 truncate text-[9px]" title={camera.webMcpTools.control}>{camera.webMcpTools.control}</code>}
          dataAttributes={{ 'data-kg-camera-webmcp-tool': camera.webMcpTools.control }}
        />
      </section>

      <section className="grid gap-1" aria-label="Canonical Camera invocation tokens">
        {cameraEntries.map(entry => <CameraInvocationTokenCard key={entry.token} entry={entry} />)}
        {!sourceMetadataReady ? (
          <p
            className={cn('m-0 rounded border px-2 py-1 text-[10px]', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.tertiary)}
            data-kg-camera-metadata-not-fresh="1"
          >
            {metadataLoading
              ? 'ACOS Camera invocation metadata is loading. Native Camera controls remain ready.'
              : 'ACOS Camera invocation metadata is unavailable. Native Camera controls remain ready.'}
          </p>
        ) : null}
      </section>
    </section>
  )
}
