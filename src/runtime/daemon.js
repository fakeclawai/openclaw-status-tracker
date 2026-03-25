import path from 'node:path';
import { loadJson, loadRuntimeEnv, normalizeConfig, validateConfig, validateResolvedRuntime } from '../config/load-config.js';
import { resolveRuntimeState } from './ingest-runtime.js';
import { StatusTrackerService } from './service.js';
import { loadPersistentState, savePersistentState } from './persistent-state.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildResolvedConfig(configPath) {
  const rawConfig = await loadJson(configPath);
  const validation = validateConfig(rawConfig);
  if (!validation.valid) {
    throw new Error(`Config validation failed:\n- ${validation.errors.join('\n- ')}`);
  }

  const normalizedConfig = loadRuntimeEnv(normalizeConfig(rawConfig));
  const { runtime, metadata: runtimeMetadata } = await resolveRuntimeState(normalizedConfig, { configPath });
  const runtimeValidation = validateResolvedRuntime(runtime);
  if (!runtimeValidation.valid) {
    throw new Error(`Resolved runtime validation failed:\n- ${runtimeValidation.errors.join('\n- ')}`);
  }

  return {
    ...normalizedConfig,
    runtime,
    runtimeMetadata
  };
}

function summarizeCycle(result) {
  return {
    desiredCategory: result.desiredBoard.category.name,
    operations: result.plan.operations.length,
    notes: result.plan.notes.length,
    applied: result.applyResult?.applied?.length ?? 0,
    skipped: result.applyResult?.skipped?.length ?? 0,
    dryRun: result.summary?.dryRun ?? false
  };
}

export async function runTrackerWatch({ configPath, adapter, statePath, apply, intervalMs, maxCycles = 0, onCycle }) {
  let state = await loadPersistentState(statePath);
  let cycle = 0;

  while (true) {
    cycle += 1;
    const cycleStartedAt = new Date().toISOString();

    try {
      const config = await buildResolvedConfig(configPath);
      const service = new StatusTrackerService({
        config,
        adapter,
        persistentState: state,
        policy: config.runner,
        statePath
      });

      const result = apply ? await service.apply() : await service.plan();
      state = result.persistentState;
      await savePersistentState(statePath, state);

      onCycle?.({
        cycle,
        startedAt: cycleStartedAt,
        status: 'ok',
        summary: summarizeCycle(result),
        result
      });
    } catch (error) {
      onCycle?.({
        cycle,
        startedAt: cycleStartedAt,
        status: 'error',
        error
      });
    }

    if (maxCycles > 0 && cycle >= maxCycles) {
      return { cycles: cycle, statePath };
    }

    await sleep(intervalMs);
  }
}

export function resolveStatePath({ configPath, cliStatePath, config }) {
  const baseDir = path.dirname(configPath);
  const configured = cliStatePath || config.runner?.stateFile || '.state/openclaw-status-tracker.json';
  return path.isAbsolute(configured) ? configured : path.resolve(baseDir, configured);
}
