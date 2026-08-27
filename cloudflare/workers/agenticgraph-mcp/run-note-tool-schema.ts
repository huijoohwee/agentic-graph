import { z } from "zod";

export const RUN_NOTE_INPUT = {
  run_id: z.string().min(1).max(128),
  note: z.string().min(1).max(2000),
};

export const RUN_NOTE_OUTPUT = {
  ok: z.literal(true),
  run_id: z.string(),
  note: z.string(),
  revision: z.number().int().min(1),
  execution_receipt: z.object({
    schema: z.literal("knowgrph-tool-execution-receipt/v1"),
    idempotencyKey: z.string().regex(/^[a-f0-9]{64}$/u),
    requestDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    status: z.enum(["applied", "replayed"]),
  }).strict(),
};
