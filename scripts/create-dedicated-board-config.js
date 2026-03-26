#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
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

function usage() {
  return `Usage:
  node scripts/create-dedicated-board-config.js [options]

Explicit ID mode:
  --guild-id <id>
  --category-id <id>
  --connection-id <id>
  --activity-id <id>
  --task-id <id>
  --phase-id <id>
  --heartbeat-id <id>
  --pending-id <id>
  --backlog-id <id>
  --blockers-id <id>

Inventory-assisted mode:
  --guild-id <id>              Optional if inventory has channels from one guild
  --inventory-json <path>      Raw JSON from discord-list-guild-channels.js --json
  --category-name <name>       Category containing the dedicated tracker board
  --channel-prefix <prefix>    Prefix for channel names (default: openclaw-)

Common options:
  --guild-name <name>          Default: OpenClaw Test Ops
  --board-key <key>            Default: openclaw-discord-status-dedicated
  --base-name <name>           Default: OPENCLAW
  --state-file <path>          Default: .state/live-status-tracker.dedicated.json
  --snapshot-path <path>       Snapshot file path written into config
  --output <path>              Default: runtime/live-config.local.json
  --stdout                     Print only; do not write a file
  --help                       Show this help
`;
}

function parseArgs(argv) {
  const args = {
    guildId: null,
    guildName: 'OpenClaw Test Ops',
    categoryId: null,
    categoryName: null,
    inventoryJson: null,
    channelPrefix: 'openclaw-',
    boardKey: 'openclaw-discord-status-dedicated',
    baseName: 'OPENCLAW',
    stateFile: '.state/live-status-tracker.dedicated.json',
    snapshotPath: null,
    output: 'runtime/live-config.local.json',
    stdout: false,
    help: false,
    channelIds: {}
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--guild-id') args.guildId = argv[++index];
    else if (token === '--guild-name') args.guildName = argv[++index];
    else if (token === '--category-id') args.categoryId = argv[++index];
    else if (token === '--category-name') args.categoryName = argv[++index];
    else if (token === '--inventory-json') args.inventoryJson = argv[++index];
    else if (token === '--channel-prefix') args.channelPrefix = argv[++index];
    else if (token === '--board-key') args.boardKey = argv[++index];
    else if (token === '--base-name') args.baseName = argv[++index];
    else if (token === '--state-file') args.stateFile = argv[++index];
    else if (token === '--snapshot-path') args.snapshotPath = argv[++index];
    else if (token === '--output') args.output = argv[++index];
    else if (token === '--stdout') args.stdout = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else if (token.startsWith('--') && token.endsWith('-id')) {
      const key = token.slice(2, -3);
      args.channelIds[key] = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function resolveSnapshotPath(args) {
  if (args.snapshotPath) {
    return args.snapshotPath;
  }

  return 'runtime/live-openclaw-runtime.snapshot.json';
}

async function readInventory(args) {
  if (!args.inventoryJson) {
    return null;
  }

  const raw = await fs.readFile(args.inventoryJson, 'utf8');
  const records = JSON.parse(raw);
  if (!Array.isArray(records)) {
    throw new Error(`Inventory JSON must be an array of Discord channel records: ${args.inventoryJson}`);
  }

  return records;
}

function findCategory(records, args) {
  if (args.categoryId) {
    const category = records.find((entry) => entry.id === args.categoryId && entry.type === 4);
    if (!category) {
      throw new Error(`Category ID ${args.categoryId} was not found in inventory.`);
    }
    return category;
  }

  if (!args.categoryName) {
    throw new Error('Inventory-assisted mode requires --category-name unless --category-id is provided.');
  }

  const categories = records.filter((entry) => entry.type === 4 && entry.name === args.categoryName);
  if (categories.length === 0) {
    throw new Error(`Category named "${args.categoryName}" was not found in inventory.`);
  }
  if (categories.length > 1) {
    throw new Error(`Category named "${args.categoryName}" is ambiguous in inventory. Re-run with --category-id.`);
  }

  return categories[0];
}

function fillIdsFromInventory(args, records) {
  if (!records) {
    return args;
  }

  const category = findCategory(records, args);
  args.categoryId = category.id;

  const channelsInCategory = records.filter((entry) => entry.parent_id === category.id);
  for (const [key] of CHANNEL_SPECS) {
    if (args.channelIds[key]) continue;

    const expectedName = `${args.channelPrefix}${key}`;
    const matches = channelsInCategory.filter((entry) => entry.type === 0 && entry.name === expectedName);
    if (matches.length === 1) {
      args.channelIds[key] = matches[0].id;
      continue;
    }

    if (matches.length > 1) {
      throw new Error(`Channel name "${expectedName}" is ambiguous in category "${category.name}". Pass --${key}-id explicitly.`);
    }

    throw new Error(`Missing channel "${expectedName}" in category "${category.name}". Create it first or pass --${key}-id.`);
  }

  return args;
}

function validateArgs(args) {
  if (!args.guildId && !args.inventoryJson) {
    throw new Error(`${usage()}\nMissing required --guild-id <id> (or provide --inventory-json and explicit --guild-id).`);
  }

  if (!args.categoryId && !args.inventoryJson) {
    throw new Error(`${usage()}\nMissing required --category-id <id> or --inventory-json + --category-name.`);
  }

  for (const [key] of CHANNEL_SPECS) {
    if (!args.channelIds[key] && !args.inventoryJson) {
      throw new Error(`${usage()}\nMissing required --${key}-id argument.`);
    }
  }
}

function inferGuildIdFromInventory(records, args) {
  if (args.guildId) {
    return args.guildId;
  }

  const guildIds = new Set(records.map((entry) => entry.guild_id).filter(Boolean));
  if (guildIds.size === 1) {
    return [...guildIds][0];
  }

  throw new Error('Could not infer guild ID from inventory. Pass --guild-id explicitly.');
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
  if (args.help) {
    console.log(usage());
    return;
  }

  const inventory = await readInventory(args);
  validateArgs(args);

  if (inventory) {
    fillIdsFromInventory(args, inventory);
    args.guildId = inferGuildIdFromInventory(inventory, args);
  }

  const payload = JSON.stringify(buildConfig(args), null, 2) + '\n';

  if (!args.stdout) {
    await fs.mkdir(path.dirname(args.output), { recursive: true });
    await fs.writeFile(args.output, payload, 'utf8');
    console.error(`Wrote dedicated-board config to ${args.output}`);
  }

  console.log(payload);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
