import fs from 'node:fs/promises';
import path from 'node:path';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultState() {
  return {
    version: 1,
    updatedAt: null,
    lastAppliedBoard: null,
    renameCooldowns: {},
    desiredNameObservations: {}
  };
}

export async function loadPersistentState(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...defaultState(),
      ...parsed,
      renameCooldowns: { ...(parsed.renameCooldowns ?? {}) },
      desiredNameObservations: { ...(parsed.desiredNameObservations ?? {}) }
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return defaultState();
    }
    throw error;
  }
}

export async function savePersistentState(filePath, state) {
  const nextState = {
    ...defaultState(),
    ...state,
    updatedAt: new Date().toISOString()
  };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  return nextState;
}

function makeObservationKey(scope, identifier) {
  return `${scope}:${identifier}`;
}

function getObservedAt(record) {
  const timestamp = Date.parse(record?.firstObservedAt ?? '');
  return Number.isNaN(timestamp) ? null : timestamp;
}

function copyPlan(plan) {
  return {
    operations: plan.operations.map((operation) => ({ ...operation })),
    notes: [...plan.notes]
  };
}

function getRenameTarget(operation) {
  if (operation.type === 'renameCategory') {
    return { scope: 'category', identifier: operation.id || operation.key };
  }

  if (operation.type === 'renameChannel') {
    return { scope: 'channel', identifier: operation.id || operation.key };
  }

  return null;
}

export function applyPlanPolicy({ plan, state, now = Date.now(), policy }) {
  const renameCooldownMs = Math.max(0, policy.renameCooldownMs ?? 0);
  const renameSettleMs = Math.max(0, policy.renameSettleMs ?? 0);
  const nextState = clone(state ?? defaultState());
  const filteredPlan = copyPlan(plan);
  filteredPlan.operations = [];

  const activeObservationKeys = new Set();

  for (const operation of plan.operations) {
    const renameTarget = getRenameTarget(operation);
    if (!renameTarget) {
      filteredPlan.operations.push({ ...operation });
      continue;
    }

    const observationKey = makeObservationKey(renameTarget.scope, renameTarget.identifier);
    activeObservationKeys.add(observationKey);
    const previousObservation = nextState.desiredNameObservations[observationKey];
    const desiredNameChanged = previousObservation?.desiredName !== operation.to;
    const observation = desiredNameChanged
      ? {
          desiredName: operation.to,
          firstObservedAt: new Date(now).toISOString()
        }
      : previousObservation;

    nextState.desiredNameObservations[observationKey] = observation;

    const observedAt = getObservedAt(observation);
    const settledForMs = observedAt === null ? renameSettleMs : Math.max(0, now - observedAt);
    if (renameSettleMs > 0 && settledForMs < renameSettleMs) {
      filteredPlan.notes.push(
        `Coalesced ${operation.type} for ${renameTarget.scope} ${renameTarget.identifier}: waiting ${renameSettleMs - settledForMs}ms for desired name to settle.`
      );
      continue;
    }

    const cooldownKey = observationKey;
    const cooldownUntil = Date.parse(nextState.renameCooldowns[cooldownKey]?.until ?? '');
    if (!Number.isNaN(cooldownUntil) && cooldownUntil > now) {
      filteredPlan.notes.push(
        `Skipped ${operation.type} for ${renameTarget.scope} ${renameTarget.identifier}: cooldown active for ${cooldownUntil - now}ms.`
      );
      continue;
    }

    filteredPlan.operations.push({ ...operation });
  }

  for (const key of Object.keys(nextState.desiredNameObservations)) {
    if (!activeObservationKeys.has(key)) {
      delete nextState.desiredNameObservations[key];
    }
  }

  return {
    plan: filteredPlan,
    state: nextState
  };
}

export function recordApplyResult({ state, desiredBoard, applyResult, now = Date.now(), policy }) {
  const renameCooldownMs = Math.max(0, policy.renameCooldownMs ?? 0);
  const nextState = clone(state ?? defaultState());
  nextState.lastAppliedBoard = desiredBoard ? clone(desiredBoard) : nextState.lastAppliedBoard;

  for (const applied of applyResult?.applied ?? []) {
    if (applied?.status === 'dry-run') {
      continue;
    }

    const renameTarget = getRenameTarget(applied);
    if (!renameTarget) {
      continue;
    }

    const key = makeObservationKey(renameTarget.scope, renameTarget.identifier);
    nextState.renameCooldowns[key] = {
      lastAppliedAt: new Date(now).toISOString(),
      until: new Date(now + renameCooldownMs).toISOString(),
      name: applied.to
    };
    delete nextState.desiredNameObservations[key];
  }

  return nextState;
}
