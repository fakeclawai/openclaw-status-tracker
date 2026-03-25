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

export function validateConfig(config) {
  const errors = [];

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

  if (!isNonEmptyString(config.runtime?.bot?.presence)) {
    errors.push('runtime.bot.presence is required.');
  }

  if (!isNonEmptyString(config.runtime?.bot?.connection)) {
    errors.push('runtime.bot.connection is required.');
  }

  if (!isNonEmptyString(config.runtime?.bot?.activity)) {
    errors.push('runtime.bot.activity is required.');
  }

  if (!isNonEmptyString(config.runtime?.task?.current)) {
    errors.push('runtime.task.current is required.');
  }

  if (!isNonEmptyString(config.runtime?.task?.phase)) {
    errors.push('runtime.task.phase is required.');
  }

  if (!isNonEmptyString(config.runtime?.heartbeat?.lastSeen)) {
    errors.push('runtime.heartbeat.lastSeen is required.');
  }

  if (!isNonNegativeInteger(config.runtime?.queue?.pending)) {
    errors.push('runtime.queue.pending must be a non-negative integer.');
  }

  if (!isNonNegativeInteger(config.runtime?.queue?.backlog)) {
    errors.push('runtime.queue.backlog must be a non-negative integer.');
  }

  if (!Array.isArray(config.runtime?.blockers)) {
    errors.push('runtime.blockers must be an array.');
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

    if (channelKeys.has(channel.key)) {
      errors.push(`Duplicate board channel key: ${channel.key}`);
    }
    channelKeys.add(channel.key);
  }

  return { valid: errors.length === 0, errors };
}

export function normalizeConfig(config) {
  return {
    ...config,
    board: {
      sortOffset: 0,
      maxNameLength: 60,
      ...config.board,
      channels: [...config.board.channels].sort((a, b) => a.position - b.position)
    },
    runtime: {
      blockers: [],
      ...config.runtime,
      queue: {
        pending: 0,
        backlog: 0,
        ...config.runtime.queue
      }
    }
  };
}
