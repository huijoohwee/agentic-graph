import React from 'react'
import {
  buildAgenticOsInvocationSourceTitle,
  findAgenticOsInvocationByToken,
  type AgenticOsResolvedInvocation,
} from '@/features/agentic-os/agenticOsDocInvocations'
import { resolveInlineInvocationChipClassName, splitInlineKeywordChipTokens } from '@/features/markdown/ui/dataViewChipStyles'
import { readInvocationTokenKind, type InvocationTokenKind } from '@/lib/markdown/invocationTokens'
import { UI_INLINE_CHIP_LABEL_15CH_CLASSNAME, UI_INLINE_CHIP_SHELL_15CH_CLASSNAME, UI_TEXT_TRUNCATE_CHIP } from '@/lib/ui/textLayout'

export const AGENTIC_OS_INVOCATION_CHIP_ATTR = 'data-kg-agentic-os-invocation-chip'
export const AGENTIC_OS_INVOCATION_TOKEN_ATTR = 'data-kg-agentic-os-invocation-token'
export const AGENTIC_OS_INVOCATION_SOURCE_ATTR = 'data-kg-agentic-os-invocation-source'

export const readAgenticOsInvocationTokenKind = (value: string): InvocationTokenKind | null => readInvocationTokenKind(value)

export function resolveAgenticOsInvocationToken(value: string): { invocation: AgenticOsResolvedInvocation; token: string } | null {
  const token = String(value || '').trim()
  if (!token || !readAgenticOsInvocationTokenKind(token)) return null
  const invocation = findAgenticOsInvocationByToken(token)
  if (!invocation) return null
  return { invocation, token }
}

export function buildAgenticOsInvocationChipAttrs(token: string): Record<string, string> | null {
  const resolved = resolveAgenticOsInvocationToken(token)
  if (!resolved) return null
  return {
    [AGENTIC_OS_INVOCATION_CHIP_ATTR]: '1',
    [AGENTIC_OS_INVOCATION_TOKEN_ATTR]: resolved.token,
    [AGENTIC_OS_INVOCATION_SOURCE_ATTR]: resolved.invocation.sourcePath,
  }
}

export function buildAgenticOsInvocationChipTitle(token: string): string {
  const resolved = resolveAgenticOsInvocationToken(token)
  if (resolved) return buildAgenticOsInvocationSourceTitle(resolved.invocation)
  const kind = readAgenticOsInvocationTokenKind(token)
  if (!kind) return token
  return `${token}\n${kind === 'slash' ? 'Command' : kind === 'binding' ? 'Target or context binding' : 'Semantic keyword'}`
}

export function renderAgenticOsInvocationAnchor(args: {
  token: string
  className: string
  children: React.ReactNode
}): React.ReactNode | null {
  const resolved = resolveAgenticOsInvocationToken(args.token)
  if (!resolved) return null
  const attrs = buildAgenticOsInvocationChipAttrs(resolved.token)
  if (!attrs) return null
  return (
    <a
      href={resolved.invocation.sourcePath}
      target="_blank"
      rel="noopener noreferrer"
      className={args.className}
      title={buildAgenticOsInvocationSourceTitle(resolved.invocation)}
      data-kg-card-inline-keyword-pill="1"
      {...attrs}
    >
      {args.children}
    </a>
  )
}

export function renderAgenticOsInvocationKeywordChip(args: {
  value: string
  className: string
  sourceLink?: boolean
  allowUnresolved?: boolean
  fallbackTitle?: string
}): React.ReactNode | null {
  const token = String(args.value || '').trim()
  const resolved = resolveAgenticOsInvocationToken(token)
  if (!resolved && !args.allowUnresolved) return null
  if (args.sourceLink === false || !resolved) {
    const attrs = buildAgenticOsInvocationChipAttrs(token) || {
      [AGENTIC_OS_INVOCATION_CHIP_ATTR]: '1',
      [AGENTIC_OS_INVOCATION_TOKEN_ATTR]: token,
    }
    return (
      <span
        className={`${args.className} ${UI_INLINE_CHIP_SHELL_15CH_CLASSNAME}`}
        title={resolved ? buildAgenticOsInvocationSourceTitle(resolved.invocation) : args.fallbackTitle || buildAgenticOsInvocationChipTitle(token)}
        data-kg-card-inline-keyword-pill="1"
        {...attrs}
      >
        <span className={`${UI_TEXT_TRUNCATE_CHIP} ${UI_INLINE_CHIP_LABEL_15CH_CLASSNAME}`}>{token}</span>
      </span>
    )
  }
  return renderAgenticOsInvocationAnchor({
    token,
    className: `${args.className} ${UI_INLINE_CHIP_SHELL_15CH_CLASSNAME} cursor-pointer no-underline hover:underline`,
    children: <span className={`${UI_TEXT_TRUNCATE_CHIP} ${UI_INLINE_CHIP_LABEL_15CH_CLASSNAME}`}>{token}</span>,
  })
}

export function renderAgenticOsInlineCodeInvocationLinks(args: {
  text: string
  keyValue: string
}): React.ReactNode | null {
  const segments = splitInlineKeywordChipTokens(args.text)
  // A command plus a target/keyword remains an invocation when the catalog is deferred offline.
  const hasInvocationContext = segments.some(segment => segment.kind === 'keyword' && segment.value.startsWith('/'))
    && segments.some(segment => segment.kind === 'keyword' && /^[#@]/.test(segment.value))
  let hasInvocation = false
  const children = segments.map((segment, index) => {
    if (segment.kind === 'text') return <React.Fragment key={`code-text-${index}`}>{segment.value}</React.Fragment>
    const token = String(segment.value || '')
    const link = renderAgenticOsInvocationKeywordChip({
      value: token,
      className: resolveInlineInvocationChipClassName({ value: token }),
      allowUnresolved: hasInvocationContext,
    })
    if (!link) return <React.Fragment key={`code-token-${index}`}>{token}</React.Fragment>
    hasInvocation = true
    return <React.Fragment key={`code-token-${index}`}>{link}</React.Fragment>
  })
  if (!hasInvocation) return null
  return (
    <code key={args.keyValue} className="font-mono [font-size:inherit]" data-kg-inline-code-invocation="1">
      {children}
    </code>
  )
}
