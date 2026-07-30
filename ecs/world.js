import {
  createComponentStore,
  hasComponent,
  readComponentValues,
  restoreComponent,
  setComponentValues,
  snapshotComponent,
  validateComponentValues,
} from "./componentStore.js";

const WORLD_STATES = new WeakMap();

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

function assertName(name, label) {
  if (typeof name !== "string" || name.trim() !== name || name.length === 0) {
    throw ecsError(`ECS_INVALID_${label.toUpperCase()}_NAME`, `${label} name must be a non-empty string`);
  }
}

function getState(world) {
  const state = WORLD_STATES.get(world);
  if (!state) {
    throw ecsError(
      "ECS_INVALID_WORLD",
      "world is invalid, disposed, or was not created by createWorld",
    );
  }
  return state;
}

function assertMutableOutsideTick(state) {
  if (state.ticking) {
    throw ecsError("ECS_TICK_IN_PROGRESS", "world registries cannot change during a tick");
  }
}

export function createWorld({
  systems = [],
  decisionExecutor,
  clock,
  reasoningPolicy = "allow",
} = {}) {
  if (!Array.isArray(systems) || systems.some((system) => typeof system !== "function")) {
    throw ecsError("ECS_INVALID_SYSTEMS", "systems must be an array of functions");
  }
  if (decisionExecutor !== undefined && typeof decisionExecutor !== "function") {
    throw ecsError("ECS_INVALID_DECISION_EXECUTOR", "decisionExecutor must be a function");
  }
  if (clock !== undefined && typeof clock !== "function") {
    throw ecsError("ECS_INVALID_CLOCK", "clock must be a function");
  }
  if (reasoningPolicy !== "allow" && reasoningPolicy !== "forbid") {
    throw ecsError(
      "ECS_INVALID_REASONING_POLICY",
      'reasoningPolicy must be either "allow" or "forbid"',
    );
  }

  const world = Object.freeze(Object.create(null));
  WORLD_STATES.set(world, {
    clock: clock ?? Date.now,
    decisionExecutor,
    reasoningPolicy,
    entities: [],
    entityRefs: new Map(),
    nextEntityId: 0,
    stores: new Map(),
    systems: [...systems],
    ticking: false,
  });
  return world;
}

export function registerComponent(world, name, fieldSpec) {
  const state = getState(world);
  assertMutableOutsideTick(state);
  assertName(name, "component");
  if (state.stores.has(name)) {
    throw ecsError("ECS_COMPONENT_ALREADY_REGISTERED", `component already registered: ${name}`, {
      componentName: name,
    });
  }

  // Construct and validate completely before mutating the World registry.
  const store = createComponentStore(fieldSpec);
  state.stores.set(name, store);
  return Object.freeze({ name, fields: store.fieldSpec });
}

export function allocateEntity(world, allocation) {
  const state = getState(world);
  assertMutableOutsideTick(state);
  if (!isPlainObject(allocation)) {
    throw ecsError(
      "ECS_INVALID_ENTITY_ALLOCATION",
      "entity allocation must be { entityRef, components }",
    );
  }

  const suppliedKeys = Object.keys(allocation);
  if (
    suppliedKeys.length !== 2 ||
    !Object.hasOwn(allocation, "entityRef") ||
    !Object.hasOwn(allocation, "components")
  ) {
    throw ecsError(
      "ECS_INVALID_ENTITY_ALLOCATION",
      "entity allocation must contain exactly entityRef and components",
    );
  }

  const { entityRef, components } = allocation;
  assertName(entityRef, "entity_ref");
  if (state.entityRefs.has(entityRef)) {
    throw ecsError("ECS_ENTITY_REF_ALREADY_ALLOCATED", `entityRef already allocated: ${entityRef}`, {
      entityRef,
    });
  }
  if (!isPlainObject(components)) {
    throw ecsError("ECS_INVALID_ENTITY_COMPONENTS", "components must be a plain object");
  }
  if (state.nextEntityId === Number.MAX_SAFE_INTEGER) {
    throw ecsError("ECS_ENTITY_ID_EXHAUSTED", "the World has exhausted safe integer entity ids");
  }

  const attachments = [];
  for (const [componentName, values] of Object.entries(components)) {
    const store = state.stores.get(componentName);
    if (!store) {
      throw ecsError("ECS_UNKNOWN_COMPONENT", `unknown component: ${componentName}`, {
        componentName,
      });
    }
    validateComponentValues(store, values);
    attachments.push({ componentName, store, values });
  }

  const entityId = state.nextEntityId;
  const snapshots = attachments.map(({ store }) => ({
    store,
    snapshot: snapshotComponent(store, entityId),
  }));

  try {
    for (const { store, values } of attachments) {
      setComponentValues(store, entityId, values);
    }
  } catch (error) {
    for (let index = snapshots.length - 1; index >= 0; index -= 1) {
      restoreComponent(snapshots[index].store, entityId, snapshots[index].snapshot);
    }
    throw error;
  }

  state.nextEntityId += 1;
  state.entities.push(Object.freeze({ entityId, entityRef }));
  state.entityRefs.set(entityRef, entityId);
  return entityId;
}

