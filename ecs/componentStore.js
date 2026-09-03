const INITIAL_CAPACITY = 8;

const FIELD_TYPES = Object.freeze({
  f32: Float32Array,
  f64: Float64Array,
  i8: Int8Array,
  i16: Int16Array,
  i32: Int32Array,
  u8: Uint8Array,
  u16: Uint16Array,
  u32: Uint32Array,
});

const INTEGER_RANGES = Object.freeze({
  i8: Object.freeze([-128, 127]),
  i16: Object.freeze([-32768, 32767]),
  i32: Object.freeze([-2147483648, 2147483647]),
  u8: Object.freeze([0, 255]),
  u16: Object.freeze([0, 65535]),
  u32: Object.freeze([0, 4294967295]),
});

/** A module-unique value that cannot collide with any numeric field value. */
export const COMPONENT_ABSENT = Symbol("agentic-graph.ecs.componentAbsent");

function ecsError(code, message, details = {}) {
  const error = new Error(message);
  error.name = "EcsError";
  error.code = code;
  Object.assign(error, details);
  return error;
}

function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertEntityId(entityId) {
  if (!Number.isSafeInteger(entityId) || entityId < 0) {
    throw ecsError("ECS_INVALID_ENTITY_ID", "entityId must be a non-negative safe integer", {
      entityId,
    });
  }
}

function assertFieldName(fieldName) {
  if (typeof fieldName !== "string" || fieldName.trim() !== fieldName || fieldName.length === 0) {
    throw ecsError("ECS_INVALID_FIELD_NAME", "component field names must be non-empty strings");
  }
}

function assertFieldExists(store, fieldName) {
  assertFieldName(fieldName);
  if (!Object.hasOwn(store.fieldSpec, fieldName)) {
    throw ecsError("ECS_UNKNOWN_COMPONENT_FIELD", `unknown component field: ${fieldName}`, {
      fieldName,
    });
  }
}

function assertRepresentable(type, value, fieldName) {
  if (typeof value !== "number") {
    throw ecsError(
      "ECS_UNREPRESENTABLE_COMPONENT_VALUE",
      `${fieldName} must be a number representable by ${type}`,
      { fieldName, fieldType: type, value },
    );
  }

  const range = INTEGER_RANGES[type];
  if (range && (!Number.isInteger(value) || value < range[0] || value > range[1])) {
    throw ecsError(
      "ECS_UNREPRESENTABLE_COMPONENT_VALUE",
      `${fieldName} must be an integer in the ${type} range`,
      { fieldName, fieldType: type, value },
    );
  }
  if (type === "f32" && Number.isFinite(value) && !Number.isFinite(Math.fround(value))) {
    throw ecsError(
      "ECS_UNREPRESENTABLE_COMPONENT_VALUE",
      `${fieldName} is outside the f32 range`,
      { fieldName, fieldType: type, value },
    );
  }
}

export function validateFieldSpec(fieldSpec) {
  if (!isPlainObject(fieldSpec) || Object.keys(fieldSpec).length === 0) {
    throw ecsError(
      "ECS_INVALID_COMPONENT_SCHEMA",
      "fieldSpec must be a non-empty plain object",
    );
  }

  const normalized = Object.create(null);
  for (const [fieldName, type] of Object.entries(fieldSpec)) {
    assertFieldName(fieldName);
    if (!Object.hasOwn(FIELD_TYPES, type)) {
      throw ecsError(
        "ECS_UNSUPPORTED_COMPONENT_FIELD_TYPE",
        `unsupported component field type for ${fieldName}: ${String(type)}`,
        { fieldName, fieldType: type },
      );
    }
    normalized[fieldName] = type;
  }
  return Object.freeze(normalized);
}

export function createComponentStore(fieldSpec) {
  const normalizedSpec = validateFieldSpec(fieldSpec);
  const fields = Object.create(null);
  for (const [fieldName, type] of Object.entries(normalizedSpec)) {
    fields[fieldName] = new FIELD_TYPES[type](INITIAL_CAPACITY);
  }

  return {
    fieldSpec: normalizedSpec,
    fields,
    present: new Uint8Array(INITIAL_CAPACITY),
  };
}

