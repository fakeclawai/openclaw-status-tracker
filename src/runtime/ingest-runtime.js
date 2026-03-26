import path from 'node:path';
import { loadJson } from '../config/load-config.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, patch) {
  if (!isPlainObject(patch)) {
    return patch === undefined ? base : patch;
  }

  const output = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (Array.isArray(value)) {
      output[key] = [...value];
      continue;
    }

    if (isPlainObject(value)) {
      output[key] = deepMerge(output[key], value);
      continue;
    }

    if (value !== undefined) {
      output[key] = value;
    }
  }

  return output;
}

function resolvePath(baseDir, filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
}

function parseTimestamp(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1e12 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }

  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) {
    return String(value);
  }

  return new Date(parsed).toISOString();
}

function parseInteger(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : Math.max(0, parsed);
}

function parseDurationMs(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  const numeric = Number.parseInt(String(value), 10);
  return Number.isNaN(numeric) ? fallback : Math.max(0, numeric);
}

function normalizeLower(value) {
  return String(value ?? '').trim().toLowerCase();
}

function parseTimestampMs(value) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function isPlaceholderTaskValue(value) {
  const normalized = normalizeLower(value);
  if (!normalized) {
    return true;
  }

  const placeholders = new Set([
    'unknown',
    'none',
    'idle',
    'ready',
    'standby',
    'waiting',
    'queued',
    'boot',
    'starting'
  ]);

  return placeholders.has(normalized)
    || normalized.startsWith('awaiting-')
    || normalized.startsWith('waiting-');
}

function derivePresence(runtime, statusModel = {}, now = Date.now()) {
  const connection = normalizeLower(runtime.bot?.connection);
  const rawPresence = normalizeLower(runtime.bot?.presence);
  const heartbeatAt = parseTimestampMs(runtime.heartbeat?.lastSeen);
  const heartbeatAgeMs = heartbeatAt === null ? Number.POSITIVE_INFINITY : Math.max(0, now - heartbeatAt);
  const staleAfterMs = parseDurationMs(statusModel.staleAfterMs, 15 * 60 * 1000);
  const offlineAfterMs = parseDurationMs(statusModel.offlineAfterMs, 60 * 60 * 1000);
  const hasFreshHeartbeat = heartbeatAgeMs <= staleAfterMs;
  const hasVeryStaleHeartbeat = heartbeatAgeMs > offlineAfterMs;
  const hasPendingQueue = Number(runtime.queue?.pending ?? 0) > 0;
  const hasActiveTask = !isPlaceholderTaskValue(runtime.task?.current) || !isPlaceholderTaskValue(runtime.task?.phase);
  const hasBlockers = Array.isArray(runtime.blockers) && runtime.blockers.length > 0;
  const hasFreshActiveWork = hasFreshHeartbeat && (hasPendingQueue || hasActiveTask);

  if (connection === 'disconnected' || rawPresence === 'offline') {
    return 'offline';
  }

  if (hasVeryStaleHeartbeat) {
    return hasBlockers || connection === 'reconnecting' || connection === 'pairing' ? 'degraded' : 'idle';
  }

  if (hasFreshActiveWork) {
    return 'busy';
  }

  if (!hasFreshHeartbeat && (rawPresence === 'busy' || hasPendingQueue || hasActiveTask)) {
    return 'degraded';
  }

  if (rawPresence === 'degraded' || hasBlockers || connection === 'reconnecting' || connection === 'pairing') {
    return 'degraded';
  }

  return 'idle';
}

function applyStatusModel(runtime, statusModel) {
  return {
    ...runtime,
    bot: {
      ...runtime.bot,
      presence: derivePresence(runtime, statusModel)
    }
  };
}

function normalizeBlockers(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (isPlainObject(value) && Array.isArray(value.blockers)) {
    return value.blockers;
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      return normalizeBlockers(JSON.parse(value));
    } catch {
      return [value.trim()];
    }
  }

  return [];
}

function extractRuntimeDocument(document) {
  if (!isPlainObject(document)) {
    return {};
  }

  if (isPlainObject(document.runtime)) {
    return document.runtime;
  }

  if (isPlainObject(document.bot) || isPlainObject(document.task) || isPlainObject(document.heartbeat) || isPlainObject(document.queue) || Array.isArray(document.blockers)) {
    return document;
  }

  return {};
}

function extractWorkspaceRuntime(document) {
  if (!isPlainObject(document)) {
    return {};
  }

  const heartbeat = document.heartbeat ?? document.heartbeatState ?? {};
  const queue = document.queue ?? document.backlog ?? {};
  const task = document.task ?? document.currentTask ?? {};
  const blockers = document.blockers ?? document.flags?.blockers ?? [];
  const bot = document.bot ?? document.status ?? {};

  return {
    bot: {
      presence: bot.presence ?? bot.state,
      connection: bot.connection ?? bot.gateway ?? bot.discord,
      activity: bot.activity ?? bot.mode ?? bot.summary
    },
    task: {
      current: task.current ?? task.name ?? task.label,
      phase: task.phase ?? task.stage ?? task.status
    },
    heartbeat: {
      lastSeen: parseTimestamp(heartbeat.lastSeen ?? heartbeat.updatedAt ?? heartbeat.timestamp ?? heartbeat.ts)
    },
    queue: {
      pending: queue.pending ?? queue.active ?? queue.pendingCount,
      backlog: queue.backlog ?? queue.total ?? queue.backlogCount
    },
    blockers: normalizeBlockers(blockers)
  };
}

