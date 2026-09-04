import fs from "node:fs/promises";

import { withAgentGraphIngestLock } from "../../agent-graph/ingest-lock.mjs";

const delay = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
const markerExists = async (markerPath) => fs.access(markerPath).then(() => true, () => false);
const {
  AG_LOCK_ACQUIRED,
  AG_LOCK_MODE,
  AG_LOCK_POINTER,
  AG_LOCK_READY,
  AG_LOCK_RELEASE,
  AG_LOCK_ROOT,
  AG_LOCK_STARTED,
} = process.env;

if (AG_LOCK_MODE === "waiter") await fs.writeFile(AG_LOCK_STARTED, "started\n");
await withAgentGraphIngestLock(
  AG_LOCK_POINTER,
  { allowedRoot: AG_LOCK_ROOT },
  async () => {
    if (AG_LOCK_MODE === "holder") {
      await fs.writeFile(AG_LOCK_READY, "ready\n");
      while (!(await markerExists(AG_LOCK_RELEASE))) await delay(10);
      return;
    }
    await fs.writeFile(AG_LOCK_ACQUIRED, "acquired\n");
    if (AG_LOCK_MODE === "abandon") process.exit(0);
  },
);
