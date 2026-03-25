import fs from 'node:fs/promises';

export async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
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

  if (!config.board?.key || !config.board?.baseName) {
    errors.push('board.key and board.baseName are required.');
  }

  if (!Array.isArray(config.board?.channels) || config.board.channels.length === 0) {
    errors.push('board.channels must contain at least one channel declaration.');
  }

  if (!config.runtime?.health?.level || !config.runtime?.health?.emoji) {
    errors.push('runtime.health.level and runtime.health.emoji are required.');
  }

  const channelKeys = new Set();
  for (const channel of config.board?.channels ?? []) {
    if (!channel.key || !channel.metric || !channel.template) {
      errors.push(`Each board channel requires key, metric, and template. Problem in ${JSON.stringify(channel)}.`);
      continue;
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
      ...config.board,
      channels: [...config.board.channels].sort((a, b) => a.position - b.position)
    }
  };
}
