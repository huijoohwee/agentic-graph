import fs from "node:fs/promises";

import { withKnowledgeGraphIngestLock } from "../../knowledge-graph/ingest-lock.mjs";

const delay = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
const markerExists = async (markerPath) => fs.access(markerPath).then(() => true, () => false);
const {
  KG_LOCK_ACQUIRED,
  KG_LOCK_MODE,
  KG_LOCK_POINTER,
  KG_LOCK_READY,
  KG_LOCK_RELEASE,
  KG_LOCK_ROOT,
  KG_LOCK_STARTED,
} = process.env;

if (KG_LOCK_MODE === "waiter") await fs.writeFile(KG_LOCK_STARTED, "started\n");
await withKnowledgeGraphIngestLock(
  KG_LOCK_POINTER,
  { allowedRoot: KG_LOCK_ROOT },
  async () => {
    if (KG_LOCK_MODE === "holder") {
      await fs.writeFile(KG_LOCK_READY, "ready\n");
      while (!(await markerExists(KG_LOCK_RELEASE))) await delay(10);
      return;
    }
    await fs.writeFile(KG_LOCK_ACQUIRED, "acquired\n");
    if (KG_LOCK_MODE === "abandon") process.exit(0);
  },
);
