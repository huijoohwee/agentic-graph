import { LS_KEYS } from '@/lib/config';
import { lsJson, lsSetJson } from '@/lib/persistence';

export { downloadBlob, openSaveFilePickerHandle, saveBlobWithPicker, writeBlobToFileHandle } from 'agentic-gateway/transfer/browser-files';
export type { SaveFilePickerHandle } from 'agentic-gateway/transfer/browser-files';

export function readExportPrefs(): Record<string, unknown> {
  return lsJson<Record<string, unknown>>(LS_KEYS.exportPrefs, {}, raw => {
    if (!raw || typeof raw !== 'object') return null;
    return raw as Record<string, unknown>;
  });
}

export function writeExportPrefs(prefs: Record<string, unknown>) {
  lsSetJson(LS_KEYS.exportPrefs, prefs);
}
