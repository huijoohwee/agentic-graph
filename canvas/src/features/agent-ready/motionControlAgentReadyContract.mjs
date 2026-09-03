import { MOTION_CONTROL_WEB_MCP_TOOL_IDS } from '../three/motionControlMcpContract.mjs'
import { XR_ANIMATION_WEB_MCP_TOOL_IDS } from '../three/xrAnimationMcpContract.mjs'
import { XR_SCENE_WEB_MCP_TOOL_IDS } from '../three/xrSceneMcpContract.mjs'

export const MOTION_CONTROL_AGENT_READY_TOOL_IDS = Object.freeze({
  inspectLocalMotionControl: MOTION_CONTROL_WEB_MCP_TOOL_IDS.inspect,
  controlLocalMotionControl: MOTION_CONTROL_WEB_MCP_TOOL_IDS.control,
})

const MOTION_CONTROL_INPUT_SCHEMA = Object.freeze({
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['invocation'],
      properties: {
        invocation: { type: 'string', minLength: 1, pattern: '\\S', description: 'Strict native /motion.control @canvas #pose invocation for open, start, stop, record, finish, clear, export, or peer sharing.' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['operation'],
      properties: {
        operation: { const: 'open' },
        boundingBox: { type: 'boolean', description: 'Enable or disable the existing tracked ROI in the local preview and catalog-authored XR subject outlines. Defaults to false for each page session; it does not enable camera object detection.' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['operation'],
      properties: { operation: { const: 'stop' } },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['operation'],
      properties: {
        operation: { const: 'start' },
        backend: { type: 'string', enum: ['auto', 'webgpu', 'wasm'] },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['operation'],
      properties: { operation: { type: 'string', enum: ['record', 'finish', 'clear'] } },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['operation', 'format'],
      properties: {
        operation: { const: 'export' },
        format: { type: 'string', enum: ['json', 'csv'] },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['operation', 'enabled'],
      properties: {
        operation: { const: 'share' },
        enabled: { type: 'boolean' },
      },
    },
  ],
})

function buildMotionControlObjectIdentificationOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['records', 'counts'],
    properties: {
      records: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'label', 'category', 'assetLabel', 'catalogDimensionsMeters', 'selected', 'physicsBodyAttached', 'physicsBodyMode'],
          properties: {
            id: { type: 'string', minLength: 1 },
            label: { type: 'string' },
            category: { type: 'string', enum: ['people', 'animals', 'vehicles', 'furniture', 'props'] },
            assetLabel: { type: 'string', minLength: 1 },
            catalogDimensionsMeters: {
              type: 'array',
              minItems: 3,
              maxItems: 3,
              items: { type: 'number', exclusiveMinimum: 0 },
              description: 'Catalog-local width, height, and depth in meters before authored scale or rotation.',
            },
            selected: { type: 'boolean' },
            physicsBodyAttached: { type: 'boolean' },
            physicsBodyMode: { type: 'string', enum: ['none', 'static', 'dynamic', 'kinematic', 'trigger'] },
          },
        },
      },
      counts: {
        type: 'object',
        additionalProperties: false,
        required: ['total', 'selected', 'physicsAttached'],
        properties: {
          total: { type: 'integer', minimum: 0 },
          selected: { type: 'integer', minimum: 0, maximum: 1 },
          physicsAttached: { type: 'integer', minimum: 0 },
        },
      },
    },
  }
}

function nullableNumber() {
  return { type: ['number', 'null'] }
}

function buildMotionCaptureSourceOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['sourceId', 'captureKind', 'coordinateSpace', 'clockDomain', 'dimensions', 'nominalFps', 'clockAlignment', 'calibration', 'quality', 'latestObservation'],
    properties: {
      sourceId: { type: 'string', minLength: 1, description: 'Opaque, session-local source identity.' },
      captureKind: { type: 'string', enum: ['video', 'depth', 'landmark-stream', 'peer-derived'] },
      coordinateSpace: { type: 'string', enum: ['normalized-image', 'model-relative', 'metric-world'] },
      clockDomain: { type: 'string', enum: ['session-monotonic', 'source-local'] },
      dimensions: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['width', 'height'],
        properties: { width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 } },
      },
      nominalFps: nullableNumber(),
      clockAlignment: {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'offsetMs', 'uncertaintyMs', 'measuredAtMs', 'evidenceDigestSha256', 'provenance', 'researchManifestDigestSha256'],
        properties: {
          status: { type: 'string', enum: ['aligned', 'unaligned'] },
          offsetMs: nullableNumber(),
          uncertaintyMs: nullableNumber(),
          measuredAtMs: nullableNumber(),
          evidenceDigestSha256: { type: ['string', 'null'] },
          provenance: { enum: [null, 'session-clock', 'measured-alignment'] },
          researchManifestDigestSha256: { type: ['string', 'null'], pattern: '^[a-f0-9]{64}$' },
        },
      },
      calibration: {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'coordinateSpace', 'provenance', 'reprojectionErrorPx', 'researchValidation'],
        properties: {
          status: { type: 'string', enum: ['uncalibrated', 'calibrating', 'calibrated', 'invalid'] },
          coordinateSpace: { type: 'string', enum: ['normalized-image', 'model-relative', 'metric-world'] },
          provenance: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['kind', 'measuredAtMs', 'evidenceDigestSha256'],
            properties: {
              kind: { type: 'string', enum: ['operator-verified', 'measured', 'imported'] },
              measuredAtMs: { type: 'number', minimum: 0 },
              evidenceDigestSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
            },
          },
          reprojectionErrorPx: nullableNumber(),
          researchValidation: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['schema', 'researchManifestDigestSha256', 'referenceFrame', 'measurementErrorMeters', 'reprojectionP95Px', 'calibrationSampleCount', 'calibrationPoseCount'],
            properties: {
              schema: { const: 'agentic-graph.motion-capture-calibration-validation/v1' },
              researchManifestDigestSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
              referenceFrame: { const: 'metric-si-right-up-forward' },
              measurementErrorMeters: { type: 'number', minimum: 0 },
              reprojectionP95Px: nullableNumber(),
              calibrationSampleCount: { type: 'integer', minimum: 1 },
              calibrationPoseCount: { type: 'integer', minimum: 1 },
            },
          },
        },
      },
      quality: {
        type: 'object',
        additionalProperties: false,
        required: ['receivedSamples', 'usableSamples', 'researchUsableSamples', 'lowEvidenceSamples', 'missingSamples', 'droppedSequenceSamples', 'unsequencedSamples', 'outOfOrderSamples', 'researchDurationMs', 'jitterMs', 'dropRate'],
        properties: {
          receivedSamples: { type: 'integer', minimum: 0 },
          usableSamples: { type: 'integer', minimum: 0 },
          researchUsableSamples: { type: 'integer', minimum: 0 },
          lowEvidenceSamples: { type: 'integer', minimum: 0 },
          missingSamples: { type: 'integer', minimum: 0 },
          droppedSequenceSamples: { type: 'integer', minimum: 0 },
          unsequencedSamples: { type: 'integer', minimum: 0 },
          outOfOrderSamples: { type: 'integer', minimum: 0 },
          researchDurationMs: { type: 'number', minimum: 0 },
          jitterMs: { type: 'number', minimum: 0 },
          dropRate: { type: 'number', minimum: 0 },
        },
      },
      latestObservation: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['captureTimestampMs', 'alignedTimestampMs', 'receivedAtMs', 'sequence', 'coordinateSpace', 'confidence', 'landmarkCount', 'missing'],
        properties: {
          captureTimestampMs: { type: 'number', minimum: 0 },
          alignedTimestampMs: nullableNumber(),
          receivedAtMs: { type: 'number', minimum: 0 },
          sequence: { type: ['integer', 'null'], minimum: 0 },
          coordinateSpace: { type: 'string', enum: ['normalized-image', 'model-relative', 'metric-world'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          landmarkCount: { type: 'integer', minimum: 0 },
          missing: { type: 'boolean' },
        },
      },
    },
  }
}

function buildMotionCapturePlatformOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['schema', 'sessionId', 'revision', 'sources', 'evidence', 'recording', 'bridge', 'privacy'],
    properties: {
      schema: { const: 'agentic-graph.motion-capture-platform/v1' },
      sessionId: { type: 'string', minLength: 1 },
      revision: { type: 'integer', minimum: 0 },
      sources: { type: 'array', maxItems: 8, items: buildMotionCaptureSourceOutputSchema() },
      evidence: {
        type: 'object',
        additionalProperties: false,
        required: ['tier', 'researchReady', 'activeSourceCount', 'alignedSourceCount', 'synchronizedSourceCount', 'maxSkewMs', 'maxClockUncertaintyMs', 'maxJitterMs', 'dropRate', 'missingSamples', 'warnings'],
        properties: {
          tier: { enum: [null, 'single-view-control', 'time-aligned-multi-source', 'calibrated-metric-reconstruction'] },
          researchReady: { type: 'boolean' },
          activeSourceCount: { type: 'integer', minimum: 0 },
          alignedSourceCount: { type: 'integer', minimum: 0 },
          synchronizedSourceCount: { type: 'integer', minimum: 0 },
          maxSkewMs: nullableNumber(),
          maxClockUncertaintyMs: nullableNumber(),
          maxJitterMs: { type: 'number', minimum: 0 },
          dropRate: { type: 'number', minimum: 0 },
          missingSamples: { type: 'integer', minimum: 0 },
          warnings: { type: 'array', items: { type: 'string' } },
        },
      },
      recording: {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'recordingId', 'startedAtMs', 'finishedAtMs', 'sampleCount', 'landmarkCount', 'droppedByBudget', 'maxSamples'],
        properties: {
          status: { type: 'string', enum: ['idle', 'recording', 'stopped'] },
          recordingId: { type: ['string', 'null'] },
          startedAtMs: nullableNumber(),
          finishedAtMs: nullableNumber(),
          sampleCount: { type: 'integer', minimum: 0 },
          landmarkCount: { type: 'integer', minimum: 0 },
          droppedByBudget: { type: 'integer', minimum: 0 },
          maxSamples: { type: 'integer', minimum: 1 },
        },
      },
      bridge: {
        type: 'object',
        additionalProperties: false,
        required: ['builtInSourceActive', 'lastError', 'providerApi'],
        properties: {
          builtInSourceActive: { type: 'boolean' },
          lastError: { type: 'string' },
          providerApi: {
            type: 'object',
            additionalProperties: false,
            required: ['schema', 'connectedProviderCount', 'providers'],
            properties: {
              schema: { const: 'agentic-graph.motion-capture-provider-api/v1' },
              connectedProviderCount: { type: 'integer', minimum: 0 },
              providers: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['providerId', 'label', 'transport'],
                  properties: {
                    providerId: { type: 'string', minLength: 1 },
                    label: { type: 'string', minLength: 1 },
                    transport: { type: 'string', enum: ['browser-local', 'host-bridge', 'network-peer'] },
                  },
                },
              },
            },
          },
        },
      },
      privacy: {
        type: 'object',
        additionalProperties: false,
        required: ['frameUpload', 'framePersistence', 'rawTensorRetention', 'recordingScope'],
        properties: {
          frameUpload: { const: false },
          framePersistence: { const: false },
          rawTensorRetention: { const: false },
          recordingScope: { const: 'derived-landmarks-only' },
        },
      },
    },
  }
}

function buildMotionCapturePeerSharingOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['schema', 'available', 'enabled', 'connectedPeerCount', 'lastDeliveryStatus', 'lastError', 'revision'],
    properties: {
      schema: { const: 'agentic-graph.motion-capture-peer/v1' },
      available: { type: 'boolean' },
      enabled: { type: 'boolean' },
      connectedPeerCount: { type: 'integer', minimum: 0 },
      lastDeliveryStatus: { type: 'string', enum: ['idle', 'sent', 'not-connected', 'invalid-payload', 'payload-too-large', 'throttled', 'backpressure', 'error'] },
      lastError: { type: 'string' },
      revision: { type: 'integer', minimum: 0 },
    },
  }
}

