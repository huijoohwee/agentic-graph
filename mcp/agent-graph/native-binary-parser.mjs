import { makeEdge, makeNode, stableEntityId, versionAgentGraphParserOutput } from "./contract.mjs";
import { NATIVE_BINARY_BOUNDS, NATIVE_BINARY_FORMATS } from "./native-binary-contract.mjs";
export const NATIVE_BINARY_PARSER_ID = "local-native-binary-metadata";
export const NATIVE_BINARY_PARSER_VERSION = versionAgentGraphParserOutput("1.0.0");
const { maxReferences: MAX_REFERENCES, maxSections: MAX_SECTIONS, maxNameBytes: MAX_NAME_BYTES,
  maxWasmVectorEntries: MAX_WASM_VECTOR_ENTRIES } = NATIVE_BINARY_BOUNDS;
const SAFE_NAME = new RegExp(`^[A-Za-z0-9._+@/-]{1,${MAX_NAME_BYTES}}$`, "u");
export const NATIVE_BINARY_PARSER_CAPABILITIES = Object.freeze({
  schema: "agentic-graph/native-binary-parser-capabilities/v1", parserId: NATIVE_BINARY_PARSER_ID,
  parserVersion: NATIVE_BINARY_PARSER_VERSION, formats: NATIVE_BINARY_FORMATS, bounds: NATIVE_BINARY_BOUNDS,
  executesTargets: false, loadsTargets: false, emulatesTargets: false, disassemblesTargets: false,
});
function inRange(bytes, offset, length) {
  return Number.isSafeInteger(offset) && Number.isSafeInteger(length)
    && offset >= 0 && length >= 0 && offset + length <= bytes.length;
}
function u16(bytes, offset, littleEndian) {
  return inRange(bytes, offset, 2)
    ? littleEndian ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset)
    : null;
}
function u32(bytes, offset, littleEndian) {
  return inRange(bytes, offset, 4) ? littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset) : null;
}
function u64(bytes, offset, littleEndian) {
  if (!inRange(bytes, offset, 8)) return null;
  const value = littleEndian ? bytes.readBigUInt64LE(offset) : bytes.readBigUInt64BE(offset);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}
