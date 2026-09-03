import { useGraphStore } from '@/hooks/useGraphStore'
import {
  DEFAULT_INTEGRATION_CONFIGS,
  type IntegrationConfigs,
  parseIntegrationConfigsJson,
  stringifyIntegrationConfigs,
} from '@/features/integrations/config'

export type IntegrationUtilityCommand = {
  exportJson: () => string
  exportObject: () => IntegrationConfigs
  importJson: (json: string) => IntegrationConfigs
  importObject: (value: unknown) => IntegrationConfigs
  reset: () => IntegrationConfigs
}

const toResult = (raw: string | null | undefined): { json: string; object: IntegrationConfigs } => {
  const object = parseIntegrationConfigsJson(raw)
  return { object, json: stringifyIntegrationConfigs(object) }
}

export const createIntegrationUtilityCommand = (): IntegrationUtilityCommand => {
  const readCurrent = () => useGraphStore.getState().integrationConfigsJson
  const writeNext = (value: string) => {
    useGraphStore.getState().setIntegrationConfigsJson(value)
    return parseIntegrationConfigsJson(useGraphStore.getState().integrationConfigsJson)
  }
  return {
    exportJson: () => toResult(readCurrent()).json,
    exportObject: () => toResult(readCurrent()).object,
    importJson: (json: string) => writeNext(json),
    importObject: (value: unknown) => writeNext(JSON.stringify(value ?? {})),
    reset: () => writeNext(stringifyIntegrationConfigs(DEFAULT_INTEGRATION_CONFIGS)),
  }
}

declare global {
  interface Window {
    agenticGraphIntegrationCommand?: IntegrationUtilityCommand
  }
}

export const installIntegrationUtilityCommand = (): (() => void) => {
  if (typeof window === 'undefined') return () => void 0
  const command = createIntegrationUtilityCommand()
  window.agenticGraphIntegrationCommand = command
  return () => {
    if (window.agenticGraphIntegrationCommand === command) {
      delete window.agenticGraphIntegrationCommand
    }
  }
}