function buildMotionControlTargetsOutputSchema(buildWebName) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['selectedHumanoid', 'surfaces'],
    properties: {
      selectedHumanoid: {
        type: 'object',
        additionalProperties: false,
        required: ['actorId', 'label', 'compatible', 'assignedPresetId'],
        properties: {
          actorId: { type: 'string' },
          label: { type: 'string' },
          compatible: { type: 'boolean' },
          assignedPresetId: { type: 'string' },
        },
      },
      surfaces: {
        type: 'object',
        additionalProperties: false,
        required: ['xr3d', 'animation', 'gameMode'],
        properties: {
          xr3d: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'view', 'sceneReady', 'subjectCount', 'objectIdentification', 'controllerMode', 'controllerPhase', 'invocation', 'webMcpTool'],
            properties: {
              label: { const: '3D for XR' },
              view: { const: 'media' },
              sceneReady: { type: 'boolean' },
              subjectCount: { type: 'integer', minimum: 0 },
              objectIdentification: buildMotionControlObjectIdentificationOutputSchema(),
              controllerMode: { type: 'string', enum: ['ball', 'rocket'] },
              controllerPhase: { type: 'string', enum: ['off', 'ready', 'running', 'paused'] },
              invocation: { type: 'string', minLength: 1 },
              webMcpTool: { const: buildWebName(XR_SCENE_WEB_MCP_TOOL_IDS.control) },
            },
          },
          animation: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'view', 'sceneReady', 'selectedTarget', 'invocation', 'webMcpTool'],
            properties: {
              label: { const: 'Animation' },
              view: { const: 'animation' },
              sceneReady: { type: 'boolean' },
              selectedTarget: {
                type: 'object',
                additionalProperties: false,
                required: ['actorId', 'label', 'livePoseCompatible', 'assignedPresetId', 'recommendedPresetId', 'compatible'],
                properties: {
                  actorId: { type: 'string' },
                  label: { type: 'string' },
                  livePoseCompatible: { type: 'boolean' },
                  assignedPresetId: { type: 'string' },
                  recommendedPresetId: { type: 'string' },
                  compatible: { type: 'boolean' },
                },
              },
              invocation: { type: 'string', minLength: 1 },
              webMcpTool: { const: buildWebName(XR_ANIMATION_WEB_MCP_TOOL_IDS.control) },
            },
          },
          gameMode: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'view', 'active', 'surfaceMode', 'simulationStatus', 'phase', 'enemiesAlive', 'invocation', 'webMcpTool'],
            properties: {
              label: { const: 'Game Mode' },
              view: { const: 'gameMode' },
              active: { type: 'boolean' },
              surfaceMode: { type: 'string', const: 'xr' },
              simulationStatus: { type: 'string', enum: ['idle', 'ready', 'running', 'paused'] },
              phase: { type: 'string', enum: ['stopped', 'playing', 'won', 'lost'] },
              enemiesAlive: { type: 'integer', minimum: 0, maximum: 4 },
              invocation: { type: 'string', pattern: '^/game\\.mode\\s+@canvas\\s+#gameplay' },
              webMcpTool: { const: buildWebName('control_local_game_mode') },
            },
          },
        },
      },
    },
  }
}

export function buildMotionControlAgentReadyToolContracts({ buildWebName, readOnlyAnnotations, mutationAnnotations }) {
  return [{
    name: MOTION_CONTROL_AGENT_READY_TOOL_IDS.inspectLocalMotionControl,
    webName: buildWebName(MOTION_CONTROL_AGENT_READY_TOOL_IDS.inspectLocalMotionControl),
    title: 'Inspect Local Motion Control',
    description: 'Inspect browser-local pose capture, opaque provider-neutral sources, clock/calibration and quality evidence, bounded derived-landmark recording, peer-sharing readiness, accelerator telemetry, canonical XR targets, privacy, and native /motion.control @canvas #pose grammar without exposing frames, tensors, landmarks, device identities, peer identities, endpoints, or export bytes.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: {
      type: 'object',
      additionalProperties: true,
      required: ['schema', 'webMcpTools', 'invocationGrammar', 'model', 'runtime', 'preview', 'privacy', 'targets', 'capturePlatform', 'peerSharing'],
      properties: {
        preview: {
          type: 'object',
          additionalProperties: false,
          required: ['boundingBoxEnabled', 'boundingBoxAvailable'],
          properties: {
            boundingBoxEnabled: { type: 'boolean', description: 'Whether the shared local-pose ROI and authored-XR-outline preference is enabled.' },
            boundingBoxAvailable: { type: 'boolean', description: 'Whether current single-person pose tracking has a transient camera ROI; unrelated to authored XR subject records.' },
          },
        },
        targets: buildMotionControlTargetsOutputSchema(buildWebName),
        capturePlatform: buildMotionCapturePlatformOutputSchema(),
        peerSharing: buildMotionCapturePeerSharingOutputSchema(),
      },
    },
    annotations: readOnlyAnnotations,
  }, {
    name: MOTION_CONTROL_AGENT_READY_TOOL_IDS.controlLocalMotionControl,
    webName: buildWebName(MOTION_CONTROL_AGENT_READY_TOOL_IDS.controlLocalMotionControl),
    title: 'Control Local Motion Control',
    description: 'Open, start, stop, record, finish, clear, export, or explicitly share derived human-pose observations in XR Mode through structured input or the native /motion.control, @canvas, and #pose grammar. Export returns metadata only; peer sharing reuses an active collaboration session and never creates an endpoint. This does not enable camera object detection.',
    inputSchema: MOTION_CONTROL_INPUT_SCHEMA,
    outputSchema: { type: 'object', additionalProperties: true, required: ['ok', 'message'] },
    annotations: mutationAnnotations,
  }]
}
