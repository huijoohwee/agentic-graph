import type { SettingMeta } from './types'
import { createFlowDetailsLoader } from './flowDetailsRuntime'
import { uiSettingsRegistry } from './registry-ui'
import { threeSettingsRegistry } from './registry-three'
import { presetAndEnvSettingsRegistry } from './registry-presets'
import { paymentsSettingsRegistry } from './registry-payments'
import { searchSettingsRegistry } from './registry-search'
import { openAiMcpSettingsRegistry } from './registry-openai-mcp'
import { feishuBaseMcpSettingsRegistry } from './registry-feishu-base-mcp'
import { operatorDeployMcpSettingsRegistry } from './registry-operator-deploy'

export const settingsRegistry: SettingMeta[] = [
  ...uiSettingsRegistry,
  ...threeSettingsRegistry,
  ...presetAndEnvSettingsRegistry,
  ...searchSettingsRegistry,
  ...feishuBaseMcpSettingsRegistry,
  ...openAiMcpSettingsRegistry,
  ...operatorDeployMcpSettingsRegistry,
  ...paymentsSettingsRegistry,
]

export const loadFlowDetails = createFlowDetailsLoader(
  () => import('./settings-flow.schema.json'),
)