export function disposeWorld(world) {
  const state = WORLD_STATES.get(world);
  if (!state) return false;
  if (state.ticking) {
    throw ecsError("ECS_TICK_IN_PROGRESS", "a World cannot be disposed during a tick");
  }
  WORLD_STATES.delete(world);
  return true;
}

export function snapshotWorld(world) {
  const state = getState(world);
  if (state.ticking) {
    throw ecsError("ECS_TICK_IN_PROGRESS", "World observations are unavailable during a tick");
  }
  const componentNames = [...state.stores.keys()].sort();
  const components = componentNames.map((name) => ({
    name,
    fields: { ...state.stores.get(name).fieldSpec },
  }));
  const entities = state.entities.map(({ entityId, entityRef }) => {
    const attached = {};
    for (const componentName of componentNames) {
      const store = state.stores.get(componentName);
      if (hasComponent(store, entityId)) {
        Object.defineProperty(attached, componentName, {
          configurable: true,
          enumerable: true,
          value: { ...readComponentValues(store, entityId) },
          writable: true,
        });
      }
    }
    return { entityId, entityRef, components: attached };
  });
  return { components, entities };
}

// The exports below are integration seams for sibling ECS modules. They are
// deliberately absent from `ecs/index.js`, keeping the public World opaque.

export function assertWorldEntity(world, entityId) {
  const state = getState(world);
  if (
    !Number.isSafeInteger(entityId) ||
    entityId < 0 ||
    entityId >= state.entities.length ||
    state.entities[entityId].entityId !== entityId
  ) {
    throw ecsError("ECS_UNKNOWN_ENTITY", `unknown entity: ${String(entityId)}`, { entityId });
  }
}

export function getWorldComponentStore(world, componentName) {
  const state = getState(world);
  assertName(componentName, "component");
  const store = state.stores.get(componentName);
  if (!store) {
    throw ecsError("ECS_UNKNOWN_COMPONENT", `unknown component: ${componentName}`, {
      componentName,
    });
  }
  return store;
}

export function listWorldEntityIds(world) {
  return getState(world).entities.map(({ entityId }) => entityId);
}

export function assertWorldReadable(world) {
  const state = getState(world);
  if (state.ticking) {
    throw ecsError("ECS_TICK_IN_PROGRESS", "World observations are unavailable during a tick");
  }
}

export function getWorldSystems(world) {
  return [...getState(world).systems];
}

export function getWorldRuntimeOptions(world) {
  const { clock, decisionExecutor, reasoningPolicy } = getState(world);
  return { clock, decisionExecutor, reasoningPolicy };
}

export function beginWorldTick(world) {
  const state = getState(world);
  if (state.ticking) {
    throw ecsError("ECS_TICK_IN_PROGRESS", "a World_Tick is already running");
  }
  state.ticking = true;
}

export function endWorldTick(world) {
  const state = getState(world);
  state.ticking = false;
}
