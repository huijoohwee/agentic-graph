---
title: MapLibre production dependency compatibility
doc_type: Runtime Guide
status: active
---

# MapLibre production dependency compatibility

MapLibre 6.4.1 fixes GHSA-jrc7-96c5-q579. Both Canvas and gympgrph use
the same exact patched release. Canvas still bundles the shipped TypeScript
source for its shared geometry and chunk ownership contracts; the build resolves
the exported package metadata first because version 6 closes private subpath
exports. The dependency security candidate must include this compatibility commit
and regenerate its root lockfile before integration.

Validation belongs to the combined dependency candidate: clean install, audit,
Canvas/gympgrph typechecks, Pages build, geospatial behavior and browser smoke.
This source change does not authorize or prove production deployment.