function extractHeartbeatRuntime(document) {
  if (!isPlainObject(document)) {
    return {};
  }

  return {
    heartbeat: {
      lastSeen: parseTimestamp(
        document.lastSeen
        ?? document.updatedAt
        ?? document.timestamp
        ?? document.ts
        ?? document.heartbeat?.lastSeen
      )
    }
  };
}

function extractQueueRuntime(document) {
  if (Array.isArray(document)) {
    return {
      queue: {
        pending: document.filter((item) => item?.status === 'pending' || item?.state === 'pending').length,
        backlog: document.length
      }
    };
  }

  if (!isPlainObject(document)) {
    return {};
  }

  const items = Array.isArray(document.items) ? document.items : Array.isArray(document.queue) ? document.queue : null;

  return {
    queue: {
      pending: document.pending ?? document.active ?? document.pendingCount ?? (items ? items.filter((item) => item?.status === 'pending' || item?.state === 'pending').length : undefined),
      backlog: document.backlog ?? document.total ?? document.backlogCount ?? (items ? items.length : undefined)
    }
  };
}

function extractBlockersRuntime(document) {
  return {
    blockers: normalizeBlockers(document)
  };
}

async function readOptionalJson(source, baseDir) {
  if (!source?.path) {
    return null;
  }

  const resolvedPath = resolvePath(baseDir, source.path);
  const document = await loadJson(resolvedPath);
  return { resolvedPath, document };
}

function buildEnvRuntime(envSource, env) {
  if (!envSource) {
    return {};
  }

  const blockers = envSource.blockersJson ? normalizeBlockers(env[envSource.blockersJson]) : undefined;

  return {
    bot: {
      presence: envSource.presence ? env[envSource.presence] : undefined,
      connection: envSource.connection ? env[envSource.connection] : undefined,
      activity: envSource.activity ? env[envSource.activity] : undefined
    },
    task: {
      current: envSource.taskCurrent ? env[envSource.taskCurrent] : undefined,
      phase: envSource.taskPhase ? env[envSource.taskPhase] : undefined
    },
    heartbeat: {
      lastSeen: envSource.heartbeatLastSeen ? parseTimestamp(env[envSource.heartbeatLastSeen]) : undefined
    },
    queue: {
      pending: envSource.queuePending ? parseInteger(env[envSource.queuePending], undefined) : undefined,
      backlog: envSource.queueBacklog ? parseInteger(env[envSource.queueBacklog], undefined) : undefined
    },
    blockers
  };
}

export async function resolveRuntimeState(config, { configPath, env = process.env } = {}) {
  const baseDir = configPath ? path.dirname(configPath) : process.cwd();
  const sourcesUsed = [];
  let runtime = deepMerge({}, config.runtime ?? {});
  const statusModel = config.runner?.statusModel ?? {};

  const snapshot = await readOptionalJson(config.runtimeSources?.snapshotFile, baseDir);
  if (snapshot) {
    runtime = deepMerge(runtime, extractRuntimeDocument(snapshot.document));
    sourcesUsed.push({ type: 'snapshotFile', path: snapshot.resolvedPath });
  }

  const workspaceState = await readOptionalJson(config.runtimeSources?.workspaceStateFile, baseDir);
  if (workspaceState) {
    runtime = deepMerge(runtime, extractWorkspaceRuntime(workspaceState.document));
    sourcesUsed.push({ type: 'workspaceStateFile', path: workspaceState.resolvedPath });
  }

  const heartbeat = await readOptionalJson(config.runtimeSources?.heartbeatFile, baseDir);
  if (heartbeat) {
    runtime = deepMerge(runtime, extractHeartbeatRuntime(heartbeat.document));
    sourcesUsed.push({ type: 'heartbeatFile', path: heartbeat.resolvedPath });
  }

  const queue = await readOptionalJson(config.runtimeSources?.queueFile, baseDir);
  if (queue) {
    runtime = deepMerge(runtime, extractQueueRuntime(queue.document));
    runtime.queue = {
      ...runtime.queue,
      pending: parseInteger(runtime.queue?.pending, 0),
      backlog: parseInteger(runtime.queue?.backlog, 0)
    };
    sourcesUsed.push({ type: 'queueFile', path: queue.resolvedPath });
  }

  const blockers = await readOptionalJson(config.runtimeSources?.blockersFile, baseDir);
  if (blockers) {
    runtime = deepMerge(runtime, extractBlockersRuntime(blockers.document));
    sourcesUsed.push({ type: 'blockersFile', path: blockers.resolvedPath });
  }

  if (config.runtimeSources?.env) {
    runtime = deepMerge(runtime, buildEnvRuntime(config.runtimeSources.env, env));
    sourcesUsed.push({ type: 'env', keys: { ...config.runtimeSources.env } });
  }

  runtime.queue = {
    pending: parseInteger(runtime.queue?.pending, 0),
    backlog: parseInteger(runtime.queue?.backlog, 0)
  };
  runtime.heartbeat = {
    lastSeen: parseTimestamp(runtime.heartbeat?.lastSeen) ?? runtime.heartbeat?.lastSeen
  };
  runtime.blockers = normalizeBlockers(runtime.blockers);
  runtime = applyStatusModel(runtime, statusModel);

  return {
    runtime,
    metadata: {
      sourcesUsed,
      statusModel: {
        staleAfterMs: parseDurationMs(statusModel.staleAfterMs, 15 * 60 * 1000),
        offlineAfterMs: parseDurationMs(statusModel.offlineAfterMs, 60 * 60 * 1000)
      }
    }
  };
}
