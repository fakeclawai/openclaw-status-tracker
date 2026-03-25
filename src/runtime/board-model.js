function sanitizeName(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}%._-]/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function truncateName(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength).replace(/-+$/g, '');
}

function renderTemplate(template, value, maxNameLength) {
  const rendered = template.replaceAll('{value}', sanitizeName(value));
  return truncateName(rendered, maxNameLength);
}

function summarizeBlockers(blockers) {
  if (!Array.isArray(blockers) || blockers.length === 0) {
    return 'none';
  }

  const primary = blockers[0];
  if (typeof primary === 'string') {
    return blockers.length === 1 ? primary : `${primary}-plus-${blockers.length - 1}`;
  }

  if (primary && typeof primary === 'object') {
    const label = primary.code || primary.label || primary.summary || 'blocker';
    return blockers.length === 1 ? label : `${label}-plus-${blockers.length - 1}`;
  }

  return `active-${blockers.length}`;
}

function deriveHeartbeatAge(lastSeen) {
  if (!lastSeen) {
    return 'unknown';
  }

  const timestamp = Date.parse(lastSeen);
  if (Number.isNaN(timestamp)) {
    return String(lastSeen);
  }

  const ageMs = Math.max(0, Date.now() - timestamp);
  const totalMinutes = Math.floor(ageMs / 60000);

  if (totalMinutes < 1) {
    return 'lt-1m';
  }

  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h-${minutes}m`;
}

function buildStateMap(runtime) {
  return {
    presence: runtime.bot.presence,
    connection: runtime.bot.connection,
    activity: runtime.bot.activity,
    'task.current': runtime.task.current,
    'task.phase': runtime.task.phase,
    'heartbeat.lastSeen': runtime.heartbeat.lastSeen,
    'heartbeat.age': deriveHeartbeatAge(runtime.heartbeat.lastSeen),
    'queue.pending': runtime.queue.pending,
    'queue.backlog': runtime.queue.backlog,
    'blockers.summary': summarizeBlockers(runtime.blockers)
  };
}

function computeBoardHeadline(runtime) {
  const presence = String(runtime.bot.presence).toUpperCase();
  const connection = String(runtime.bot.connection).toUpperCase();
  return `${presence} · ${connection}`;
}

export function buildDesiredBoard(config) {
  const stateMap = buildStateMap(config.runtime);
  const desiredCategoryName = `${config.board.baseName} · ${computeBoardHeadline(config.runtime)}`;

  const channels = config.board.channels.map((channel) => {
    const stateValue = stateMap[channel.stateBinding] ?? 'unknown';

    return {
      key: channel.key,
      logicalLabel: channel.label,
      stateBinding: channel.stateBinding,
      rawValue: stateValue,
      name: renderTemplate(channel.template, stateValue, config.board.maxNameLength),
      position: channel.position
    };
  });

  return {
    category: {
      key: config.board.key,
      name: truncateName(desiredCategoryName, config.board.maxNameLength),
      position: config.board.sortOffset,
      channels
    }
  };
}
