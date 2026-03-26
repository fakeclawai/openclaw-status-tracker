#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const CHANNEL_TYPES = new Map([
  [0, 'text'],
  [2, 'voice'],
  [4, 'category'],
  [5, 'announcement'],
  [11, 'thread'],
  [13, 'stage'],
  [15, 'forum']
]);

function usage() {
  return `Usage:
  node scripts/discord-list-guild-channels.js --guild-id <id> [options]

Options:
  --guild-id <id>        Discord guild ID (or set DISCORD_GUILD_ID)
  --token-env <name>     Bot token env var name (default: DISCORD_BOT_TOKEN)
  --json                 Print raw JSON instead of a readable tree
  --output <path>        Write the rendered output to a file
  --write-defaults       Write both text and JSON snapshots under runtime/generated/
  --help                 Show this help
`;
}

function parseArgs(argv) {
  const args = {
    guildId: process.env.DISCORD_GUILD_ID ?? null,
    tokenEnvVar: 'DISCORD_BOT_TOKEN',
    output: null,
    json: false,
    writeDefaults: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--guild-id') args.guildId = argv[++index];
    else if (token === '--token-env') args.tokenEnvVar = argv[++index];
    else if (token === '--output') args.output = argv[++index];
    else if (token === '--json') args.json = true;
    else if (token === '--write-defaults') args.writeDefaults = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }

  if (args.help) {
    return args;
  }

  if (!args.guildId) {
    throw new Error(`${usage()}\nMissing required --guild-id <id> (or DISCORD_GUILD_ID).`);
  }

  return args;
}

function classifyChannelType(type) {
  return CHANNEL_TYPES.get(type) ?? `other:${type}`;
}

function formatTree(records) {
  const byCategory = new Map();
  const categories = records
    .filter((entry) => classifyChannelType(entry.type) === 'category')
    .sort((left, right) => left.position - right.position);

  for (const category of categories) {
    byCategory.set(category.id, []);
  }

  const uncategorized = [];
  const nonText = [];

  for (const entry of records) {
    const type = classifyChannelType(entry.type);
    if (type === 'category') continue;

    if (type === 'text' || type === 'announcement') {
      if (entry.parent_id && byCategory.has(entry.parent_id)) {
        byCategory.get(entry.parent_id).push(entry);
      } else {
        uncategorized.push(entry);
      }
      continue;
    }

    nonText.push(entry);
  }

  const lines = [];
  for (const category of categories) {
    lines.push(`CATEGORY ${category.name} (${category.id}) position=${category.position}`);
    const children = (byCategory.get(category.id) ?? []).sort((left, right) => left.position - right.position);
    for (const channel of children) {
      lines.push(`  - [${classifyChannelType(channel.type)}] #${channel.name} (${channel.id}) position=${channel.position}`);
    }
  }

  if (uncategorized.length > 0) {
    lines.push('UNCATEGORIZED');
    for (const channel of uncategorized.sort((left, right) => left.position - right.position)) {
      lines.push(`  - [${classifyChannelType(channel.type)}] #${channel.name} (${channel.id}) position=${channel.position}`);
    }
  }

  if (nonText.length > 0) {
    lines.push('OTHER CHANNELS');
    for (const channel of nonText.sort((left, right) => left.position - right.position)) {
      lines.push(`  - [${classifyChannelType(channel.type)}] ${channel.name} (${channel.id}) position=${channel.position}`);
    }
  }

  return lines.join('\n');
}

async function writeFileSafely(targetPath, payload) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, payload.endsWith('\n') ? payload : `${payload}\n`, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const token = process.env[args.tokenEnvVar];
  if (!token) {
    throw new Error(`Missing Discord bot token. Export ${args.tokenEnvVar}.`);
  }

  const response = await fetch(`https://discord.com/api/v10/guilds/${args.guildId}/channels`, {
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Discord API request failed: ${response.status} ${response.statusText} ${detail}`);
  }

  const records = await response.json();
  const rendered = args.json ? JSON.stringify(records, null, 2) : formatTree(records);

  if (args.output) {
    await writeFileSafely(args.output, rendered);
  }

  if (args.writeDefaults) {
    const basePath = path.join('runtime', 'generated', `discord-guild-${args.guildId}-channels`);
    await writeFileSafely(`${basePath}.txt`, formatTree(records));
    await writeFileSafely(`${basePath}.json`, JSON.stringify(records, null, 2));
  }

  console.log(rendered);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
