---
title: "agentic-graph Apple Spatial Input SSOT Distribution"
doc_type: "Source Ownership and Distribution Contract"
status: "protected-integrated"
lang: "en-US"
frontmatter_contract: "required"
runtime_scope: "Apple spatial input, browser sensors, flight, and camera primitives"
deploy_boundary: "consumer deployment remains downstream-owned"
---

# agentic-graph Apple Spatial Input SSOT Distribution

## Root owner

agentic-graph `packages/apple-spatial-input` is the sole authored TypeScript backend
for Apple spatial-input profiles and filtering, Safari sensor lifecycle, input
arbitration, deterministic flight dynamics and envelope projection, and pure
camera follow-target calculation. The root `Package.swift` and
`packages/apple-spatial-input-swift` are the sole authored Swift backend for the
matching SpatialCore, Core Motion, and RealityKit flight contracts.

agentic-graph and GameXR may own different frontend composition, visual assets,
scene authoring, controls, and product styling. Within this shared backend
scope, GameXR must not author a parallel filter, controller, flight model,
camera-target resolver, Swift model, or compatibility implementation.

## Immutable consumption

GameXR's offline and zero-infrastructure web build consumes an
exact npm-compatible tarball generated from the agentic-graph TypeScript package.
The consumer must lock the tarball identity and integrity; generated package
contents are distribution artifacts, not a second source tree.

The GameXR native adapter consumes the agentic-graph root SwiftPM products at
an exact protected repository revision. Sibling `file:` imports, source aliases,
copy fallbacks, version ranges, and runtime network fetches are forbidden for
both distribution routes. A missing or mismatched artifact must fail closed.

## Proof and release gates

The protected source requires the standalone TypeScript build and tests,
agentic-graph consumer tests, duplicate-owner guards, Flight readiness checks, and
Swift package tests. Artifact packing, integrity capture, GameXR installation,
isolated offline builds, and exact-revision consumer tests are separate gates.

PR #734 is protected-integrated as agentic-graph revision
`1288749a170e1e5790fccd4130e8f76562370745`. GameXR revision
`31512869dd041cf02ee6a2140e50ed2c8bb599f1` locks the generated browser artifact
and SwiftPM dependency to that revision and passes browser, Swift package, iOS
Simulator, and visionOS Simulator checks.

Those checks do not certify physical Safari, iPhone/iPad sensor behavior, or
Apple Vision Pro execution. Production and Cloudflare remain downstream release
receipts; they neither republish the agentic-graph package nor create another backend
owner.
