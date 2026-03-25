function sanitizeName(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}%._-]/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function renderTemplate(template, value) {
  return template.replaceAll('{value}', sanitizeName(value));
}

export function buildDesiredBoard(config) {
  const healthLevel = String(config.runtime.health.level).toUpperCase();
  const desiredCategoryName = `${config.board.baseName} · ${healthLevel}`;

  const channels = config.board.channels.map((channel) => {
    const metricValue = config.runtime.metrics[channel.metric] ?? 'unknown';
    return {
      key: channel.key,
      logicalLabel: channel.label,
      name: renderTemplate(channel.template, metricValue),
      position: channel.position
    };
  });

  return {
    category: {
      key: config.board.key,
      name: desiredCategoryName,
      position: config.board.sortOffset,
      channels
    }
  };
}
