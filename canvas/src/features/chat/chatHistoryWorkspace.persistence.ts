import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import {
  buildAgenticOsDraftEntry,
  buildAgenticOsWorkspaceDocument,
  normalizeAgenticOsAssistantBodyForStorage,
} from './chatHistoryWorkspace.agenticOs.build'
import { isAgenticOsStructuredMarkdown } from './chatHistoryWorkspace.agenticOs.parse'
import { normalizeAgenticOsFrontmatterIdentityToFileName } from './chatHistoryWorkspace.agenticOs.normalize'
import {
  ensureHistoryFilePath,
  resolveFilePrefix,
  toCanonicalAgenticOsWorkspacePath,
  toAgenticOsTraceWorkspacePath,
} from './chatHistoryWorkspace.paths'
import { mergeAgenticOsTraceSection } from './chatAgenticOsConsolidatedArtifacts'
import { sanitizeChatHistoryTraceUserText } from './chatStreamArtifactSanitizers'
import { mirrorChatWorkspaceFileToHost } from './chatWorkspaceMirror'
import type { ChatHistoryWorkspaceAppendArgs, ChatHistoryWorkspaceDraftArgs } from './chatHistoryWorkspace.types'
import { writeWorkspaceFileTextEnsuringFile } from './chatWorkspaceFsWrite'
import { shouldRejectMarkdownDocumentPayload } from '@/lib/markdown/markdownDocumentPayloadGuards'

const inFlightByPath = new Map<string, Promise<void>>()

const wrapFence = (content: string, lang: string): string => {
  const safeLang = String(lang || '').trim() || 'text'
  const safe = String(content || '').replace(/\r\n/g, '\n')
  const ticks = safe.includes('```') ? '````' : '```'
  return [`${ticks}${safeLang}`, safe, ticks].join('\n')
}

