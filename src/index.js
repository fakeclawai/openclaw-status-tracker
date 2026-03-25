#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { loadJson, loadRuntimeEnv, normalizeConfig, validateConfig, validateResolvedRuntime } from './config/load-config.js';
import { MockDiscordAdapter } from './adapters/mock-discord-adapter.js';
import { DiscordRestAdapter } from './adapters/discord-rest-adapter.js';
import { StatusTrackerService } from './runtime/service.js';
import { resolveRuntimeState } from './runtime/ingest-runtime.js';
import { formatPlan } from './reconciler/reconciler.js';

function parseArgs(argv) {
  const args = {
    config: 'examples/config.sample.json',
    guild: 'examples/mock-guild-state.json',
    apply: false,
    output: 'plan',
    adapter: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--config') args.config = argv[++index];
    else if (token === '--guild') args.guild = argv[++index];
    else if (token === '--apply') args.apply = true;
    else if (token === '--output') args.output = argv[++index];
    else if (token === '--adapter') args.adapter = argv[++index];
  }

  return args;
}

async function buildAdapter({ args, config, cwd }) {
  const mode = args.adapter || config.discord.mode;

  if (mode === 'mock') {
    const guildPath = path.resolve(cwd, args.guild);
    const guildState = await loadJson(guildPath);
    return new MockDiscordAdapter(guildState);
  }

  if (mode === 'discord-rest') {
    if (!config.discord.token) {
      throw new Error(`Missing Discord token. Export ${config.discord.tokenEnvVar} before using --adapter discord-rest.`);
    }

    if (config.discord.testServerOnly !== true) {
      throw new Error('Refusing live Discord mode because discord.testServerOnly is not true. Keep this pinned to a test server until cooldown persistence and audit storage exist.');
    }

    return new DiscordRestAdapter({
      guildId: config.guild.id,
      token: config.discord.token,
      config
    });
  }

  throw new Error(`Unsupported adapter mode: ${mode}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const configPath = path.resolve(cwd, args.config);

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

  const normalizedConfig = loadRuntimeEnv(normalizeConfig(rawConfig));
  const { runtime, metadata: runtimeMetadata } = await resolveRuntimeState(normalizedConfig, { configPath });
  const runtimeValidation = validateResolvedRuntime(runtime);
  if (!runtimeValidation.valid) {
    console.error('Resolved runtime validation failed:');
    for (const error of runtimeValidation.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  const config = {
    ...normalizedConfig,
    runtime,
    runtimeMetadata
  };

  const adapter = await buildAdapter({ args, config, cwd });
  const service = new StatusTrackerService({ config, adapter });
  const result = args.apply ? await service.apply() : await service.plan();

  if (args.output === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`# Guild: ${config.guild.name}`);
  console.log(`# Adapter: ${args.adapter || config.discord.mode}`);
  console.log(`# Desired category: ${result.desiredBoard.category.name}`);
  console.log(`# Dry run: ${config.discord.dryRun ? 'yes' : 'no'}`);
  if (config.runtimeMetadata?.sourcesUsed?.length) {
    console.log(`# Runtime sources: ${config.runtimeMetadata.sourcesUsed.map((entry) => entry.path || entry.type).join(', ')}`);
  }
  console.log('');
  console.log(formatPlan(result.plan));

  if (args.apply && result.applyResult) {
    console.log('');
    console.log(`# Apply result: ${result.applyResult.applied.length} operations ${config.discord.dryRun ? '(dry-run)' : '(live)'}`);
    if (result.applyResult.skipped?.length) {
      console.log(`# Skipped: ${result.applyResult.skipped.length}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
