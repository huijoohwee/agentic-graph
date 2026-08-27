import React from 'react'
import StatusBadge from '@/features/panels/ui/StatusBadge'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { CHAT_PROVIDER_BYTEPLUS, CHAT_PROVIDER_DEERFLOW } from '@/lib/chatEndpoint'
import { DEERFLOW_API_DOC_AREA } from './deerflowApiDocs'
import type { SettingsRowActions, SettingsRowRefs, SettingsRowStatusState, SettingsRowUi } from './settingsRowTypes'
import { STRIPE_PAYMENT_SERVER_SECRET_ENV_SUMMARY } from 'grph-shared/payments/stripePaymentSsot'
import {
  KTV_VALUE_ROW_INPUT_SHELL_CLASS_NAME,
  KTV_VALUE_ROW_SCROLL_SPACIOUS_CLASS_NAME,
  KTV_VALUE_ROW_STATUS_SHELL_CLASS_NAME,
} from '@/features/panels/ui/canvasKeyTypeValueValueCell'

type SettingsSpecialValueNodeProps = {
  area: string
  inputNode: React.ReactNode
  resolvedValueKey: string
  sectionActionClassName: string
  sectionStatusClassName: string
  sKey: string
  actions: Pick<
    SettingsRowActions,
    | 'applyActiveWorkspaceFileAsChatHistory'
    | 'applyActiveWorkspaceFileAsAgenticGraph'
    | 'checkBytePlusHealth'
    | 'checkBytePlusVideoModelPreview'
    | 'checkChatHealth'
    | 'checkDeerFlowHealth'
    | 'checkGrabMapsHealth'
    | 'createAndSelectChatHistoryFile'
    | 'createAndSelectAgenticGraphFile'
    | 'importCloudUrlForChatHistory'
    | 'importCloudUrlForAgenticGraph'
    | 'openFilePicker'
    | 'openWorkspaceFile'
    | 'pushUiToast'
    | 'setChatHistoryPathStatus'
    | 'setAgenticGraphPathStatus'
    | 'setValues'
  >
  refs: SettingsRowRefs
  status: SettingsRowStatusState
  ui: Pick<SettingsRowUi, 'uiPanelKeyValueTextSizeClass'>
  values: Record<string, string | number | boolean>
}

const specialValueRowClassName = KTV_VALUE_ROW_SCROLL_SPACIOUS_CLASS_NAME
const specialValueInputShellClassName = KTV_VALUE_ROW_INPUT_SHELL_CLASS_NAME
const specialValueStatusShellClassName = KTV_VALUE_ROW_STATUS_SHELL_CLASS_NAME

export function shouldRenderSettingsSpecialValueNode({
  area,
  resolvedValueKey,
  sKey,
}: {
  area: string
  resolvedValueKey: string
  sKey: string
}): boolean {
  return (
    sKey === 'chatSystemPrompt'
    || (area === DEERFLOW_API_DOC_AREA && sKey === 'deerflowApi.provider')
    || resolvedValueKey === 'maps.grabmaps.apiKey'
    || sKey === 'stripeApi.auth.secret_key'
    || sKey === 'stripeApi.webhooks.signing_secret'
    || sKey === 'stripeApi.checkout.session_url'
    || sKey === 'chatHistoryWorkspacePath'
    || sKey === 'chatAgenticGraphWorkspacePath'
    || sKey === 'chatHistoryCloudUrl'
    || sKey === 'chatAgenticGraphCloudUrl'
  )
}

