import fs from 'node:fs/promises';

export async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isOptionalString(value) {
  return value === undefined || value === null || isNonEmptyString(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function loadRuntimeEnv(config, env = process.env) {
  const tokenEnvVar = config.discord?.tokenEnvVar || 'DISCORD_BOT_TOKEN';
  const token = env[tokenEnvVar];

  return {
    ...config,
    discord: {
      ...config.discord,
      tokenEnvVar,
      token
    }
  };
}

function validateRuntimeShape(runtime, errors, prefix = 'runtime') {
  if (!isNonEmptyString(runtime?.bot?.presence)) {
    errors.push(`${prefix}.bot.presence is required.`);
  }

  if (!isNonEmptyString(runtime?.bot?.connection)) {
    errors.push(`${prefix}.bot.connection is required.`);
  }

  if (!isNonEmptyString(runtime?.bot?.activity)) {
    errors.push(`${prefix}.bot.activity is required.`);
  }

  if (!isNonEmptyString(runtime?.task?.current)) {
    errors.push(`${prefix}.task.current is required.`);
  }

  if (!isNonEmptyString(runtime?.task?.phase)) {
    errors.push(`${prefix}.task.phase is required.`);
  }

  if (!isNonEmptyString(runtime?.heartbeat?.lastSeen)) {
    errors.push(`${prefix}.heartbeat.lastSeen is required.`);
  }

  if (!isNonNegativeInteger(runtime?.queue?.pending)) {
    errors.push(`${prefix}.queue.pending must be a non-negative integer.`);
  }

  if (!isNonNegativeInteger(runtime?.queue?.backlog)) {
    errors.push(`${prefix}.queue.backlog must be a non-negative integer.`);
  }

  if (!Array.isArray(runtime?.blockers)) {
    errors.push(`${prefix}.blockers must be an array.`);
  }
}

function validateRuntimeSources(runtimeSources, errors) {
  if (!isPlainObject(runtimeSources)) {
    errors.push('runtimeSources must be an object when provided.');
    return;
  }

  const fileFields = ['snapshotFile', 'workspaceStateFile', 'heartbeatFile', 'queueFile', 'blockersFile'];
  for (const field of fileFields) {
    const source = runtimeSources[field];
    if (source === undefined) continue;
    if (!isPlainObject(source)) {
      errors.push(`runtimeSources.${field} must be an object.`);
      continue;
    }
    if (!isNonEmptyString(source.path)) {
      errors.push(`runtimeSources.${field}.path is required.`);
    }
  }

  if (runtimeSources.env !== undefined) {
    if (!isPlainObject(runtimeSources.env)) {
      errors.push('runtimeSources.env must be an object when provided.');
    } else {
      const allowedEnvKeys = [
        'presence',
        'connection',
        'activity',
        'taskCurrent',
        'taskPhase',
        'heartbeatLastSeen',
        'queuePending',
        'queueBacklog',
        'blockersJson'
      ];

      for (const key of allowedEnvKeys) {
        if (runtimeSources.env[key] !== undefined && !isNonEmptyString(runtimeSources.env[key])) {
          errors.push(`runtimeSources.env.${key} must be a non-empty string when provided.`);
        }
      }
    }
  }
}

export function validateConfig(config) {
  const errors = [];

  function validateRunner(runner) {
    if (runner === undefined) {
      return;
    }

    if (!isPlainObject(runner)) {
      errors.push('runner must be an object when provided.');
      return;
    }

    if (runner.intervalMs !== undefined && !isNonNegativeInteger(runner.intervalMs)) {
      errors.push('runner.intervalMs must be an integer >= 0.');
    }

    if (runner.renameCooldownMs !== undefined && !isNonNegativeInteger(runner.renameCooldownMs)) {
      errors.push('runner.renameCooldownMs must be an integer >= 0.');
    }

    if (runner.renameSettleMs !== undefined && !isNonNegativeInteger(runner.renameSettleMs)) {
      errors.push('runner.renameSettleMs must be an integer >= 0.');
    }

    if (runner.stateFile !== undefined && !isNonEmptyString(runner.stateFile)) {
      errors.push('runner.stateFile must be a non-empty string when provided.');
    }

    if (runner.statusModel !== undefined) {
      if (!isPlainObject(runner.statusModel)) {
        errors.push('runner.statusModel must be an object when provided.');
      } else {
        if (runner.statusModel.staleAfterMs !== undefined && !isNonNegativeInteger(runner.statusModel.staleAfterMs)) {
          errors.push('runner.statusModel.staleAfterMs must be an integer >= 0.');
        }

        if (runner.statusModel.offlineAfterMs !== undefined && !isNonNegativeInteger(runner.statusModel.offlineAfterMs)) {
          errors.push('runner.statusModel.offlineAfterMs must be an integer >= 0.');
        }
      }
    }
  }

  if (!config || typeof config !== 'object') {
    errors.push('Config must be an object.');
    return { valid: false, errors };
  }

  if (!config.guild?.id || !config.guild?.name) {
    errors.push('guild.id and guild.name are required.');
  }

  if (!isNonEmptyString(config.board?.key) || !isNonEmptyString(config.board?.baseName)) {
    errors.push('board.key and board.baseName are required.');
  }

  if (!Array.isArray(config.board?.channels) || config.board.channels.length === 0) {
    errors.push('board.channels must contain at least one channel declaration.');
  }

  if (config.runtime !== undefined && !isPlainObject(config.runtime)) {
    errors.push('runtime must be an object when provided.');
  }

  if (config.runtimeSources !== undefined) {
    validateRuntimeSources(config.runtimeSources, errors);
  }

  if (config.runtime === undefined && config.runtimeSources === undefined) {
    errors.push('Provide runtime or runtimeSources.');
  }

  if (config.runtime !== undefined && config.runtimeSources === undefined) {
    validateRuntimeShape(config.runtime, errors);
  }

  validateRunner(config.runner);

  if (config.discord !== undefined && typeof config.discord !== 'object') {
    errors.push('discord must be an object when provided.');
  }

  if (config.discord) {
    if (!isOptionalString(config.discord.tokenEnvVar)) {
      errors.push('discord.tokenEnvVar must be a non-empty string when provided.');
    }

    if (config.discord.requestDelayMs !== undefined && !isNonNegativeInteger(config.discord.requestDelayMs)) {
      errors.push('discord.requestDelayMs must be an integer >= 0.');
    }

    if (config.discord.maxOpsPerRun !== undefined && !isNonNegativeInteger(config.discord.maxOpsPerRun)) {
      errors.push('discord.maxOpsPerRun must be an integer >= 0.');
    }

    if (config.discord.apiBaseUrl !== undefined && !isNonEmptyString(config.discord.apiBaseUrl)) {
      errors.push('discord.apiBaseUrl must be a non-empty string when provided.');
    }
  }

  const allowedStateBindings = new Set([
    'presence',
    'connection',
    'activity',
    'task.current',
    'task.phase',
    'heartbeat.lastSeen',
    'heartbeat.age',
    'queue.pending',
    'queue.backlog',
    'blockers.summary'
  ]);

  const channelKeys = new Set();
  for (const channel of config.board?.channels ?? []) {
    if (!isNonEmptyString(channel.key) || !isNonEmptyString(channel.template) || !isNonEmptyString(channel.stateBinding)) {
      errors.push(`Each board channel requires key, stateBinding, and template. Problem in ${JSON.stringify(channel)}.`);
      continue;
    }

    if (!allowedStateBindings.has(channel.stateBinding)) {
      errors.push(`Unsupported stateBinding for ${channel.key}: ${channel.stateBinding}`);
    }

    if (!Number.isInteger(channel.position) || channel.position < 0) {
      errors.push(`Channel ${channel.key} position must be an integer >= 0.`);
    }

    if (!isOptionalString(channel.id)) {
      errors.push(`Channel ${channel.key} id must be a non-empty string when provided.`);
    }

    if (channelKeys.has(channel.key)) {
      errors.push(`Duplicate board channel key: ${channel.key}`);
    }
    channelKeys.add(channel.key);
  }

  if (!isOptionalString(config.board?.managedCategoryId)) {
    errors.push('board.managedCategoryId must be a non-empty string when provided.');
  }

  return { valid: errors.length === 0, errors };
}

export function validateResolvedRuntime(runtime) {
  const errors = [];
  validateRuntimeShape(runtime, errors, 'resolvedRuntime');
  return { valid: errors.length === 0, errors };
}

export function normalizeConfig(config) {
  return {
    ...config,
    discord: {
      mode: 'mock',
      tokenEnvVar: 'DISCORD_BOT_TOKEN',
      apiBaseUrl: 'https://discord.com/api/v10',
      dryRun: true,
      allowCreate: false,
      testServerOnly: true,
      maxOpsPerRun: 5,
      requestDelayMs: 750,
      ...config.discord
    },
    board: {
      sortOffset: 0,
      maxNameLength: 60,
      managedCategoryId: config.board?.managedCategoryId ?? null,
      ...config.board,
      channels: [...config.board.channels].sort((a, b) => a.position - b.position)
    },
    runtime: {
      bot: {
        presence: 'offline',
        connection: 'disconnected',
        activity: 'unknown'
      },
      task: {
        current: 'unknown',
        phase: 'unknown'
      },
      heartbeat: {
        lastSeen: '1970-01-01T00:00:00Z'
      },
      queue: {
        pending: 0,
        backlog: 0
      },
      blockers: [],
      ...(config.runtime ?? {}),
      bot: {
        presence: 'offline',
        connection: 'disconnected',
        activity: 'unknown',
        ...(config.runtime?.bot ?? {})
      },
      task: {
        current: 'unknown',
        phase: 'unknown',
        ...(config.runtime?.task ?? {})
      },
      heartbeat: {
        lastSeen: '1970-01-01T00:00:00Z',
        ...(config.runtime?.heartbeat ?? {})
      },
      queue: {
        pending: 0,
        backlog: 0,
        ...(config.runtime?.queue ?? {})
      },
      blockers: Array.isArray(config.runtime?.blockers) ? config.runtime.blockers : []
    },
    runtimeSources: config.runtimeSources ?? null,
    runner: {
      intervalMs: 60000,
      renameCooldownMs: 300000,
      renameSettleMs: 120000,
      stateFile: '.state/openclaw-status-tracker.json',
      statusModel: {
        staleAfterMs: 15 * 60 * 1000,
        offlineAfterMs: 60 * 60 * 1000,
        ...(config.runner?.statusModel ?? {})
      },
      ...config.runner,
      statusModel: {
        staleAfterMs: 15 * 60 * 1000,
        offlineAfterMs: 60 * 60 * 1000,
        ...(config.runner?.statusModel ?? {})
      }
    }
  };
}
