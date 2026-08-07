---
title: "Knowgrph Apple Spatial Input SSOT Distribution"
doc_type: "Source Ownership and Distribution Contract"
status: "source-candidate"
lang: "en-US"
frontmatter_contract: "required"
runtime_scope: "Apple spatial input, browser sensors, flight, and camera primitives"
deploy_boundary: "protected integration required"
---

# Knowgrph Apple Spatial Input SSOT Distribution

## Root owner

Knowgrph `packages/apple-spatial-input` is the sole authored TypeScript backend
for Apple spatial-input profiles and filtering, Safari sensor lifecycle, input
arbitration, deterministic flight dynamics and envelope projection, and pure
camera follow-target calculation. The root `Package.swift` and
`packages/apple-spatial-input-swift` are the sole authored Swift backend for the
matching SpatialCore, Core Motion, and RealityKit flight contracts.

Knowgrph and GameXR may own different frontend composition, visual assets,
scene authoring, controls, and product styling. Within this shared backend
scope, GameXR must not author a parallel filter, controller, flight model,
camera-target resolver, Swift model, or compatibility implementation.

## Immutable consumption

GameXR's offline and zero-infrastructure web build is intended to consume an
exact npm-compatible tarball generated from the Knowgrph TypeScript package.
The consumer must lock the tarball identity and integrity; generated package
contents are distribution artifacts, not a second source tree.

Native consumers are intended to consume the Knowgrph root SwiftPM products at
an exact protected repository revision. Sibling `file:` imports, source aliases,
copy fallbacks, version ranges, and runtime network fetches are forbidden for
both distribution routes. A missing or mismatched artifact must fail closed.

## Proof and release gates

The source candidate requires the standalone TypeScript build and tests,
Knowgrph consumer tests, duplicate-owner guards, Flight readiness checks, and
Swift package tests. Artifact packing, integrity capture, GameXR installation,
isolated offline builds, and exact-revision consumer tests are separate gates.

No npm publication, GameXR integration, SwiftPM consumption, physical Safari,
iOS, iPadOS, or visionOS execution, Production release, or Cloudflare deployment
is claimed until PR #734 is protected-integrated and each consumer is verified
against that exact protected revision and immutable artifact.
