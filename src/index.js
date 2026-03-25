#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { loadJson, normalizeConfig, validateConfig } from './config/load-config.js';
import { MockDiscordAdapter } from './adapters/mock-discord-adapter.js';
import { StatusTrackerService } from './runtime/service.js';
import { formatPlan } from './reconciler/reconciler.js';

function parseArgs(argv) {
  const args = {
    config: 'examples/config.sample.json',
    guild: 'examples/mock-guild-state.json',
    apply: false,
    output: 'plan'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--config') args.config = argv[++index];
    else if (token === '--guild') args.guild = argv[++index];
    else if (token === '--apply') args.apply = true;
    else if (token === '--output') args.output = argv[++index];
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const configPath = path.resolve(cwd, args.config);
  const guildPath = path.resolve(cwd, args.guild);

  const rawConfig = await loadJson(configPath);
  const validation = validateConfig(rawConfig);
  if (!validation.valid) {
    console.error('Config validation failed:');
    for (const error of validation.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  const config = normalizeConfig(rawConfig);
  const guildState = await loadJson(guildPath);

  const service = new StatusTrackerService({
    config,
    adapter: new MockDiscordAdapter(guildState)
  });

  const result = args.apply ? await service.apply() : await service.plan();

  if (args.output === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`# Guild: ${config.guild.name}`);
  console.log(`# Desired category: ${result.desiredBoard.category.name}`);
  console.log('');
  console.log(formatPlan(result.plan));

  if (args.apply && result.applyResult) {
    console.log('');
    console.log(`# Apply result: ${result.applyResult.applied.length} simulated operations`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
