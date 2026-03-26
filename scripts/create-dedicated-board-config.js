#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';

const CHANNEL_SPECS = [
  ['connection', 'Connection', 'connection', 'connection-{value}'],
  ['activity', 'Activity', 'activity', 'activity-{value}'],
  ['task', 'Current Task', 'task.current', 'task-{value}'],
  ['phase', 'Phase', 'task.phase', 'phase-{value}'],
  ['heartbeat', 'Heartbeat Age', 'heartbeat.age', 'heartbeat-{value}'],
  ['pending', 'Pending Queue', 'queue.pending', 'queue-{value}-active'],
  ['backlog', 'Backlog', 'queue.backlog', 'backlog-{value}'],
  ['blockers', 'Blockers', 'blockers.summary', 'blockers-{value}']
];

function parseArgs(argv) {
  const args = {
    guildId: null,
    guildName: 'OpenClaw Test Ops',
    categoryId: null,
    boardKey: 'openclaw-discord-status-dedicated',
    baseName: 'OPENCLAW',
    stateFile: '.state/live-status-tracker.dedicated.json',
    snapshotPath: null,
    output: null,
    channelIds: {}
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--guild-id') args.guildId = argv[++index];
    else if (token === '--guild-name') args.guildName = argv[++index];
    else if (token === '--category-id') args.categoryId = argv[++index];
    else if (token === '--board-key') args.boardKey = argv[++index];
    else if (token === '--base-name') args.baseName = argv[++index];
    else if (token === '--state-file') args.stateFile = argv[++index];
    else if (token === '--snapshot-path') args.snapshotPath = argv[++index];
    else if (token === '--output') args.output = argv[++index];
    else if (token.startsWith('--') && token.endsWith('-id')) {
      const key = token.slice(2, -3);
      args.channelIds[key] = argv[++index];
    }
  }

  if (!args.guildId || !args.categoryId) {
    throw new Error('Usage: node scripts/create-dedicated-board-config.js --guild-id <id> --category-id <id> --connection-id <id> ... --output runtime/live-config.local.json');
  }

  for (const [key] of CHANNEL_SPECS) {
    if (!args.channelIds[key]) {
      throw new Error(`Missing required --${key}-id argument.`);
    }
  }

  return args;
}

function resolveSnapshotPath(args) {
  if (args.snapshotPath) {
    return args.snapshotPath;
  }

  if (args.output) {
    return 'live-openclaw-runtime.snapshot.json';
  }

  return 'runtime/live-openclaw-runtime.snapshot.json';
}

function buildConfig(args) {
  const snapshotPath = resolveSnapshotPath(args);

  return {
    guild: {
      id: args.guildId,
      name: args.guildName
    },
    discord: {
      mode: 'discord-rest',
      tokenEnvVar: 'DISCORD_BOT_TOKEN',
      dryRun: true,
      allowCreate: false,
      testServerOnly: true,
      maxOpsPerRun: 4,
      requestDelayMs: 1000
    },
    runner: {
      intervalMs: 300000,
      renameCooldownMs: 600000,
      renameSettleMs: 180000,
      stateFile: args.stateFile
    },
    board: {
      key: args.boardKey,
      baseName: args.baseName,
      managedCategoryId: args.categoryId,
      sortOffset: 10,
      maxNameLength: 60,
      channels: CHANNEL_SPECS.map(([key, label, stateBinding, template], position) => ({
        id: args.channelIds[key],
        key,
        label,
        stateBinding,
        template,
        position
      }))
    },
    runtime: {
      bot: {
        presence: 'offline',
        connection: 'disconnected',
        activity: 'starting'
      },
      task: {
        current: 'awaiting-runtime-snapshot',
        phase: 'boot'
      },
      heartbeat: {
        lastSeen: '2026-03-25T17:20:00Z'
      },
      queue: {
        pending: 0,
        backlog: 0
      },
      blockers: []
    },
    runtimeSources: {
      snapshotFile: {
        path: snapshotPath
      },
      env: {
        presence: 'OPENCLAW_PRESENCE',
        connection: 'OPENCLAW_CONNECTION',
        activity: 'OPENCLAW_ACTIVITY',
        taskCurrent: 'OPENCLAW_TASK_CURRENT',
        taskPhase: 'OPENCLAW_TASK_PHASE',
        heartbeatLastSeen: 'OPENCLAW_HEARTBEAT_LAST_SEEN',
        queuePending: 'OPENCLAW_QUEUE_PENDING',
        queueBacklog: 'OPENCLAW_QUEUE_BACKLOG',
        blockersJson: 'OPENCLAW_BLOCKERS_JSON'
      }
    }
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = JSON.stringify(buildConfig(args), null, 2) + '\n';

  if (args.output) {
    await fs.writeFile(args.output, payload, 'utf8');
  }

  console.log(payload);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
