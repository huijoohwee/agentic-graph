import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";

export async function syncSkillEvolutionDirectory(directoryPath) {
  let handle;
  try {
    handle = await open(directoryPath, "r");
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR"].includes(error?.code)) throw error;
  } finally {
    await handle?.close();
  }
}

export async function atomicWriteSkillEvolutionJson(filePath, value, assertCommitOwned) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await assertCommitOwned();
    await rename(temporaryPath, filePath);
    await syncSkillEvolutionDirectory(path.dirname(filePath));
  } catch (error) {
    await handle?.close().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}
