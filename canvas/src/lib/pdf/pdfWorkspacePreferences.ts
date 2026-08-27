import { LS_KEYS } from '../config.ls'
import { getLocalStorage } from '../persistence'
import { PDF_WORKSPACE_DIR_REL_DEFAULT } from './pdfWorkspaceConfig'

const normalizeRel = (raw: string): string => String(raw || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')

export function normalizePdfWorkspaceOutputDirRel(raw: string): string {
  const fallback = PDF_WORKSPACE_DIR_REL_DEFAULT
  const rel = normalizeRel(raw || fallback) || fallback
  const normalized = rel.split('/').filter(Boolean).join('/')
  if (!normalized) return fallback
  if (!normalized.startsWith('.agenticgraph-workspace/')) return fallback
  if (normalized.startsWith('..') || normalized.includes('/../')) return fallback
  return normalized
}

export function readPdfWorkspaceOutputDirRel(): string {
  const storage = getLocalStorage()
  if (!storage) return PDF_WORKSPACE_DIR_REL_DEFAULT
  try {
    const raw = storage.getItem(LS_KEYS.pdfWorkspaceOutputDirRel) || ''
    return normalizePdfWorkspaceOutputDirRel(raw)
  } catch {
    return PDF_WORKSPACE_DIR_REL_DEFAULT
  }
}

export function writePdfWorkspaceOutputDirRel(next: string): string {
  const normalized = normalizePdfWorkspaceOutputDirRel(next)
  const storage = getLocalStorage()
  if (!storage) return normalized
  try {
    storage.setItem(LS_KEYS.pdfWorkspaceOutputDirRel, normalized)
  } catch {
    void 0
  }
  return normalized
}