export function SettingsSpecialValueNode(props: SettingsSpecialValueNodeProps): React.ReactNode | null {
  const {
    actions,
    area,
    inputNode,
    refs,
    resolvedValueKey,
    sectionActionClassName,
    sectionStatusClassName,
    sKey,
    status,
    ui,
    values,
  } = props

  if (!shouldRenderSettingsSpecialValueNode({ area, resolvedValueKey, sKey })) return null

  if (sKey === 'chatSystemPrompt') {
    return (
      <section className={specialValueRowClassName}>
        <section className={specialValueInputShellClassName}>{inputNode}</section>
        <section className={specialValueStatusShellClassName} title={status.chatHealthDetails || undefined}>
          <StatusBadge
            label="Chat API"
            ok={status.isCheckingHealth ? null : (status.chatHealthOk ?? null)}
            msg={status.isCheckingHealth ? 'Checking...' : status.chatHealthOk === true ? 'Success' : status.chatHealthOk === false ? 'Failed' : 'Idle'}
            details={status.chatHealthDetails || undefined}
          />
        </section>
        {status.normalizedChatProvider !== CHAT_PROVIDER_BYTEPLUS ? (
          <section className={specialValueStatusShellClassName} title={status.bytePlusHealthDetails || undefined}>
            <StatusBadge
              label="BytePlus API"
              ok={status.isCheckingBytePlusHealth ? null : (status.bytePlusHealthOk ?? null)}
              msg={status.isCheckingBytePlusHealth ? 'Checking...' : status.bytePlusHealthOk === true ? 'Success' : status.bytePlusHealthOk === false ? 'Failed' : 'Idle'}
              details={status.bytePlusHealthDetails || undefined}
            />
          </section>
        ) : null}
        {status.normalizedChatProvider === CHAT_PROVIDER_DEERFLOW ? (
          <section className={specialValueStatusShellClassName} title={status.deerFlowHealthDetails || undefined}>
            <StatusBadge
              label="DeerFlow Gateway"
              ok={status.isCheckingDeerFlowHealth ? null : (status.deerFlowHealthOk ?? null)}
              msg={status.isCheckingDeerFlowHealth ? 'Checking...' : status.deerFlowHealthOk === true ? 'Success' : status.deerFlowHealthOk === false ? 'Failed' : 'Idle'}
              details={status.deerFlowHealthDetails || undefined}
            />
          </section>
        ) : null}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            actions.checkChatHealth()
            if (status.normalizedChatProvider !== CHAT_PROVIDER_BYTEPLUS) {
              actions.checkBytePlusHealth()
            }
            if (status.normalizedChatProvider === CHAT_PROVIDER_DEERFLOW) {
              actions.checkDeerFlowHealth()
            }
            actions.checkBytePlusVideoModelPreview()
          }}
          disabled={status.isCheckingHealth || status.isCheckingBytePlusHealth || status.isCheckingDeerFlowHealth || status.isCheckingBytePlusVideoModelPreview}
          className={sectionActionClassName}
        >
          {status.isCheckingHealth || status.isCheckingBytePlusHealth || status.isCheckingDeerFlowHealth || status.isCheckingBytePlusVideoModelPreview ? 'Checking...' : 'Check Health'}
        </button>
      </section>
    )
  }

  if (area === DEERFLOW_API_DOC_AREA && sKey === 'deerflowApi.provider') {
    return (
      <section className={specialValueRowClassName}>
        <section className={specialValueInputShellClassName}>{inputNode}</section>
        <section className={specialValueStatusShellClassName} title={status.deerFlowHealthDetails || undefined}>
          <StatusBadge
            label="DeerFlow Gateway"
            ok={status.isCheckingDeerFlowHealth ? null : (status.deerFlowHealthOk ?? null)}
            msg={status.isCheckingDeerFlowHealth ? 'Checking...' : status.deerFlowHealthOk === true ? 'Success' : status.deerFlowHealthOk === false ? 'Failed' : 'Idle'}
            details={status.deerFlowHealthDetails || undefined}
          />
        </section>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            actions.checkDeerFlowHealth()
          }}
          disabled={status.isCheckingDeerFlowHealth}
          className={sectionActionClassName}
        >
          {status.isCheckingDeerFlowHealth ? 'Checking...' : 'Check Health'}
        </button>
      </section>
    )
  }

  if (resolvedValueKey === 'maps.grabmaps.apiKey') {
    return (
      <section className={specialValueRowClassName}>
        <section className={specialValueInputShellClassName}>{inputNode}</section>
        <section className={specialValueStatusShellClassName} title={status.grabMapsHealthDetails || undefined}>
          <StatusBadge
            label="GrabMaps API"
            ok={status.isCheckingGrabMapsHealth ? null : (status.grabMapsHealthOk ?? null)}
            msg={status.isCheckingGrabMapsHealth ? 'Checking...' : status.grabMapsHealthOk === true ? 'Success' : status.grabMapsHealthOk === false ? 'Failed' : 'Idle'}
            details={status.grabMapsHealthDetails || undefined}
          />
        </section>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            void actions.checkGrabMapsHealth()
          }}
          disabled={status.isCheckingGrabMapsHealth}
          className={sectionActionClassName}
        >
          {status.isCheckingGrabMapsHealth ? 'Checking...' : 'Check Health'}
        </button>
      </section>
    )
  }

  if (sKey === 'stripeApi.auth.secret_key' || sKey === 'stripeApi.webhooks.signing_secret') {
    const secretLabel = sKey === 'stripeApi.auth.secret_key' ? 'Stripe secret keys' : 'Stripe webhook signing secrets'
    const envLabel = sKey === 'stripeApi.auth.secret_key' ? STRIPE_PAYMENT_SERVER_SECRET_ENV_SUMMARY : 'STRIPE_WEBHOOK_SECRET'
    return (
      <section className={specialValueRowClassName}>
        <section className={specialValueInputShellClassName}>
          <input
            value=""
            readOnly
            placeholder="Server-managed only"
            className={`w-full rounded-md border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary} px-2 py-1.5 ${ui.uiPanelKeyValueTextSizeClass}`}
            title="Server-managed only"
          />
          <section className={`mt-1 min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap ${ui.uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}>
            {secretLabel} are not stored in the browser. Use `{envLabel}` on the server.
          </section>
        </section>
        <span className={sectionStatusClassName} title="Secret stays server-side.">
          server-managed
        </span>
      </section>
    )
  }

  if (sKey === 'stripeApi.checkout.session_url') {
    return (
      <section className={specialValueRowClassName}>
        <section className={specialValueInputShellClassName}>
          <input
            value=""
            readOnly
            placeholder="Generated per Checkout attempt"
            className={`w-full rounded-md border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary} px-2 py-1.5 ${ui.uiPanelKeyValueTextSizeClass}`}
            title="Generated per Checkout attempt"
          />
          <section className={`mt-1 min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap ${ui.uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}>
            Checkout Session URLs are not persisted in browser settings. The paywall creates a fresh hosted Session through the payment Worker.
          </section>
        </section>
        <span className={sectionStatusClassName} title="Session URL is created only during hosted Checkout handoff.">
          per-attempt
        </span>
      </section>
    )
  }

  if (sKey === 'chatHistoryWorkspacePath') {
    const currentPath = typeof values.chatHistoryWorkspacePath === 'string' ? values.chatHistoryWorkspacePath.trim() : ''
    return (
      <section className={specialValueRowClassName}>
        <section className={specialValueInputShellClassName}>
          {inputNode}
          {status.chatHistoryPathStatus && (
            <section className={`mt-1 min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap ${ui.uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}>{status.chatHistoryPathStatus}</section>
          )}
        </section>
        <button type="button" onClick={e => { e.stopPropagation(); actions.openFilePicker(refs.localImportInputRef.current) }} className={sectionActionClassName}>Import Files</button>
        <button type="button" onClick={e => { e.stopPropagation(); actions.openFilePicker(refs.localFolderImportInputRef.current) }} className={sectionActionClassName}>Import Folder</button>
        <button type="button" onClick={e => { e.stopPropagation(); actions.applyActiveWorkspaceFileAsChatHistory() }} className={sectionActionClassName}>Use Active</button>
        <button type="button" onClick={e => { e.stopPropagation(); void actions.createAndSelectChatHistoryFile() }} disabled={status.isUpdatingChatHistoryPath} className={sectionActionClassName}>{status.isUpdatingChatHistoryPath ? 'Creating...' : 'New File'}</button>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            if (!currentPath) {
              actions.setChatHistoryPathStatus('Chat history path is not set.')
              return
            }
            actions.openWorkspaceFile(currentPath)
          }}
          disabled={!currentPath}
          className={sectionActionClassName}
        >
          Open
        </button>
      </section>
    )
  }

  if (sKey === 'chatAgenticGraphWorkspacePath') {
    const currentPath = typeof values.chatAgenticGraphWorkspacePath === 'string' ? values.chatAgenticGraphWorkspacePath.trim() : ''
    return (
      <section className={specialValueRowClassName}>
        <section className={specialValueInputShellClassName}>
          {inputNode}
          {status.agenticgraphPathStatus && (
            <section className={`mt-1 min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap ${ui.uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.text.tertiary}`}>{status.agenticgraphPathStatus}</section>
          )}
        </section>
        <button type="button" onClick={e => { e.stopPropagation(); actions.openFilePicker(refs.kgcLocalImportInputRef.current) }} className={sectionActionClassName}>Import Files</button>
        <button type="button" onClick={e => { e.stopPropagation(); actions.openFilePicker(refs.kgcLocalFolderImportInputRef.current) }} className={sectionActionClassName}>Import Folder</button>
        <button type="button" onClick={e => { e.stopPropagation(); actions.applyActiveWorkspaceFileAsAgenticGraph() }} className={sectionActionClassName}>Use Active</button>
        <button type="button" onClick={e => { e.stopPropagation(); void actions.createAndSelectAgenticGraphFile() }} disabled={status.isUpdatingAgenticGraphPath} className={sectionActionClassName}>{status.isUpdatingAgenticGraphPath ? 'Creating...' : 'New File'}</button>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            if (!currentPath) {
              actions.setAgenticGraphPathStatus('chatAgenticGraph path is not set.')
              return
            }
            actions.openWorkspaceFile(currentPath)
          }}
          disabled={!currentPath}
          className={sectionActionClassName}
        >
          Open
        </button>
      </section>
    )
  }

  if (sKey === 'chatHistoryCloudUrl') {
    return (
      <section className={specialValueRowClassName}>
        <section className={specialValueInputShellClassName}>{inputNode}</section>
        <button type="button" onClick={e => { e.stopPropagation(); actions.importCloudUrlForChatHistory() }} className={sectionActionClassName}>Import URL</button>
      </section>
    )
  }

  if (sKey === 'chatAgenticGraphCloudUrl') {
    return (
      <section className={specialValueRowClassName}>
        <section className={specialValueInputShellClassName}>{inputNode}</section>
        <button type="button" onClick={e => { e.stopPropagation(); actions.importCloudUrlForAgenticGraph() }} className={sectionActionClassName}>Import URL</button>
      </section>
    )
  }

  return null
}
