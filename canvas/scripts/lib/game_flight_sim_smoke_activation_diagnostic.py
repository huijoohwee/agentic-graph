from __future__ import annotations

from typing import Any

from playwright.sync_api import Page


def read_source_activation_diagnostic(page: Page, observe: bool = False) -> dict[str, Any]:
    return page.evaluate(
        """
        async observe => {
          const store = await window.__kgFlightSimBrowserProof.importModule('graphStore')
          const demos = await window.__kgFlightSimBrowserProof.importModule('workspaceRunReadyDemos')
          const startup = await window.__kgFlightSimBrowserProof.importModule('canvasStartupDebug')
          const [runtime, ready, geo, deadlines, flightAdmission] = await Promise.all(['flightSimRuntime', 'sourceFilesBootstrapReadiness', 'gympgrphStore', 'flightSimDeadlineRuntime'].map(key => window.__kgFlightSimBrowserProof.importModule(key)).concat(window.__kgFlightSimBrowserProof.importModule('flightSimRunReadyDemoRuntime')))
          if (observe && (!window.__kgFlightActivationObservation || window.__kgFlightActivationObservation.closed)) {
            const events = [], timers = []; let sawActive = false; const unsubs = []
            const capture = (sampleMap = false) => { try { if (observation.closed) return; if (events.length >= 20) { observation.close(); return }; const captureStartedAtMs = performance.now(); const flight = runtime.readFlightSimSnapshot()
              const map = sampleMap === true ? geo.readActiveMapLibreMap() : null, style = map?.getStyle(), hud = document.querySelector('[data-kg-flight-sim-hud="1"]')
              const root = map?.getContainer()?.parentElement, overlay = geo.readFlightGeoOverlay(), bootstrap = ready.readSourceFilesBootstrapSnapshot()
              const sources = Object.keys(style?.sources || {}).filter(id => /flight/i.test(id)).slice(0, 4).map(id => { const source = map.getSource(id); const data = source?.serialize?.().data; return {id, loaded: source?.loaded?.(), featureCount: data?.features?.length ?? null} })
              events.push({at: Math.round(performance.now()), deadlines: deadlines.readFlightSimDeadlineSnapshot(), flight: {active: flight.active, phase: flight.phase, revision: flight.revision, error: String(flight.runtimeError || '').slice(0, 400)}, bootstrap: {phase: bootstrap.phase, intentPhase: bootstrap.documentIntentPhase, intentKey: String(bootstrap.documentIntentKey || '').slice(0, 256)}, hudRevision: hud?.getAttribute('data-kg-flight-sim-revision') ?? null, overlay: overlay ? {active: overlay.active, phase: overlay.phase, profileId: overlay.profileId, revision: String(overlay.revision).slice(0, 160), routeCount: overlay.route.length} : null, sources, styleMetadata: Object.fromEntries(Object.entries(style?.metadata || {}).slice(0, 8).map(([key, value]) => [key, String(value).slice(0, 128)])), camera: map ? {center: map.getCenter().toArray(), bearing: map.getBearing(), pitch: map.getPitch(), zoom: map.getZoom()} : null, styleLoaded: map?.isStyleLoaded(), mapData: Object.fromEntries(Object.entries(root?.dataset || {}).filter(([key]) => /flight|bootstrap/i.test(key)).slice(0, 24).map(([key, value]) => [key, String(value).slice(0, 160)]))})
              Object.assign(events[events.length - 1], {captureStartedAtMs, captureCompletedAtMs: performance.now()})
              if (events.length > 20) events.shift()
              if (flight.active && !sawActive && timers.length < 8) for (const ms of [100, 500, 1500, 2500]) timers.push(setTimeout(() => capture(true), ms))
              sawActive = flight.active
            } catch (error) { events.push({diagnosticError: String(error).slice(0, 300)}); if (events.length > 20) events.shift() } }
            const observation = {events, startedAtMs: performance.now(), closed: false, capture, close: () => {if (observation.closed) return; observation.closed = true; unsubs.forEach(unsub => unsub()); timers.forEach(clearTimeout)}}
            window.__kgFlightActivationObservation = observation; window.__kgFlightStartupProfile?.start(); unsubs.push(runtime.subscribeFlightSimSnapshot(capture), ready.subscribeSourceFilesBootstrapReady(capture)); timers.push(setTimeout(observation.close, 6000)); capture()
          }
          if (!observe) { window.__kgFlightActivationObservation?.capture(); window.__kgFlightActivationObservation?.close() }
          const state = store.useGraphStore.getState()
          const normalize = value => String(value || '').replace(/^workspace:/, '')
            .replace(/^\/+/, '').toLowerCase()
          const documentName = state.markdownDocumentName
          const documentText = state.markdownDocumentText
          const files = Array.isArray(state.sourceFiles) ? state.sourceFiles : []
          const matches = files.filter(file =>
            normalize(file?.source?.path) === normalize(documentName)
            || normalize(file?.name) === normalize(documentName))
          return {
            activationObservation: window.__kgFlightActivationObservation?.events || [], observationStartedAtMs: window.__kgFlightActivationObservation?.startedAtMs ?? null, observationTruncated: window.__kgFlightActivationObservation?.events.length >= 20, deadlines: deadlines.readFlightSimDeadlineSnapshot(),
            documentName, documentTextLength: String(documentText || '').length,
            startup: {runtimeMounted: startup.__canvasStartupDebug.runtimeMounted, sourceBootstrapMounted: startup.__canvasStartupDebug.sourceBootstrapMounted, hydrateRuns: startup.__canvasStartupDebug.sourceBootstrapHydrateRuns, flightAdmission: flightAdmission.readFlightSimRunReadyDemoDiagnostic()},
            active: demos.isFlightSimRunReadyDemoActive(documentName, documentText),
            activation: demos.diagnoseWorkspaceRunReadyDemoActivation(documentName, documentText),
            sourceFileCount: files.length, matchingSourceFileCount: matches.length,
            sources: matches.slice(0, 3).map(file => ({
              id: file.id, name: file.name, source: file.source, enabled: file.enabled, status: file.status,
              error: String(file.error || '').slice(0, 500),
              textLength: String(file.text || '').length,
              textMatchesActiveDocument: file.text === documentText,
              parsedParserId: file.parsedParserId || null, parsedTextHash: file.parsedTextHash || null, parsedGraphRevision: file.parsedGraphRevision ?? null,
              parsedGraphNodes: file.parsedGraphData?.nodes?.length ?? null,
              parsedGraphEdges: file.parsedGraphData?.edges?.length ?? null,
            })),
            toasts: (state.uiToasts || []).filter(toast =>
              /flight/i.test(`${toast.id} ${toast.message}`)).slice(-3)
              .map(toast => ({id: toast.id, kind: toast.kind,
                message: String(toast.message || '').slice(0, 500)})),
          }
        }
        """,
        observe,
    )


