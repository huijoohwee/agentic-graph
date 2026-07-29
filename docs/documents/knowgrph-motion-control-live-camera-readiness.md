---
title: "Knowgrph Motion Control Live Camera Readiness"
doc_type: "Runtime Readiness Contract"
status: "runtime-ready-dev"
lang: "en-US"
frontmatter_contract: "required"
runtime_scope: "XR Mode and FloatingPanel Motion Control"
deploy_boundary: "Dev-only"
---

# Knowgrph Motion Control Live Camera Readiness

## Acceptance owner

`npm run motion-control:runtime-ready` is the local acceptance command. It runs the focused Motion Control source contracts, the camera-free real-model LiteRT proof, and the production capture proof. Both browser proofs require a fresh runner-owned Vite server and bind their evidence to the exact task revision or to a detached checkout whose revision exactly equals `origin/main`.

The production proof starts and stops through native `/motion.control @canvas #pose` invocations handled by `motionControlMcpRuntime`. That shared owner opens XR through `motionControlSurfaceRuntime`, calls the production capture lifecycle, obtains the stream through the browser's real `navigator.mediaDevices.getUserMedia` implementation, waits for one camera frame to complete production LiteRT inference, and observes the registered capture-platform source and capture-time timestamp. The evidence also asserts the existing WebMCP inspect/control tool identifiers; no second tool or invocation grammar is introduced.

## Deterministic device boundary

Automation grants camera permission to an isolated browser context and launches Chromium's built-in virtual media device. The harness wraps the native `getUserMedia` method only to observe its returned stream; it does not fabricate a `MediaStream`, replace production preprocessing, stub the model, or inject inference output.

This Chromium virtual camera proof establishes browser permission, media-stream acquisition, full-body model execution on a camera frame, capture-time platform ingestion, and capture release. It does not prove physical-camera behavior, camera quality, effective WebGPU delegation, or a positive human pose. The evidence records `physicalCameraExercised=false` and does not claim that a person was detected when the deterministic virtual frame produces no accepted pose.

## Release and privacy assertions

Before Stop, the returned stream is active, every captured track is `live`, the runtime is `running`, and the built-in platform source has an inference-derived observation. After Stop, every captured media track reaches `ended`, the stream is inactive, runtime camera state is off, and the transient platform source list is empty.

The capture phase permits local `GET`/`HEAD` module, model, and Wasm reads only. A state-changing or non-local network request fails the proof. Evidence is written only to the ignored local `data/outputs/motion-control-live-camera-browser-smoke.json` path. The command performs no Prod or Cloudflare mutation.

Physical-device validation remains a separate operator-owned acceptance step because it requires explicit permission, a known camera, a centered full-body subject, and hardware-specific measurements that deterministic CI cannot honestly supply.