const pad2 = (n: number): string => String(n).padStart(2, '0')
const formatReadableTimestamp = (timestampMs: number): string => {
  const d = new Date(Number.isFinite(timestampMs) ? timestampMs : Date.now())
  const yyyy = String(d.getFullYear())
  const mm = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  const hh = pad2(d.getHours())
  const min = pad2(d.getMinutes())
  const sec = pad2(d.getSeconds())
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`
}

const stripDraftBlock = (existing: string, traceId: string): string => {
  const start = `<!-- kg-chat-draft:start:${traceId} -->`
  const end = `<!-- kg-chat-draft:end:${traceId} -->`
  const src = String(existing || '')
  const startIdx = src.indexOf(start)
  if (startIdx < 0) return src
  const endIdx = src.indexOf(end, startIdx + start.length)
  if (endIdx < 0) return src.slice(0, startIdx).trimEnd() + '\n'
  return `${src.slice(0, startIdx)}${src.slice(endIdx + end.length)}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

const buildChatHistoryHeader = (title: string): string => {
  return [`# ${title}`, '', 'This file is managed by agentic-graph Chat.', ''].join('\n')
}

const buildChatHistoryEntry = (args: {
  timestampMs: number
  traceId: string
  providerSummary: string
  userText: string
  assistantText: string
}): string => {
  const assistantSection = ['### assistant', wrapFence(args.assistantText, 'markdown'), ''].join('\n')
  const userText = sanitizeChatHistoryTraceUserText(args.userText)
  return [
    `## ${formatReadableTimestamp(args.timestampMs)}`,
    '',
    `Trace-ID: ${args.traceId}`,
    '',
    `Provider: ${String(args.providerSummary || '').trim() || 'unknown'}`,
    '',
    '### user',
    wrapFence(userText, 'text'),
    '',
    assistantSection,
  ].join('\n')
}

const appendChatHistoryEntryText = (existingRaw: string, title: string, entry: string): string => {
  const existing = String(existingRaw || '')
  const trimmed = existing.trim()
  const header = trimmed ? '' : buildChatHistoryHeader(title)
  const joiner = existing.endsWith('\n') || !existing ? '' : '\n'
  return [existing, header, entry].filter(Boolean).join(joiner)
}

export const appendChatHistoryWorkspaceFile = async (args: ChatHistoryWorkspaceAppendArgs): Promise<string> => {
  const prefix = resolveFilePrefix(args)
  const path = await ensureHistoryFilePath(args.requestedPath, args.timestampMs, {
    storageType: args.storageType,
    defaultLocalRootPath: args.defaultLocalRootPath,
  })
  const key = prefix === 'agenticOs'
    ? toCanonicalAgenticOsWorkspacePath(path)
    : normalizeWorkspacePath(path)
  const previous = inFlightByPath.get(key) || Promise.resolve()
  const run = previous.then(async () => {
    if (typeof args.onResolvedPath === 'function') {
      try {
        args.onResolvedPath(key)
      } catch {
        void 0
      }
    }
    const fs = await getWorkspaceFs()
    await fs.ensureSeed()
    const traceId = String(args.traceId || '').trim() || `trace-${args.timestampMs}`
    const baseTitle = args.title || (prefix === 'agenticOs' ? 'Knowledge Graph Canvas Storage' : 'Chat History Storage')
    const rawAssistantBody = String(args.assistantText || '').replace(/\r\n/g, '\n').trim()
    const assistantBody = shouldRejectMarkdownDocumentPayload(rawAssistantBody) ? '' : rawAssistantBody
    const agenticOsAssistantBody = normalizeAgenticOsAssistantBodyForStorage({
      timestampMs: args.timestampMs,
      workspacePath: key,
      requestText: args.userText,
      assistantText: assistantBody || 'No response content.',
      structuredResponseSource: args.structuredResponseSource,
    })
    if (prefix === 'agenticOs') {
      const existingRaw = (await fs.readFileText(key)) || ''
      const normalizedIdentity = normalizeAgenticOsFrontmatterIdentityToFileName({
        markdown: agenticOsAssistantBody,
        workspacePath: key,
        timestampMs: args.timestampMs,
      })
      const next = buildAgenticOsWorkspaceDocument({ canonicalAgenticOs: normalizedIdentity })
      const tracePath = toAgenticOsTraceWorkspacePath(key)
      const shouldWriteCanonical = next !== existingRaw
      if (shouldWriteCanonical) {
        await writeWorkspaceFileTextEnsuringFile({ fs, path: key, text: next })
        void mirrorChatWorkspaceFileToHost({ workspacePath: key, text: next })
      }
      if (tracePath) {
        const traceExistingRaw = (await fs.readFileText(tracePath)) || ''
        const traceExisting = stripDraftBlock(traceExistingRaw, traceId)
        if (traceExisting !== traceExistingRaw) {
          await writeWorkspaceFileTextEnsuringFile({ fs, path: tracePath, text: traceExisting })
        }
        const entry = buildChatHistoryEntry({
          timestampMs: args.timestampMs,
          traceId,
          providerSummary: args.providerSummary,
          userText: args.userText,
          assistantText: shouldRejectMarkdownDocumentPayload(args.assistantText) ? 'No response content.' : args.assistantText,
        })
        await mergeAgenticOsTraceSection({
          fs,
          workspacePath: key,
          sectionKey: `final:${traceId}`,
          title: 'AGENTIC_OS Finalization Trace',
          text: entry,
        })
      }
      return
    }
    const tracePath = `${key.replace(/\.md$/i, '')}--${traceId}.md`
    const entry = buildChatHistoryEntry({
      timestampMs: args.timestampMs,
      traceId,
      providerSummary: args.providerSummary,
      userText: args.userText,
      assistantText: shouldRejectMarkdownDocumentPayload(args.assistantText) ? 'No response content.' : args.assistantText,
    })
    await writeWorkspaceFileTextEnsuringFile({ fs, path: tracePath, text: `${entry.trimEnd()}\n` })
    void mirrorChatWorkspaceFileToHost({ workspacePath: tracePath, text: `${entry.trimEnd()}\n` })
    const existingRaw = (await fs.readFileText(key)) || ''
    const next = appendChatHistoryEntryText(existingRaw, baseTitle, entry)
    if (next === existingRaw) return
    await writeWorkspaceFileTextEnsuringFile({ fs, path: key, text: next })
    void mirrorChatWorkspaceFileToHost({ workspacePath: key, text: next })
  })
  inFlightByPath.set(key, run)
  try {
    await run
  } finally {
    if (inFlightByPath.get(key) === run) inFlightByPath.delete(key)
  }
  return key
}

export const upsertChatHistoryWorkspaceDraft = async (args: ChatHistoryWorkspaceDraftArgs): Promise<string> => {
  const prefix = resolveFilePrefix(args)
  const traceId = String(args.traceId || '').trim() || `trace-${args.timestampMs}`
  const path = await ensureHistoryFilePath(args.requestedPath, args.timestampMs, {
    storageType: args.storageType,
    defaultLocalRootPath: args.defaultLocalRootPath,
  })
  const key = normalizeWorkspacePath(path)
  const previous = inFlightByPath.get(key) || Promise.resolve()
  const run = previous.then(async () => {
    if (typeof args.onResolvedPath === 'function') {
      try {
        args.onResolvedPath(key)
      } catch {
        void 0
      }
    }
    const fs = await getWorkspaceFs()
    await fs.ensureSeed()
    const existingRaw = (await fs.readFileText(key)) || ''
    if (prefix === 'agenticOs') {
      const rawAssistantDraftText = String(args.assistantText || '').replace(/\r\n/g, '\n').trim()
      const assistantDraftText = shouldRejectMarkdownDocumentPayload(rawAssistantDraftText) ? '' : rawAssistantDraftText
      if (!assistantDraftText && rawAssistantDraftText) return
      // Streaming behavior: avoid dumping fallback template for partial chunks.
      // Only persist canonical AGENTIC_OS during draft when the streamed content is already structured.
      if (!isAgenticOsStructuredMarkdown(assistantDraftText)) {
        const draft = buildAgenticOsDraftEntry({
          timestampMs: args.timestampMs,
          traceId,
          providerSummary: args.providerSummary,
          userText: args.userText,
          assistantText: assistantDraftText || '_Streaming..._',
        })
        const tracePath = toAgenticOsTraceWorkspacePath(key)
        if (tracePath) {
          const traceExistingRaw = (await fs.readFileText(tracePath)) || ''
          const traceExisting = stripDraftBlock(traceExistingRaw, traceId)
          const joiner = traceExisting.endsWith('\n') || !traceExisting ? '' : '\n'
          const next = [traceExisting, draft].filter(Boolean).join(joiner)
          if (next === traceExistingRaw) return
          await writeWorkspaceFileTextEnsuringFile({ fs, path: tracePath, text: next })
        }
        return
      }
      const canonicalAgenticOs = normalizeAgenticOsAssistantBodyForStorage({
        timestampMs: args.timestampMs,
        workspacePath: key,
        requestText: args.userText,
        assistantText: assistantDraftText,
        structuredResponseSource: args.structuredResponseSource,
      })
      const normalizedIdentity = normalizeAgenticOsFrontmatterIdentityToFileName({
        markdown: canonicalAgenticOs,
        workspacePath: key,
        timestampMs: args.timestampMs,
      })
      const next = buildAgenticOsWorkspaceDocument({ canonicalAgenticOs: normalizedIdentity })
      if (next === existingRaw) return
      await writeWorkspaceFileTextEnsuringFile({ fs, path: key, text: next })
      if (!existingRaw.trim()) {
        void mirrorChatWorkspaceFileToHost({ workspacePath: key, text: next })
      }
      return
    }
    const baseTitle = args.title || 'Chat History Storage'
    if (shouldRejectMarkdownDocumentPayload(args.assistantText)) return
    const draft = buildAgenticOsDraftEntry({
      timestampMs: args.timestampMs,
      traceId,
      providerSummary: args.providerSummary,
      userText: args.userText,
      assistantText: args.assistantText,
    })
    const next = appendChatHistoryEntryText(existingRaw, baseTitle, draft)
    if (next === existingRaw) return
    await writeWorkspaceFileTextEnsuringFile({ fs, path: key, text: next })
    if (!existingRaw.trim()) {
      void mirrorChatWorkspaceFileToHost({ workspacePath: key, text: next })
    }
  })
  inFlightByPath.set(key, run)
  try {
    await run
  } finally {
    if (inFlightByPath.get(key) === run) inFlightByPath.delete(key)
  }
  return key
}
