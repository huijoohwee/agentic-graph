import {
  VOICE_STUDIO_INPUT_SCHEMA,
  VOICE_STUDIO_OUTPUT_SCHEMA,
  VOICE_STUDIO_TOOL_NAME,
} from "../contracts/voice-studio.schema.js";

const VOICE_STUDIO_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
});

export const buildVoiceStudioLocalToolDefinition = ({ withDefaults } = {}) => {
  const tool = {
    name: VOICE_STUDIO_TOOL_NAME,
    title: "Knowgrph AI Voice Studio",
    description: "Provider-neutral voice profile, speech-to-text, and disclosed text-to-speech facade. Dry-run is deterministic and zero-call. Live mode requires separate host-owned exact approval, rights, source-resolution, zero-spend estimate/execution adapter, settled-cost verifier, and output read-back owners; the canonical provider-unconfigured server fails before egress or spend.",
    inputSchema: VOICE_STUDIO_INPUT_SCHEMA,
    outputSchema: VOICE_STUDIO_OUTPUT_SCHEMA,
  };
  return typeof withDefaults === "function"
    ? withDefaults(tool, VOICE_STUDIO_ANNOTATIONS)
    : { ...tool, annotations: { ...VOICE_STUDIO_ANNOTATIONS } };
};
