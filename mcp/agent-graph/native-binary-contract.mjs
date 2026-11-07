export const NATIVE_BINARY_BOUNDS = Object.freeze({
  maxSourceBytes: 8_388_608,
  maxReferences: 96,
  maxSections: 256,
  maxMachOLoadCommands: 4_096,
  maxArchiveMembers: 65_536,
  maxWasmVectorEntries: 4_096,
  maxNameBytes: 128,
});

export const NATIVE_BINARY_FORMATS = Object.freeze([
  Object.freeze({ format: 'ELF', variants: ['32-bit', '64-bit'], records: ['section', 'import', 'export'] }),
  Object.freeze({ format: 'Mach-O', variants: ['thin 32-bit', 'thin 64-bit'], records: ['dependency', 'import', 'export'] }),
  Object.freeze({ format: 'PE', variants: ['PE32', 'PE32+'], records: ['section', 'dependency', 'import', 'export'] }),
  Object.freeze({ format: 'WebAssembly', variants: ['version 1'], records: ['import', 'export'] }),
  Object.freeze({ format: 'ar archive', variants: ['GNU/System V member headers'], records: ['member'] }),
]);