export function validateComponentValues(store, values) {
  if (!isPlainObject(values)) {
    throw ecsError("ECS_INVALID_COMPONENT_VALUE", "component values must be a plain object");
  }

  const expectedFields = Object.keys(store.fieldSpec);
  const suppliedFields = Object.keys(values);
  if (
    suppliedFields.length !== expectedFields.length ||
    suppliedFields.some((fieldName) => !Object.hasOwn(store.fieldSpec, fieldName))
  ) {
    throw ecsError(
      "ECS_COMPONENT_FIELD_MISMATCH",
      `component values must contain exactly: ${expectedFields.join(", ")}`,
      { expectedFields, suppliedFields },
    );
  }

  for (const fieldName of expectedFields) {
    if (!Object.hasOwn(values, fieldName)) {
      throw ecsError(
        "ECS_COMPONENT_FIELD_MISMATCH",
        `component value is missing field: ${fieldName}`,
        { fieldName, expectedFields, suppliedFields },
      );
    }
    assertRepresentable(store.fieldSpec[fieldName], values[fieldName], fieldName);
  }
}

export function ensureStoreCapacity(store, entityId) {
  assertEntityId(entityId);
  if (entityId < store.present.length) return;

  let capacity = store.present.length;
  while (capacity <= entityId) capacity *= 2;

  const present = new Uint8Array(capacity);
  present.set(store.present);
  store.present = present;

  for (const [fieldName, current] of Object.entries(store.fields)) {
    const grown = new current.constructor(capacity);
    grown.set(current);
    store.fields[fieldName] = grown;
  }
}

export function hasComponent(store, entityId) {
  assertEntityId(entityId);
  return entityId < store.present.length && store.present[entityId] === 1;
}

export function readField(store, entityId, fieldName) {
  assertEntityId(entityId);
  assertFieldExists(store, fieldName);
  if (!hasComponent(store, entityId)) return COMPONENT_ABSENT;
  return store.fields[fieldName][entityId];
}

export function writeField(store, entityId, fieldName, value) {
  assertEntityId(entityId);
  assertFieldExists(store, fieldName);
  assertRepresentable(store.fieldSpec[fieldName], value, fieldName);
  if (!hasComponent(store, entityId)) {
    throw ecsError(
      "ECS_COMPONENT_ABSENT",
      `cannot write ${fieldName}; entity ${entityId} does not possess this component`,
      { entityId, fieldName },
    );
  }
  store.fields[fieldName][entityId] = value;
}

export function setComponentValues(store, entityId, values) {
  assertEntityId(entityId);
  validateComponentValues(store, values);
  ensureStoreCapacity(store, entityId);
  for (const fieldName of Object.keys(store.fieldSpec)) {
    store.fields[fieldName][entityId] = values[fieldName];
  }
  store.present[entityId] = 1;
}

export function snapshotComponent(store, entityId) {
  assertEntityId(entityId);
  const values = Object.create(null);
  for (const fieldName of Object.keys(store.fieldSpec)) {
    values[fieldName] = entityId < store.fields[fieldName].length
      ? store.fields[fieldName][entityId]
      : 0;
  }
  return { present: hasComponent(store, entityId), values };
}

export function restoreComponent(store, entityId, snapshot) {
  assertEntityId(entityId);
  ensureStoreCapacity(store, entityId);
  for (const fieldName of Object.keys(store.fieldSpec)) {
    store.fields[fieldName][entityId] = snapshot.values[fieldName];
  }
  store.present[entityId] = snapshot.present ? 1 : 0;
}

export function readComponentValues(store, entityId) {
  if (!hasComponent(store, entityId)) return COMPONENT_ABSENT;
  const values = Object.create(null);
  for (const fieldName of Object.keys(store.fieldSpec)) {
    values[fieldName] = store.fields[fieldName][entityId];
  }
  return values;
}