function safeName(bytes, offset, length) {
  if (!inRange(bytes, offset, length) || length > 512) return "";
  const end = bytes.indexOf(0, offset);
  const boundedEnd = end >= offset && end < offset + length ? end : offset + length;
  for (let index = offset; index < boundedEnd; index += 1) {
    if (bytes[index] < 0x20 || bytes[index] > 0x7e) return "";
  }
  const value = bytes.subarray(offset, boundedEnd).toString("ascii").trim();
  return SAFE_NAME.test(value) ? value : "";
}
function boundedCString(bytes, offset) {
  if (!inRange(bytes, offset, 1)) return "";
  const end = bytes.indexOf(0, offset);
  return safeName(bytes, offset, Math.min(128, (end < 0 ? bytes.length : end + 1) - offset));
}
function peRvaOffset(rva, sections, headerSize) {
  if (!Number.isSafeInteger(rva) || rva < 0) return null;
  if (rva < headerSize) return rva;
  const section = sections.find((item) => rva >= item.virtualAddress
    && rva - item.virtualAddress < item.rawSize);
  return section ? section.rawOffset + rva - section.virtualAddress : null;
}
function architectureForMachine(machine, format) {
  const common = new Map([
    [3, "x86"], [7, "x86"], [40, "arm"], [62, "x86_64"], [183, "aarch64"],
    [243, "riscv"], [0x14c, "x86"], [0x8664, "x86_64"], [0x1c0, "arm"], [0x1c4, "arm"],
    [0x5032, "riscv32"], [0x5064, "riscv64"], [0x5128, "riscv128"],
    [0xaa64, "arm64"], [0x01000007, "x86_64"], [0x0100000c, "arm64"],
  ]);
  return common.get(machine) || `${format}-machine-${machine}`;
}
function elfDetails(bytes) {
  if (bytes.length < 16) return { format: "ELF", diagnostics: ["header-truncated"] };
  const elfClass = bytes[4], dataEncoding = bytes[5];
  const is64 = elfClass === 2;
  const littleEndian = dataEncoding === 1;
  const headerSize = is64 ? 64 : 52;
  if (![1, 2].includes(elfClass) || ![1, 2].includes(dataEncoding) || bytes.length < headerSize) {
    return { format: "ELF", diagnostics: ["header-invalid-or-truncated"] };
  }
  const machine = u16(bytes, 18, littleEndian), fileType = u16(bytes, 16, littleEndian);
  const entryPoint = is64 ? u64(bytes, 24, littleEndian) : u32(bytes, 24, littleEndian), sectionOffset = is64 ? u64(bytes, 40, littleEndian) : u32(bytes, 32, littleEndian);
  const sectionEntrySize = u16(bytes, is64 ? 58 : 46, littleEndian), sectionCount = u16(bytes, is64 ? 60 : 48, littleEndian);
  const stringTableIndex = u16(bytes, is64 ? 62 : 50, littleEndian);
  const details = [], diagnostics = [];
  const minSectionSize = is64 ? 64 : 40;
  if (sectionCount === 0 && sectionOffset) diagnostics.push("extended-section-numbering-unsupported");
  if (sectionCount > 0 && sectionCount <= MAX_SECTIONS && sectionEntrySize >= minSectionSize
    && sectionOffset !== null && stringTableIndex < sectionCount
    && inRange(bytes, sectionOffset, sectionEntrySize * sectionCount)) {
    const stringHeader = sectionOffset + sectionEntrySize * stringTableIndex;
    const namesOffset = is64 ? u64(bytes, stringHeader + 24, littleEndian) : u32(bytes, stringHeader + 16, littleEndian);
    const namesSize = is64 ? u64(bytes, stringHeader + 32, littleEndian) : u32(bytes, stringHeader + 20, littleEndian);
    const sections = [];
    if (namesOffset !== null && namesSize !== null && inRange(bytes, namesOffset, namesSize)) {
      for (let index = 0; index < sectionCount; index += 1) {
        const header = sectionOffset + index * sectionEntrySize;
        const nameOffset = u32(bytes, header, littleEndian), type = u32(bytes, header + 4, littleEndian);
        const fileOffset = is64 ? u64(bytes, header + 24, littleEndian) : u32(bytes, header + 16, littleEndian);
        const size = is64 ? u64(bytes, header + 32, littleEndian) : u32(bytes, header + 20, littleEndian);
        const link = u32(bytes, header + (is64 ? 40 : 24), littleEndian);
        const entrySize = is64 ? u64(bytes, header + 56, littleEndian) : u32(bytes, header + 36, littleEndian);
        sections.push({ type, fileOffset, size, link, entrySize });
        if (nameOffset === null || nameOffset >= namesSize) continue;
        const name = safeName(bytes, namesOffset + nameOffset, Math.min(128, namesSize - nameOffset));
        if (name) {
          if (details.length >= MAX_REFERENCES) { diagnostics.push("detail-limit-reached"); break; }
          details.push({ kind: "section", name, offset: header, index });
        }
      }
      const symbols = new Set();
      for (const [tableIndex, table] of sections.entries()) {
        if (![2, 11].includes(table.type)) continue;
        if (details.length >= MAX_REFERENCES) {
          if (table.size > 0) diagnostics.push("symbol-limit-reached");
          continue;
        }
        const strings = sections[table.link];
        const minSymbolSize = is64 ? 24 : 16;
        if (!strings || table.entrySize < minSymbolSize || !inRange(bytes, table.fileOffset, table.size)
          || !inRange(bytes, strings.fileOffset, strings.size)) {
          diagnostics.push("symbol-table-invalid-or-truncated");
          continue;
        }
        const count = Math.min(Math.floor(table.size / table.entrySize), MAX_REFERENCES - details.length);
        for (let index = 0; index < count; index += 1) {
          const symbolOffset = table.fileOffset + index * table.entrySize;
          const nameOffset = u32(bytes, symbolOffset, littleEndian);
          const infoOffset = symbolOffset + (is64 ? 4 : 12);
          const info = bytes[infoOffset];
          const sectionIndex = u16(bytes, symbolOffset + (is64 ? 6 : 14), littleEndian);
          const bind = info >> 4;
          if (nameOffset === null || bind < 1 || bind > 2 || sectionIndex === null) continue;
          const name = safeName(bytes, strings.fileOffset + nameOffset, Math.min(128, strings.size - nameOffset));
          const kind = sectionIndex === 0 ? "import" : "export";
          const key = `${kind}:${name}`;
          if (!name || symbols.has(key)) continue;
          symbols.add(key);
          details.push({ kind, name, offset: symbolOffset, index: tableIndex * MAX_SECTIONS + index, itemKind: info & 0x0f });
        }
        if (Math.floor(table.size / table.entrySize) > count) diagnostics.push("symbol-limit-reached");
      }
    } else diagnostics.push("section-name-table-invalid");
  } else if (sectionCount > 0) {
    diagnostics.push("section-table-invalid-or-truncated");
  }
  return {
    format: "ELF",
    architecture: architectureForMachine(machine, "elf"),
    bits: is64 ? 64 : 32,
    byteOrder: littleEndian ? "little-endian" : "big-endian",
    fileType,
    entryPoint,
    entryPointAddressing: "virtual-address",
    detailCount: details.length,
    details,
    diagnostics,
  };
}
function machODetails(bytes) {
  if (bytes.length < 4) return { format: "Mach-O", diagnostics: ["header-truncated"] };
  const magic = bytes.subarray(0, 4).toString("hex");
  const variants = new Map([
    ["cefaedfe", { littleEndian: true, bits: 32 }],
    ["cffaedfe", { littleEndian: true, bits: 64 }],
    ["feedface", { littleEndian: false, bits: 32 }],
    ["feedfacf", { littleEndian: false, bits: 64 }],
  ]);
  const variant = variants.get(magic);
  if (!variant) return { format: "Mach-O", diagnostics: ["header-invalid"] };
  const { littleEndian, bits } = variant, headerSize = bits === 64 ? 32 : 28;
  if (bytes.length < headerSize) return { format: "Mach-O", diagnostics: ["header-truncated"] };
  const machine = u32(bytes, 4, littleEndian), commandCount = u32(bytes, 16, littleEndian), commandBytes = u32(bytes, 20, littleEndian);
  const details = [], diagnostics = [];
  let symbolTable = null;
  const commandEnd = headerSize + commandBytes;
  if (commandCount > NATIVE_BINARY_BOUNDS.maxMachOLoadCommands || !inRange(bytes, headerSize, commandBytes)) {
    diagnostics.push("load-command-table-invalid-or-truncated");
  } else {
    let offset = headerSize;
    const count = Math.min(commandCount, NATIVE_BINARY_BOUNDS.maxMachOLoadCommands);
    for (let index = 0; index < count; index += 1) {
      if (!inRange(bytes, offset, 8)) { diagnostics.push("load-command-truncated"); break; }
      const command = u32(bytes, offset, littleEndian);
      const size = u32(bytes, offset + 4, littleEndian);
      if (!size || size < 8 || offset + size > commandEnd) { diagnostics.push("load-command-invalid"); break; }
      const baseCommand = command & 0x7fffffff;
      if (baseCommand === 2 && size >= 24) {
        symbolTable = { symbolOffset: u32(bytes, offset + 8, littleEndian), symbolCount: u32(bytes, offset + 12, littleEndian),
          stringOffset: u32(bytes, offset + 16, littleEndian), stringSize: u32(bytes, offset + 20, littleEndian) };
      } else if ([0xc, 0xd, 0x18, 0x1f, 0x23].includes(baseCommand) && size >= 24) {
        const nameOffset = u32(bytes, offset + 8, littleEndian);
        const name = nameOffset >= 8 && nameOffset < size
          ? safeName(bytes, offset + nameOffset, size - nameOffset)
          : "";
        if (name && baseCommand !== 0xd) {
          if (details.length >= MAX_REFERENCES) diagnostics.push("detail-limit-reached");
          else details.push({ kind: "dependency", name, offset, index });
        }
      }
      offset += size;
    }
    if (commandCount > count) diagnostics.push("load-command-limit-reached");
  }
  if (symbolTable && symbolTable.symbolCount > 0) {
    const entrySize = bits === 64 ? 16 : 12;
    const count = Math.min(symbolTable.symbolCount, Math.max(0, MAX_REFERENCES - details.length));
    if (!inRange(bytes, symbolTable.symbolOffset, symbolTable.symbolCount * entrySize)
      || !inRange(bytes, symbolTable.stringOffset, symbolTable.stringSize)) {
      diagnostics.push("symbol-table-invalid-or-truncated");
    } else {
      const symbols = new Set();
      for (let index = 0; index < count; index += 1) {
        const offset = symbolTable.symbolOffset + index * entrySize;
        const nameIndex = u32(bytes, offset, littleEndian);
        const type = bytes[offset + 4];
        if (nameIndex === null || type & 0xe0 || !(type & 1)) continue;
        const name = safeName(bytes, symbolTable.stringOffset + nameIndex, Math.min(128, symbolTable.stringSize - nameIndex));
        const kind = (type & 0x0e) === 0 ? "import" : "export";
        const key = `${kind}:${name}`;
        if (!name || symbols.has(key)) continue;
        symbols.add(key);
        details.push({ kind, name, offset, index, itemKind: type & 0x0e });
      }
      if (symbolTable.symbolCount > count) diagnostics.push("symbol-limit-reached");
    }
  }
  return {
    format: "Mach-O",
    architecture: architectureForMachine(machine, "macho"),
    bits,
    byteOrder: littleEndian ? "little-endian" : "big-endian",
    loadCommandCount: commandCount,
    detailCount: details.length,
    details,
    diagnostics,
  };
}
function peDetails(bytes) {
  if (bytes.length < 64) return { format: "PE", diagnostics: ["dos-header-truncated"] };
  const peOffset = u32(bytes, 0x3c, true);
  if (peOffset === null || !inRange(bytes, peOffset, 24)
    || bytes.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
    return { format: "PE", diagnostics: ["signature-invalid-or-truncated"] };
  }
  const machine = u16(bytes, peOffset + 4, true), sectionCount = u16(bytes, peOffset + 6, true);
  const optionalSize = u16(bytes, peOffset + 20, true), optionalOffset = peOffset + 24;
  const optionalMagic = u16(bytes, optionalOffset, true), is64 = optionalMagic === 0x20b, is32 = optionalMagic === 0x10b;
  const details = [], diagnostics = [];
  let entryPoint = null, subsystem = null, headerBytes = 0;
  const sections = [];
  if ((is64 || is32) && optionalSize >= 70 && inRange(bytes, optionalOffset, optionalSize)) {
    entryPoint = u32(bytes, optionalOffset + 16, true);
    subsystem = u16(bytes, optionalOffset + 68, true);
    headerBytes = u32(bytes, optionalOffset + 60, true) ?? 0;
  } else diagnostics.push("optional-header-invalid-or-truncated");
  const sectionOffset = optionalOffset + optionalSize;
  if (sectionCount > MAX_SECTIONS || !inRange(bytes, sectionOffset, sectionCount * 40)) {
    if (sectionCount > 0) diagnostics.push("section-table-invalid-or-truncated");
  } else {
    for (let index = 0; index < sectionCount; index += 1) {
      const offset = sectionOffset + index * 40;
      const name = safeName(bytes, offset, 8);
      sections.push({ virtualAddress: u32(bytes, offset + 12, true), virtualSize: u32(bytes, offset + 8, true),
        rawSize: u32(bytes, offset + 16, true), rawOffset: u32(bytes, offset + 20, true) });
      if (name && details.length < MAX_REFERENCES) details.push({ kind: "section", name, offset, index });
      else if (name) diagnostics.push("detail-limit-reached");
    }
    if (sectionCount > MAX_REFERENCES) diagnostics.push("detail-limit-reached");
  }
  const directoryOffset = optionalOffset + (is64 ? 112 : 96);
  if ((is64 || is32) && optionalSize >= (is64 ? 120 : 104)) {
    for (const [kind, directoryIndex] of [["export", 0], ["import", 1]]) {
      const rva = u32(bytes, directoryOffset + directoryIndex * 8, true), size = u32(bytes, directoryOffset + directoryIndex * 8 + 4, true);
      if (!rva && !size) continue;
      const directory = peRvaOffset(rva, sections, headerBytes);
      if (directory === null) { diagnostics.push(`${kind}-directory-unavailable`); continue; }
      if (kind === "export") {
        if (size < 40 || !inRange(bytes, directory, 40)) { diagnostics.push("export-directory-truncated"); continue; }
        const count = u32(bytes, directory + 24, true);
        const namesRva = u32(bytes, directory + 32, true);
        const names = peRvaOffset(namesRva, sections, headerBytes);
        if (count === null || count > MAX_SECTIONS || names === null || !inRange(bytes, names, count * 4)) {
          diagnostics.push("export-name-table-invalid-or-truncated");
          continue;
        }
        for (let index = 0; index < count && details.length < MAX_REFERENCES; index += 1) {
          const nameRva = u32(bytes, names + index * 4, true);
          const nameOffset = peRvaOffset(nameRva, sections, headerBytes);
          const name = nameOffset === null ? "" : boundedCString(bytes, nameOffset);
          if (name) details.push({ kind: "export", name, offset: nameOffset, index });
        }
      } else {
        if (size < 20) { diagnostics.push("import-directory-truncated"); continue; }
        const declaredDescriptorCount = Math.floor(size / 20), descriptorCount = Math.min(declaredDescriptorCount, MAX_SECTIONS);
        if (declaredDescriptorCount > descriptorCount) diagnostics.push("import-descriptor-limit-reached");
        for (let index = 0; index < descriptorCount && details.length < MAX_REFERENCES; index += 1) {
          const descriptor = directory + index * 20;
          if (!inRange(bytes, descriptor, 20)) { diagnostics.push("import-descriptor-truncated"); break; }
          const lookupRva = u32(bytes, descriptor, true) || u32(bytes, descriptor + 16, true);
          const libraryRva = u32(bytes, descriptor + 12, true);
          if (!lookupRva && !libraryRva) break;
          const libraryOffset = peRvaOffset(libraryRva, sections, headerBytes);
          const library = libraryOffset === null ? "" : boundedCString(bytes, libraryOffset);
          if (library) details.push({ kind: "dependency", name: library, offset: libraryOffset, index });
          const lookup = peRvaOffset(lookupRva, sections, headerBytes);
          if (lookup === null) { diagnostics.push("import-name-table-unavailable"); continue; }
          const width = is64 ? 8 : 4;
          for (let thunk = 0; thunk < MAX_REFERENCES && details.length < MAX_REFERENCES; thunk += 1) {
            const thunkOffset = lookup + thunk * width;
            if (!inRange(bytes, thunkOffset, width)) { diagnostics.push("import-name-table-truncated"); break; }
            const value = is64 ? bytes.readBigUInt64LE(thunkOffset) : BigInt(u32(bytes, thunkOffset, true));
            if (value === 0n) break;
            if (value & (1n << BigInt(width * 8 - 1))) {
              const ordinal = value & ((1n << BigInt(width * 8 - 1)) - 1n);
              details.push({ kind: "import", name: `ordinal_${ordinal}`, offset: thunkOffset, index: details.length });
              continue;
            }
            const nameOffset = peRvaOffset(Number(value) + 2, sections, headerBytes);
            const name = nameOffset === null ? "" : boundedCString(bytes, nameOffset);
            if (name) details.push({ kind: "import", name, offset: nameOffset, index: details.length });
          }
          if (details.length >= MAX_REFERENCES) diagnostics.push("detail-limit-reached");
        }
      }
    }
  }
  return {
    format: "PE",
    architecture: architectureForMachine(machine, "pe"),
    bits: is64 ? 64 : is32 ? 32 : null,
    entryPoint,
    entryPointAddressing: "relative-virtual-address",
    subsystem,
    sectionCount,
    detailCount: details.length,
    details,
    diagnostics,
  };
}
function arDetails(bytes) {
  if (bytes.length < 8 || bytes.toString("ascii", 0, 8) !== "!<arch>\n") {
    return { format: "ar archive", diagnostics: ["header-invalid-or-truncated"] };
  }
  const details = [];
  const diagnostics = [];
  let offset = 8;
  let index = 0;
  while (offset < bytes.length && details.length < MAX_REFERENCES && index < NATIVE_BINARY_BOUNDS.maxArchiveMembers) {
    if (!inRange(bytes, offset, 60)) { diagnostics.push("archive-member-header-truncated"); break; }
    if (bytes.toString("ascii", offset + 58, offset + 60) !== "`\n") {
      diagnostics.push("archive-member-header-invalid");
      break;
    }
    const sizeText = bytes.toString("ascii", offset + 48, offset + 58).trim();
    const size = /^\d+$/u.test(sizeText) ? Number(sizeText) : null;
    if (!Number.isSafeInteger(size) || size < 0 || !inRange(bytes, offset + 60, size)) {
      diagnostics.push("archive-member-size-invalid-or-truncated");
      break;
    }
    const rawName = bytes.toString("ascii", offset, offset + 16).trim().replace(/\/$/u, "");
    if (!rawName || rawName === "/" || rawName === "//") {
      if (rawName !== "/" && rawName !== "//") diagnostics.push("archive-member-name-unavailable");
    } else if (/^\/\d+$/u.test(rawName)) diagnostics.push("archive-long-name-reference-unsupported");
    else if (SAFE_NAME.test(rawName)) {
      details.push({ kind: "member", name: rawName, offset, index, size });
    } else diagnostics.push("archive-member-name-unsupported");
    offset += 60 + size + (size % 2);
    index += 1;
  }
  if (offset < bytes.length && details.length >= MAX_REFERENCES) diagnostics.push("detail-limit-reached");
  if (offset < bytes.length && index >= NATIVE_BINARY_BOUNDS.maxArchiveMembers) diagnostics.push("archive-member-limit-reached");
  return { format: "ar archive", memberCount: index, detailCount: details.length, details, diagnostics };
}
function readUleb(bytes, cursor) {
  let value = 0;
  let shift = 0;
  while (cursor.offset < bytes.length && shift <= 28) {
    const byte = bytes[cursor.offset++];
    value += (byte & 0x7f) * (2 ** shift);
    if (!(byte & 0x80)) return Number.isSafeInteger(value) ? value : null;
    shift += 7;
  }
  return null;
}
function wasmString(bytes, cursor) {
  const length = readUleb(bytes, cursor);
  if (length === null || length > 512 || !inRange(bytes, cursor.offset, length)) return "";
  if (bytes.subarray(cursor.offset, cursor.offset + length).includes(0)) return "";
  const result = safeName(bytes, cursor.offset, length);
  cursor.offset += length;
  return result;
}
function skipLimits(bytes, cursor) {
  const flags = readUleb(bytes, cursor);
  if (flags === null || readUleb(bytes, cursor) === null) return false;
  return !(flags & 1) || readUleb(bytes, cursor) !== null;
}
function wasmDetails(bytes) {
  if (bytes.length < 8) return { format: "WebAssembly", diagnostics: ["header-truncated"] };
  const version = u32(bytes, 4, true), details = [], diagnostics = [];
  if (version !== 1) diagnostics.push("version-unsupported");
  let offset = 8, sectionCount = 0;
  while (offset < bytes.length && sectionCount < MAX_SECTIONS) {
    const cursor = { offset };
    const sectionId = bytes[cursor.offset++];
    const sectionLength = readUleb(bytes, cursor);
    if (sectionLength === null || !inRange(bytes, cursor.offset, sectionLength)) {
      diagnostics.push("section-invalid-or-truncated");
      break;
    }
    const end = cursor.offset + sectionLength;
    if (sectionId === 2 || sectionId === 7) {
      const section = { offset: cursor.offset };
      const count = readUleb(bytes, section);
      if (count === null || count > MAX_WASM_VECTOR_ENTRIES) diagnostics.push("name-vector-invalid");
      else for (let index = 0; index < count && details.length < MAX_REFERENCES; index += 1) {
        const itemOffset = section.offset;
        const firstName = wasmString(bytes.subarray(0, end), section);
        if (!firstName || section.offset >= end) { diagnostics.push("name-vector-truncated"); break; }
        let itemName = firstName;
        let itemKind;
        if (sectionId === 2) {
          const field = wasmString(bytes.subarray(0, end), section);
          if (!field || section.offset >= end) { diagnostics.push("import-descriptor-truncated"); break; }
          itemKind = bytes[section.offset++];
          let valid = true;
          if (itemKind === 0) valid = readUleb(bytes, section) !== null;
          else if (itemKind === 1) {
            valid = section.offset < end;
            if (valid) section.offset += 1;
            if (valid) valid = skipLimits(bytes, section);
          } else if (itemKind === 2) valid = skipLimits(bytes, section);
          else if (itemKind === 3) {
            valid = inRange(bytes, section.offset, 2);
            if (valid) section.offset += 2;
          } else if (itemKind === 4) {
            valid = readUleb(bytes, section) !== null && readUleb(bytes, section) !== null;
          } else valid = false;
          if (!valid || section.offset > end) { diagnostics.push("import-descriptor-invalid"); break; }
          itemName = `${firstName}.${field}`;
        } else {
          itemKind = bytes[section.offset++];
          if (readUleb(bytes, section) === null) {
            diagnostics.push("export-descriptor-truncated");
            break;
          }
        }
        details.push({ kind: sectionId === 2 ? "import" : "export", name: itemName, offset: itemOffset, index: sectionCount * MAX_REFERENCES + index, itemKind });
      }
      if (count > MAX_REFERENCES) diagnostics.push("detail-limit-reached");
    }
    offset = end;
    sectionCount += 1;
  }
  if (sectionCount >= MAX_SECTIONS && offset < bytes.length) diagnostics.push("section-limit-reached");
  return {
    format: "WebAssembly",
    architecture: "wasm",
    bits: null,
    version,
    sectionCount,
    detailCount: details.length,
    details,
    diagnostics,
  };
}
function inspectNativeBinary(bytes) {
  if (bytes.subarray(0, 8).toString("ascii") === "!<arch>\n") return arDetails(bytes);
  if (bytes.subarray(0, 4).toString("hex") === "7f454c46") return elfDetails(bytes);
  const magic = bytes.subarray(0, 4).toString("hex");
  if (["cefaedfe", "cffaedfe", "feedface", "feedfacf"].includes(magic)) return machODetails(bytes);
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return peDetails(bytes);
  if (bytes.subarray(0, 4).toString("hex") === "0061736d") return wasmDetails(bytes);
  return { format: "unknown", details: [], diagnostics: ["signature-unrecognized"] };
}
function edgeLabel(kind) {
  return kind === "section" ? "contains-section"
    : kind === "dependency" ? "loads-library"
      : kind === "member" ? "contains-member"
      : kind === "import" ? "imports" : "exports-symbol";
}
export function createNativeBinaryParser({ parserDescriptorForSource, sourceNodeFor, sourceOnlyFragment }) {
  return (source, options = {}) => {
    const descriptor = parserDescriptorForSource(source, options);
    const base = sourceOnlyFragment(source, descriptor, []);
    const bytes = Buffer.isBuffer(source.bytes) ? source.bytes : null;
    if (!bytes) {
      return {
        ...base,
        diagnostics: [{ code: "native_binary_bytes_unavailable", sourcePath: source.relativePath, message: "Native binary metadata requires bounded source bytes." }],
        status: "error",
      };
    }
    if (bytes.length > NATIVE_BINARY_BOUNDS.maxSourceBytes) {
      return { ...base, diagnostics: [{ code: "native_binary_size_limit_exceeded", sourcePath: source.relativePath,
        message: `Native binary metadata is limited to ${NATIVE_BINARY_BOUNDS.maxSourceBytes} bytes per source.` }], status: "partial" };
    }
    const inspected = inspectNativeBinary(bytes);
    const sourceNode = sourceNodeFor(source, descriptor.parserId, descriptor.parserVersion, descriptor.fidelity, {
      "native:format": inspected.format,
      ...(inspected.architecture ? { "native:architecture": inspected.architecture } : {}),
      ...(Number.isSafeInteger(inspected.memberCount) ? { "native:memberCount": inspected.memberCount } : {}),
    });
    const nodes = [{
      ...sourceNode,
      properties: { ...sourceNode.properties, "native:format": inspected.format },
    }];
    const edges = [];
    const diagnostics = inspected.diagnostics.map((code) => ({
      code: `native_binary_${code.replaceAll("-", "_")}`,
      sourcePath: source.relativePath,
      message: `Native binary metadata is incomplete for ${source.relativePath}.`,
    }));
    options.retainRecord?.("node", "native-binary.source");
    if (inspected.format === "unknown") {
      return { parserId: descriptor.parserId, parserVersion: descriptor.parserVersion, nodes, edges, diagnostics, status: "partial" };
    }
    const artifactId = stableEntityId("NativeBinaryArtifact", source.relativePath, source.contentHash);
    const artifactLabel = `${inspected.format} ${inspected.architecture || "binary"}`;
    const artifactNode = makeNode({
      id: artifactId,
      label: artifactLabel,
      type: "NativeBinaryArtifact",
      sourcePath: source.relativePath,
      properties: {
        "native:format": inspected.format,
        ...(inspected.architecture ? { "native:architecture": inspected.architecture } : {}),
        ...(inspected.bits ? { "native:bits": inspected.bits } : {}),
        ...(inspected.byteOrder ? { "native:byteOrder": inspected.byteOrder } : {}),
        ...(Number.isSafeInteger(inspected.fileType) ? { "native:fileType": inspected.fileType } : {}),
        ...(Number.isSafeInteger(inspected.entryPoint) ? { "native:entryPoint": inspected.entryPoint } : {}),
        ...(inspected.entryPointAddressing ? { "native:entryPointAddressing": inspected.entryPointAddressing } : {}),
        ...(Number.isSafeInteger(inspected.subsystem) ? { "native:subsystem": inspected.subsystem } : {}),
        ...(Number.isSafeInteger(inspected.sectionCount) ? { "native:sectionCount": inspected.sectionCount } : {}),
        ...(Number.isSafeInteger(inspected.loadCommandCount) ? { "native:loadCommandCount": inspected.loadCommandCount } : {}),
        ...(Number.isSafeInteger(inspected.version) ? { "native:version": inspected.version } : {}),
        "native:detailCount": inspected.detailCount ?? 0,
        "native:sourceDigest": source.contentHash,
      },
    });
    options.retainRecord?.("node", "native-binary.artifact");
    nodes.push(artifactNode);
    const evidenceFor = (label, ruleId, explanation, byteOffset = 0) => ({
      sourcePath: source.relativePath,
      sourceDigest: source.contentHash,
      excerpt: `${inspected.format}; ${label}; byteOffset=${byteOffset}`,
      lineStart: 1,
      columnStart: 1,
      ruleId,
      explanation,
      parserId: descriptor.parserId,
      parserVersion: descriptor.parserVersion,
      confidence: "high",
    });
    const sourceEdge = makeEdge({
      source: nodes[0].id,
      target: artifactId,
      label: "has-native-artifact",
      evidence: evidenceFor("format-header", "native.binary.header", `The bounded header identifies ${inspected.format} static binary metadata.`),
      anchor: "native-header",
    });
    options.retainRecord?.("edge", "native-binary.header");
    edges.push(sourceEdge);
    for (const [index, detail] of inspected.details.slice(0, MAX_REFERENCES).entries()) {
      options.checkpoint?.("native-binary-detail");
      if (!SAFE_NAME.test(detail.name)) continue;
      const nodeType = detail.kind === "section" ? "NativeBinarySection"
        : detail.kind === "dependency" ? "NativeBinaryDependency"
          : detail.kind === "member" ? "NativeBinaryMember"
            : detail.kind === "import" ? "NativeBinaryImport" : "NativeBinaryExport";
      const detailId = stableEntityId(nodeType, source.relativePath, `${detail.index}:${detail.name}`);
      const detailNode = makeNode({
        id: detailId,
        label: detail.name,
        type: nodeType,
        sourcePath: source.relativePath,
        properties: {
          "native:format": inspected.format,
          "native:kind": detail.kind,
          "native:index": detail.index,
          "native:byteOffset": detail.offset,
          ...(Number.isSafeInteger(detail.size) ? { "native:byteSize": detail.size } : {}),
          ...(Number.isSafeInteger(detail.itemKind) ? { "native:itemKind": detail.itemKind } : {}),
        },
      });
      options.retainRecord?.("node", `native-binary.detail.${index}`);
      nodes.push(detailNode);
      const edge = makeEdge({
        source: artifactId,
        target: detailId,
        label: edgeLabel(detail.kind),
        evidence: evidenceFor(`${detail.kind}=${detail.name}`, `native.binary.${detail.kind}`, `The ${inspected.format} header structure records ${detail.kind} ${detail.name}.`, detail.offset),
        anchor: `native:${detail.kind}:${detail.index}:${detail.offset}`,
      });
      options.retainRecord?.("edge", `native-binary.edge.${index}`);
      edges.push(edge);
    }
    return {
      parserId: descriptor.parserId,
      parserVersion: descriptor.parserVersion,
      nodes,
      edges,
      diagnostics,
      status: diagnostics.length ? "partial" : "parsed",
    };
  };
}