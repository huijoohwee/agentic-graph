import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { RightAlignedValueCell } from '@/features/panels/ui/canvasKeyTypeValueValueCell'
import { CanvasEditableKeyTypeValueRow as KeyTypeValueRow } from '@/features/panels/ui/CanvasEditableKeyTypeValueRow'
import { RightAlignedTooltipInput } from '@/features/panels/ui/RightAlignedTooltipInput'
import {
  KTV_STATUS_TEXT_CLASS_NAME,
  shouldFlushKeyTypeValueSectionTop,
} from 'grph-shared/ui/keyTypeValueRows'
import {
  KeyTypeValueHeader,
  KeyTypeValueSectionStack,
} from 'grph-shared/react/keyTypeValueLayout'
import ExpandCollapseAllButton from '@/features/panels/ui/ExpandCollapseAllButton'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_SECTION_CHIP_CHROME_CLASS_NAME, getUiSectionChipClassName } from '@/lib/ui/sectionChipChrome'
import { getIconSizeClass } from '@/lib/ui/icons'
import { uiToolbarToggleActiveClassName } from '@/features/toolbar/ui/toolbarStyles'
import { useP2PCollaborationStore } from '@/features/collaboration/p2pCollaborationStore'
import { MainPanelTypeIcon, type MainPanelTypeIconKey } from '@/features/panels/ui/mainPanelHelpIconLibrary'
import { UI_RESPONSIVE_PANEL_FLEX_INPUT_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { readAgenticGraphStorageCanvasRoomConfig } from '@/lib/storage/agenticgraphStorageCanvasRoomClient'

type SectionId = 'session' | 'invite' | 'answer' | 'peer'

type CollaborationViewProps = {
  searchQuery: string
  requestedAnchorId?: string
  requestedAnchorSeq?: number
  onRegisterActions?: (a: {
    collapseAll?: () => void
    expandAll?: () => void
    allCollapsed?: boolean
  }) => void
}

const SECTION_ORDER: SectionId[] = ['session', 'invite', 'answer', 'peer']

function buildCollapsedState(next: boolean): Record<SectionId, boolean> {
  return {
    session: next,
    invite: next,
    answer: next,
    peer: next,
  }
}

export default function CollaborationView({ searchQuery, onRegisterActions }: CollaborationViewProps) {
  const pushUiToast = useGraphStore(s => s.pushUiToast)
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const displayName = useP2PCollaborationStore(s => s.displayName)
  const role = useP2PCollaborationStore(s => s.role)
  const phase = useP2PCollaborationStore(s => s.phase)
  const statusText = useP2PCollaborationStore(s => s.statusText)
  const errorText = useP2PCollaborationStore(s => s.errorText)
  const sessionId = useP2PCollaborationStore(s => s.sessionId)
  const localPeerId = useP2PCollaborationStore(s => s.localPeerId)
  const ownerPeerId = useP2PCollaborationStore(s => s.ownerPeerId)
  const inviteInput = useP2PCollaborationStore(s => s.inviteInput)
  const inviteToken = useP2PCollaborationStore(s => s.inviteToken)
  const inviteUrl = useP2PCollaborationStore(s => s.inviteUrl)
  const answerInput = useP2PCollaborationStore(s => s.answerInput)
  const answerToken = useP2PCollaborationStore(s => s.answerToken)
  const followModeEnabled = useP2PCollaborationStore(s => s.followModeEnabled)
  const followPeerId = useP2PCollaborationStore(s => s.followPeerId)
  const localCaretLine = useP2PCollaborationStore(s => s.localCaretLine)
  const peers = useP2PCollaborationStore(s => s.peers)
  const setDisplayName = useP2PCollaborationStore(s => s.setDisplayName)
  const setInviteInput = useP2PCollaborationStore(s => s.setInviteInput)
  const setAnswerInput = useP2PCollaborationStore(s => s.setAnswerInput)
  const setFollowModeEnabled = useP2PCollaborationStore(s => s.setFollowModeEnabled)
  const setFollowPeerId = useP2PCollaborationStore(s => s.setFollowPeerId)
  const queueStartHost = useP2PCollaborationStore(s => s.queueStartHost)
  const queueJoinInvite = useP2PCollaborationStore(s => s.queueJoinInvite)
  const queueApplyAnswer = useP2PCollaborationStore(s => s.queueApplyAnswer)
  const queueDisconnect = useP2PCollaborationStore(s => s.queueDisconnect)
  const queueRemovePeer = useP2PCollaborationStore(s => s.queueRemovePeer)
  const [collapsedBySection, setCollapsedBySection] = React.useState<Record<SectionId, boolean>>(() => buildCollapsedState(false))

  const normalizedQuery = React.useMemo(() => String(searchQuery || '').trim().toLowerCase(), [searchQuery])
  const hasAuthenticatedRoomTransport = React.useMemo(() => !!readAgenticGraphStorageCanvasRoomConfig(), [])
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const renderTypeIcon = React.useCallback((iconKey: MainPanelTypeIconKey) => (
    <MainPanelTypeIcon iconKey={iconKey} className={iconSizeClass} strokeWidth={uiIconStrokeWidth} />
  ), [iconSizeClass, uiIconStrokeWidth])
  const allCollapsed = React.useMemo(
    () => SECTION_ORDER.every(sectionId => collapsedBySection[sectionId]),
    [collapsedBySection],
  )
  const remotePeers = React.useMemo(() => peers.filter(peer => !peer.isLocal), [peers])
  const connectedRemotePeers = React.useMemo(
    () => remotePeers.filter(peer => peer.connectionState === 'connected'),
    [remotePeers],
  )
  const isOwner = Boolean(localPeerId && ownerPeerId && localPeerId === ownerPeerId)
  const hostActionLabel = hasAuthenticatedRoomTransport
    ? (phase === 'connected' ? 'Reconnect Room' : 'Connect Room')
    : (role === 'host' ? 'Generate Invite' : 'Start Host')
  const collapseAll = React.useCallback(() => {
    setCollapsedBySection(buildCollapsedState(true))
  }, [])
  const expandAll = React.useCallback(() => {
    setCollapsedBySection(buildCollapsedState(false))
  }, [])
  const registeredActions = React.useMemo(() => ({
    collapseAll,
    expandAll,
    allCollapsed,
  }), [allCollapsed, collapseAll, expandAll])

  React.useEffect(() => {
    if (!followModeEnabled) return
    if (followPeerId) return
    if (connectedRemotePeers.length !== 1) return
    setFollowPeerId(connectedRemotePeers[0]?.peerId || null)
  }, [connectedRemotePeers, followModeEnabled, followPeerId, setFollowPeerId])

  React.useEffect(() => {
    onRegisterActions?.(registeredActions)
  }, [onRegisterActions, registeredActions])

  const toggleSection = React.useCallback((sectionId: SectionId) => {
    setCollapsedBySection(prev => ({ ...prev, [sectionId]: !prev[sectionId] }))
  }, [])

  const matchesQuery = React.useCallback((...parts: Array<string | number | null | undefined>) => {
    if (!normalizedQuery) return true
    return parts.some(part => String(part || '').toLowerCase().includes(normalizedQuery))
  }, [normalizedQuery])

  const copyText = React.useCallback(async (value: string, successMessage: string) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable')
      }
      await navigator.clipboard.writeText(value)
      pushUiToast({ id: successMessage, kind: 'success', message: successMessage, ttlMs: 2200, dismissible: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Clipboard write failed'
      pushUiToast({ id: `${successMessage}:error`, kind: 'error', message, ttlMs: 3200, dismissible: true })
    }
  }, [pushUiToast])

  const buttonClassName = `${UI_SECTION_CHIP_CHROME_CLASS_NAME} ${UI_THEME_TOKENS.text.primary}`
  const activeButtonClassName = `App-toolbar__btn text-xs ${uiToolbarToggleActiveClassName}`
  const rowValueClassName = 'flex flex-wrap items-center justify-start gap-1 sm:justify-end'
  const noteClassName = KTV_STATUS_TEXT_CLASS_NAME
  const statusButtonClassName = getUiSectionChipClassName('primary')
  const secondaryStatusButtonClassName = getUiSectionChipClassName('secondary')

  const renderHeader = (
    <KeyTypeValueHeader
      actions={(
        <ExpandCollapseAllButton
          allCollapsed={allCollapsed}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
          titleExpand="Expand all sections"
          titleCollapse="Collapse all sections"
        />
      )}
    />
  )

  const sessionRows = [
    matchesQuery('Display name', displayName, 'peer') && (
      <KeyTypeValueRow
        key="session-display-name"
        keyNode="Display Name"
        typeNode={renderTypeIcon('collaboration.peer')}
        valueNode={(
          <RightAlignedTooltipInput
            tooltip="Name shown to the remote peer."
            value={displayName}
            onChange={event => setDisplayName(event.currentTarget.value)}
            placeholder="Peer"
          />
        )}
      />
    ),
    matchesQuery('Session', sessionId, role, phase) && (
      <KeyTypeValueRow
        key="session-state"
        keyNode="Session"
        typeNode={renderTypeIcon('collaboration.session')}
        valueNode={(
          <RightAlignedValueCell>
            <section className={rowValueClassName}>
              <span className={statusButtonClassName}>
                {role === 'idle' ? 'Idle' : `${role} · ${phase}`}
              </span>
              {ownerPeerId ? (
                <span className={secondaryStatusButtonClassName}>
                  owner {ownerPeerId.slice(0, 8)}
                </span>
              ) : null}
              {localPeerId ? (
                <span className={secondaryStatusButtonClassName}>
                  you {localPeerId.slice(0, 8)}
                </span>
              ) : null}
              {sessionId ? (
                <span className={secondaryStatusButtonClassName}>
                  {sessionId.slice(0, 12)}
                </span>
              ) : null}
            </section>
          </RightAlignedValueCell>
        )}
      />
    ),
    matchesQuery('Peers', peers.length, connectedRemotePeers.length, ownerPeerId) && (
      <KeyTypeValueRow
        key="session-peer-count"
        keyNode="Peer Count"
        typeNode={renderTypeIcon('collaboration.peer')}
        valueNode={(
          <RightAlignedValueCell>
            <section className={rowValueClassName}>
              <span className={statusButtonClassName}>
                total {peers.length}
              </span>
              <span className={secondaryStatusButtonClassName}>
                remote {remotePeers.length}
              </span>
              <span className={secondaryStatusButtonClassName}>
                connected {connectedRemotePeers.length}
              </span>
            </section>
          </RightAlignedValueCell>
        )}
      />
    ),
    matchesQuery('Runtime status', statusText, errorText) && (
      <KeyTypeValueRow
        key="session-status"
        keyNode="Runtime Status"
        typeNode={renderTypeIcon('collaboration.runtime')}
        valueNode={(
          <RightAlignedValueCell>
            <span className={errorText ? UI_THEME_TOKENS.status.error : noteClassName}>
              {errorText || statusText}
            </span>
          </RightAlignedValueCell>
        )}
      />
    ),
    matchesQuery('Follow mode', followModeEnabled ? 'on' : 'off', localCaretLine) && (
      <KeyTypeValueRow
        key="session-follow-mode"
        keyNode="Follow Mode"
        typeNode={renderTypeIcon('collaboration.follow')}
        valueNode={(
          <RightAlignedValueCell>
            <section className={rowValueClassName}>
              <button
                type="button"
                className={followModeEnabled ? activeButtonClassName : buttonClassName}
                onClick={() => setFollowModeEnabled(true)}
              >
                On
              </button>
              <button
                type="button"
                className={!followModeEnabled ? activeButtonClassName : buttonClassName}
                onClick={() => setFollowModeEnabled(false)}
              >
                Off
              </button>
              <span className={noteClassName}>
                {followPeerId ? `Target ${followPeerId.slice(0, 8)}` : 'Select a peer below'}
              </span>
              <span className={noteClassName}>
                {localCaretLine == null ? 'Local cursor idle' : `Local line ${localCaretLine}`}
              </span>
            </section>
          </RightAlignedValueCell>
        )}
      />
    ),
    matchesQuery('Host or disconnect', 'start host', 'disconnect') && (
      <KeyTypeValueRow
        key="session-actions"
        keyNode={hasAuthenticatedRoomTransport ? 'Room Session' : 'Host Session'}
        typeNode={renderTypeIcon('collaboration.connection')}
        valueNode={(
          <RightAlignedValueCell>
            <section className={rowValueClassName}>
              <button
                type="button"
                className={activeButtonClassName}
                onClick={() => queueStartHost()}
              >
                {hostActionLabel}
              </button>
              <button
                type="button"
                className={buttonClassName}
                onClick={() => queueDisconnect()}
              >
                Disconnect
              </button>
            </section>
          </RightAlignedValueCell>
        )}
      />
    ),
  ].filter(Boolean)

  const inviteRows = [
    !hasAuthenticatedRoomTransport && matchesQuery('Invite link', inviteUrl, inviteToken) && (
      <KeyTypeValueRow
        key="invite-link"
        keyNode="Invite Link"
        typeNode={renderTypeIcon('collaboration.link')}
        valueNode={(
          <RightAlignedValueCell>
            <section className="flex w-full min-w-0 flex-wrap items-center gap-1 sm:justify-end">
              <RightAlignedTooltipInput
                tooltip="Share this invite URL with one guest. Generate another invite for each additional peer."
                value={inviteUrl}
                readOnly
                placeholder="Host generates one invite per guest."
                containerClassName={UI_RESPONSIVE_PANEL_FLEX_INPUT_CLASSNAME}
              />
              <button
                type="button"
                className={buttonClassName}
                disabled={!inviteUrl}
                onClick={() => {
                  if (!inviteUrl) return
                  void copyText(inviteUrl, 'Collaboration invite copied')
                }}
              >
                {renderTypeIcon('collaboration.copy')}
                Copy
              </button>
            </section>
          </RightAlignedValueCell>
        )}
      />
    ),
    !hasAuthenticatedRoomTransport && matchesQuery('Join invite', inviteInput, 'guest') && (
      <KeyTypeValueRow
        key="invite-join"
        keyNode="Join Invite"
        typeNode={renderTypeIcon('collaboration.connection')}
        valueNode={(
          <RightAlignedValueCell>
            <section className="flex w-full min-w-0 flex-wrap items-center gap-1 sm:justify-end">
              <RightAlignedTooltipInput
                tooltip="Paste the host invite URL or raw invite token."
                value={inviteInput}
                onChange={event => setInviteInput(event.currentTarget.value)}
                placeholder="Paste invite link or token"
                containerClassName={UI_RESPONSIVE_PANEL_FLEX_INPUT_CLASSNAME}
              />
              <button
                type="button"
                className={activeButtonClassName}
                onClick={() => queueJoinInvite()}
              >
                Join
              </button>
            </section>
          </RightAlignedValueCell>
        )}
      />
    ),
  ].filter(Boolean)

  const answerRows = [
    !hasAuthenticatedRoomTransport && matchesQuery('Guest answer', answerToken, 'copy answer') && (
      <KeyTypeValueRow
        key="answer-token"
        keyNode="Guest Answer"
        typeNode={renderTypeIcon('collaboration.copy')}
        valueNode={(
          <RightAlignedValueCell>
            <section className="flex w-full min-w-0 flex-wrap items-center gap-1 sm:justify-end">
              <RightAlignedTooltipInput
                tooltip="Guest sends this answer token back to the host."
                value={answerToken}
                readOnly
                placeholder="Join an invite to generate the answer token."
                containerClassName={UI_RESPONSIVE_PANEL_FLEX_INPUT_CLASSNAME}
              />
              <button
                type="button"
                className={buttonClassName}
                disabled={!answerToken}
                onClick={() => {
                  if (!answerToken) return
                  void copyText(answerToken, 'Collaboration answer copied')
                }}
              >
                {renderTypeIcon('collaboration.copy')}
                Copy
              </button>
            </section>
          </RightAlignedValueCell>
        )}
      />
    ),
    !hasAuthenticatedRoomTransport && matchesQuery('Apply answer', answerInput, 'host') && (
      <KeyTypeValueRow
        key="answer-apply"
        keyNode="Apply Answer"
        typeNode={renderTypeIcon('collaboration.runtime')}
        valueNode={(
          <RightAlignedValueCell>
            <section className="flex w-full min-w-0 flex-wrap items-center gap-1 sm:justify-end">
              <RightAlignedTooltipInput
                tooltip="Host pastes the guest answer token to finish the WebRTC handshake."
                value={answerInput}
                onChange={event => setAnswerInput(event.currentTarget.value)}
                placeholder="Paste answer token"
                containerClassName={UI_RESPONSIVE_PANEL_FLEX_INPUT_CLASSNAME}
              />
              <button
                type="button"
                className={activeButtonClassName}
                onClick={() => queueApplyAnswer()}
              >
                Connect
              </button>
            </section>
          </RightAlignedValueCell>
        )}
      />
    ),
  ].filter(Boolean)

  const peerRows = [
    ...peers
      .filter(peer => matchesQuery(peer.displayName, peer.documentKey, peer.ownership, peer.connectionState, peer.peerId))
      .map(peer => (
        <KeyTypeValueRow
          key={`peer-roster-${peer.peerId}`}
          keyNode={peer.displayName}
          typeNode={renderTypeIcon('collaboration.peer')}
          valueNode={(
            <RightAlignedValueCell>
              <section className={rowValueClassName}>
                <span className={statusButtonClassName}>
                  {peer.isLocal ? 'You' : peer.ownership === 'owner' ? 'Owner' : 'Guest'}
                </span>
                <span className={secondaryStatusButtonClassName}>
                  {peer.connectionState}
                </span>
                {peer.documentKey ? (
                  <span className={secondaryStatusButtonClassName}>
                    {peer.documentKey}
                  </span>
                ) : null}
                <span className={noteClassName}>
                  {peer.caretLine == null ? 'Cursor idle' : `Line ${peer.caretLine}`}
                </span>
                {!peer.isLocal ? (
                  <>
                    <button
                      type="button"
                      className={followModeEnabled && followPeerId === peer.peerId ? activeButtonClassName : buttonClassName}
                      onClick={() => {
                        setFollowModeEnabled(true)
                        setFollowPeerId(peer.peerId)
                      }}
                    >
                      Follow
                    </button>
                    <button
                      type="button"
                      className={!followModeEnabled || followPeerId !== peer.peerId ? buttonClassName : activeButtonClassName}
                      onClick={() => {
                        if (followPeerId === peer.peerId) {
                          setFollowPeerId(null)
                        }
                      }}
                    >
                      Unfollow
                    </button>
                    {isOwner && peer.ownership !== 'owner' ? (
                      <button
                        type="button"
                        className={buttonClassName}
                        onClick={() => queueRemovePeer(peer.peerId)}
                      >
                        {renderTypeIcon('collaboration.removePeer')}
                        Remove
                      </button>
                    ) : null}
                  </>
                ) : null}
              </section>
            </RightAlignedValueCell>
          )}
        />
      )),
    matchesQuery('Transport', phase, statusText) && (
      <KeyTypeValueRow
        key="peer-transport"
        keyNode="Transport"
        typeNode={phase === 'connected' ? renderTypeIcon('collaboration.runtime') : renderTypeIcon('collaboration.transport')}
        valueNode={(
          <RightAlignedValueCell>
            <span className={noteClassName}>
              {role === 'host'
                ? (
                    hasAuthenticatedRoomTransport
                      ? (phase === 'connected'
                          ? 'Authenticated workspace room relays presence and document sync for the active document.'
                          : 'Connect the authenticated workspace room for the active document.')
                      : (phase === 'connected'
                          ? 'Owner relays presence and document sync across guests.'
                          : 'Awaiting connected guests or a new invite answer.')
                  )
                : (phase === 'connected' ? 'Connected to the owner relay channel.' : 'Awaiting owner channel.')}
            </span>
          </RightAlignedValueCell>
        )}
      />
    ),
  ].filter(Boolean)

  const sectionDescriptors = ([
    { id: 'session', title: 'Session', rows: sessionRows },
    { id: 'invite', title: 'Invite', rows: inviteRows },
    { id: 'answer', title: 'Answer', rows: answerRows },
    { id: 'peer', title: 'Peers', rows: peerRows },
  ] satisfies Array<{ id: SectionId; title: string; rows: React.ReactNode[] }>).filter(
    section => section.rows.length > 0 || (
      !normalizedQuery
      && !(hasAuthenticatedRoomTransport && (section.id === 'invite' || section.id === 'answer'))
    ),
  )

  return (
    <article className="min-h-full flex flex-col space-y-0">
      {renderHeader}
      <KeyTypeValueSectionStack>
        {sectionDescriptors.map((section, index) => (
          <CollapsibleSection
            key={section.id}
            title={section.title}
            collapsed={normalizedQuery ? false : collapsedBySection[section.id]}
            onToggle={() => toggleSection(section.id)}
            flushTop={shouldFlushKeyTypeValueSectionTop(index)}
          >
            <section className="space-y-0.5">
              {section.rows}
            </section>
          </CollapsibleSection>
        ))}
        {!sectionDescriptors.length ? (
          <p className={`px-1 text-xs ${UI_THEME_TOKENS.text.secondary}`}>
            No collaboration rows match the current search query.
          </p>
        ) : null}
      </KeyTypeValueSectionStack>
    </article>
  )
}
