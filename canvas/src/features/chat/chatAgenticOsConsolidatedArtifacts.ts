import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import type { WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import {
  toCanonicalAgenticOsWorkspacePath,
  toAgenticOsTraceWorkspacePath,
} from './chatHistoryWorkspace.paths'
import { writeWorkspaceFileTextEnsuringFile } from './chatWorkspaceFsWrite'
import { mirrorChatWorkspaceFileToHost } from './chatWorkspaceMirror'

type ConsolidatedTarget = 'canonical' | 'trace'

const normalizeMarkdown = (value: unknown): string => String(value || '').replace(/\r\n/g, '\n').trim()

const markerPrefix = (target: ConsolidatedTarget, sectionKey: string): string => {
  const safeKey = String(sectionKey || 'section').replace(/[^a-zA-Z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '') || 'section'
  return `agentic-os-consolidated:${target}:${safeKey}`
}

const wrapFence = (content: string, language: string): string => {
  const safe = String(content || '').replace(/\r\n/g, '\n').trim()
  const fence = safe.includes('```') ? '````' : '```'
  return `${fence}${String(language || 'text').trim() || 'text'}\n${safe}\n${fence}`
}

const buildMarkedSection = (args: {
  target: ConsolidatedTarget
  sectionKey: string
  title: string
  text: string
  fenceLanguage?: string | null
}): string => {
  const prefix = markerPrefix(args.target, args.sectionKey)
  const text = normalizeMarkdown(args.text)
  const body = args.fenceLanguage ? wrapFence(text, args.fenceLanguage) : text
  const title = String(args.title || 'Consolidated Artifact').trim()
  return [
    `<!-- ${prefix}:start -->`,
    `## ${title}`,
    '',
    body || 'No consolidated content recorded.',
    `<!-- ${prefix}:end -->`,
  ].join('\n')
}

const upsertMarkedSection = (existingRaw: string, section: string, args: {
  target: ConsolidatedTarget
  sectionKey: string
}): string => {
  const existing = String(existingRaw || '').replace(/\r\n/g, '\n').trimEnd()
  const prefix = markerPrefix(args.target, args.sectionKey)
  const start = `<!-- ${prefix}:start -->`
  const end = `<!-- ${prefix}:end -->`
  const startIndex = existing.indexOf(start)
  if (startIndex >= 0) {
    const endIndex = existing.indexOf(end, startIndex + start.length)
    if (endIndex >= 0) {
      return `${existing.slice(0, startIndex).trimEnd()}\n\n${section}\n\n${existing.slice(endIndex + end.length).trimStart()}`.trimEnd() + '\n'
    }
  }
  return `${existing}${existing ? '\n\n' : ''}${section}\n`
}

const writeMergedSection = async (args: {
  fs?: WorkspaceFs | null
  workspacePath: WorkspacePath
  target: ConsolidatedTarget
  sectionKey: string
  title: string
  text: string
  fenceLanguage?: string | null
}): Promise<WorkspacePath> => {
  const fs = args.fs || await getWorkspaceFs()
  await fs.ensureSeed()
  const existingRaw = (await fs.readFileText(args.workspacePath)) || ''
  const section = buildMarkedSection({
    target: args.target,
    sectionKey: args.sectionKey,
    title: args.title,
    text: args.text,
    fenceLanguage: args.fenceLanguage,
  })
  const next = upsertMarkedSection(existingRaw, section, {
    target: args.target,
    sectionKey: args.sectionKey,
  })
  if (next !== existingRaw) {
    await writeWorkspaceFileTextEnsuringFile({ fs, path: args.workspacePath, text: next })
    await mirrorChatWorkspaceFileToHost({ workspacePath: args.workspacePath, text: next })
  }
  return args.workspacePath
}

export const mergeAgenticOsTraceSection = async (args: {
  fs?: WorkspaceFs | null
  workspacePath: string | null | undefined
  sectionKey: string
  title: string
  text: string
  fenceLanguage?: string | null
}): Promise<WorkspacePath | null> => {
  const tracePath = toAgenticOsTraceWorkspacePath(String(args.workspacePath || '').trim())
  if (!tracePath) return null
  return await writeMergedSection({
    fs: args.fs,
    workspacePath: tracePath,
    target: 'trace',
    sectionKey: args.sectionKey,
    title: args.title,
    text: args.text,
    fenceLanguage: args.fenceLanguage,
  })
}

export const mergeAgenticOsCanonicalSection = async (args: {
  fs?: WorkspaceFs | null
  workspacePath: string | null | undefined
  sectionKey: string
  title: string
  text: string
  fenceLanguage?: string | null
}): Promise<WorkspacePath | null> => {
  const raw = String(args.workspacePath || '').trim()
  if (!raw) return null
  const canonicalPath = toCanonicalAgenticOsWorkspacePath(raw)
  if (!normalizeWorkspacePath(canonicalPath)) return null
  return await writeMergedSection({
    fs: args.fs,
    workspacePath: canonicalPath,
    target: 'canonical',
    sectionKey: args.sectionKey,
    title: args.title,
    text: args.text,
    fenceLanguage: args.fenceLanguage,
  })
}
