import type { SettingMeta } from './types'
import { LS_KEYS } from '@/lib/config'
import { lsJson, lsRemove, lsSetJson } from '@/lib/persistence'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  STRIPE_MCP_CONNECTION_MODES,
  STRIPE_MCP_DEFAULT_CONNECTION_MODE,
  STRIPE_MCP_DEFAULT_LOCAL_ARGS_JSON,
  STRIPE_MCP_DEFAULT_LOCAL_COMMAND,
  STRIPE_MCP_DEFAULT_REQUIRE_CONFIRMATION,
  STRIPE_MCP_DEFAULT_SERVER_KEY,
  STRIPE_MCP_DEFAULT_STARTUP_TIMEOUT_MS,
  STRIPE_MCP_REMOTE_URL,
} from 'grph-shared/payments/stripeMcpSsot'
import { localBooleanSetting, localJsonSetting, localNumberSetting, localStringSetting } from './registry-local-settings'

const parseString = (raw: unknown): string | null => (typeof raw === 'string' ? raw : null)
const s = () => useGraphStore.getState()

export const paymentsSettingsRegistry: SettingMeta[] = [
  {
    key: 'payments.stripe.mode',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson(LS_KEYS.paymentsStripeMode, 'test', parseString),
    write: (v) => {
      const raw = String(v || '').trim()
      const next = raw === 'live' ? 'live' : 'test'
      lsSetJson(LS_KEYS.paymentsStripeMode, next)
    },
    docKey: 'payments.stripe.mode',
    default: () => 'test',
    options: ['test', 'live'],
  },
  {
    key: 'payments.stripe.secretKey',
    type: 'string',
    source: 'backendEnv',
    read: () => '',
    write: () => undefined,
    docKey: 'payments.stripe.secretKey',
    default: () => '',
  },
  {
    key: 'payments.stripe.publishableKey',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson(LS_KEYS.paymentsStripePublishableKey, '', parseString),
    write: (v) => {
      lsSetJson(LS_KEYS.paymentsStripePublishableKey, String(v || ''))
    },
    docKey: 'payments.stripe.publishableKey',
    default: () => '',
  },
  {
    key: 'payments.stripe.webhookSecret',
    type: 'string',
    source: 'backendEnv',
    read: () => '',
    write: () => undefined,
    docKey: 'payments.stripe.webhookSecret',
    default: () => '',
  },
  {
    key: 'payments.stripe.accountId',
    type: 'string',
    source: 'localStorage',
    read: () => lsJson(LS_KEYS.paymentsStripeAccountId, '', parseString),
    write: (v) => {
      lsSetJson(LS_KEYS.paymentsStripeAccountId, String(v || ''))
    },
    docKey: 'payments.stripe.accountId',
    default: () => '',
  },
  {
    key: 'payments.paywallEnabled',
    type: 'boolean',
    source: 'localStorage',
    read: () => s().paymentsPaywallEnabled === true,
    write: (v) => {
      s().setPaymentsPaywallEnabled(Boolean(v))
    },
    docKey: 'payments.paywallEnabled',
    default: () => false,
  },
  {
    key: 'payments.stripe.checkoutUrl',
    type: 'string',
    source: 'store',
    read: () => {
      lsRemove(LS_KEYS.paymentsStripeCheckoutUrl)
      return ''
    },
    write: () => {
      lsRemove(LS_KEYS.paymentsStripeCheckoutUrl)
      s().setPaymentsStripeCheckoutUrl('')
    },
    docKey: 'payments.stripe.checkoutUrl',
    default: () => '',
  },
  localStringSetting({
    key: 'payments.stripe.mcp.serverKey',
    storageKey: LS_KEYS.paymentsStripeMcpServerKey,
    defaultValue: STRIPE_MCP_DEFAULT_SERVER_KEY,
    docKey: 'payments.stripe.mcp.serverKey',
  }),
  localStringSetting({
    key: 'payments.stripe.mcp.remoteUrl',
    storageKey: LS_KEYS.paymentsStripeMcpRemoteUrl,
    defaultValue: STRIPE_MCP_REMOTE_URL,
    docKey: 'payments.stripe.mcp.remoteUrl',
  }),
  localStringSetting({
    key: 'payments.stripe.mcp.connectionMode',
    storageKey: LS_KEYS.paymentsStripeMcpConnectionMode,
    defaultValue: STRIPE_MCP_DEFAULT_CONNECTION_MODE,
    options: [...STRIPE_MCP_CONNECTION_MODES],
    docKey: 'payments.stripe.mcp.connectionMode',
  }),
  localStringSetting({
    key: 'payments.stripe.mcp.localCommand',
    storageKey: LS_KEYS.paymentsStripeMcpLocalCommand,
    defaultValue: STRIPE_MCP_DEFAULT_LOCAL_COMMAND,
    docKey: 'payments.stripe.mcp.localCommand',
  }),
  localJsonSetting({
    key: 'payments.stripe.mcp.localArgs',
    storageKey: LS_KEYS.paymentsStripeMcpLocalArgsJson,
    defaultValue: STRIPE_MCP_DEFAULT_LOCAL_ARGS_JSON,
    docKey: 'payments.stripe.mcp.localArgs',
  }),
  localNumberSetting({
    key: 'payments.stripe.mcp.startupTimeoutMs',
    storageKey: LS_KEYS.paymentsStripeMcpStartupTimeoutMs,
    defaultValue: STRIPE_MCP_DEFAULT_STARTUP_TIMEOUT_MS,
    min: 1000,
    max: 300000,
    docKey: 'payments.stripe.mcp.startupTimeoutMs',
  }),
  localBooleanSetting({
    key: 'payments.stripe.mcp.requireConfirmation',
    storageKey: LS_KEYS.paymentsStripeMcpRequireConfirmation,
    defaultValue: STRIPE_MCP_DEFAULT_REQUIRE_CONFIRMATION,
    docKey: 'payments.stripe.mcp.requireConfirmation',
  }),
]
