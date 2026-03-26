#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';

function parseArgs(argv) {
  const args = {
    guildId: null,
    tokenEnvVar: 'DISCORD_BOT_TOKEN',
    output: null,
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--guild-id') args.guildId = argv[++index];
    else if (token === '--token-env') args.tokenEnvVar = argv[++index];
    else if (token === '--output') args.output = argv[++index];
    else if (token === '--json') args.json = true;
  }

  if (!args.guildId) {
    throw new Error('Usage: node scripts/discord-list-guild-channels.js --guild-id <id> [--json] [--output <path>]');
  }

  return args;
}

function classifyChannelType(type) {
  if (type === 4) return 'category';
  if (type === 0) return 'text';
  return 'other';
}

function formatTree(records) {
  const categories = records
    .filter((entry) => classifyChannelType(entry.type) === 'category')
    .sort((left, right) => left.position - right.position)
    .map((category) => ({
      ...category,
      channels: records
        .filter((entry) => classifyChannelType(entry.type) === 'text' && entry.parent_id === category.id)
        .sort((left, right) => left.position - right.position)
    }));

  const uncategorized = records
    .filter((entry) => classifyChannelType(entry.type) === 'text' && !entry.parent_id)
    .sort((left, right) => left.position - right.position);

  const lines = [];
  for (const category of categories) {
    lines.push(`CATEGORY ${category.name} (${category.id}) position=${category.position}`);
    for (const channel of category.channels) {
      lines.push(`  - #${channel.name} (${channel.id}) position=${channel.position}`);
    }
  }

  if (uncategorized.length > 0) {
    lines.push('UNCATEGORIZED');
    for (const channel of uncategorized) {
      lines.push(`  - #${channel.name} (${channel.id}) position=${channel.position}`);
    }
  }

  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
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
  const payload = args.json ? JSON.stringify(records, null, 2) : formatTree(records);

  if (args.output) {
    await fs.writeFile(args.output, payload + '\n', 'utf8');
  }

  console.log(payload);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
