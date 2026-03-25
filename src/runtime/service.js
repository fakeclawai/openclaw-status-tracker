import { buildDesiredBoard } from './board-model.js';
import { reconcileBoard } from '../reconciler/reconciler.js';
import { applyPlanPolicy, recordApplyResult } from './persistent-state.js';

export class StatusTrackerService {
  constructor({ config, adapter, persistentState = null, policy = null, statePath = null }) {
    this.config = config;
    this.adapter = adapter;
    this.persistentState = persistentState;
    this.policy = policy ?? config.runner ?? {};
    this.statePath = statePath;
  }

  async plan() {
    const actualGuild = await this.adapter.fetchGuildState();
    const desiredBoard = buildDesiredBoard(this.config);
    const rawPlan = reconcileBoard(actualGuild, desiredBoard);
    const policyResult = applyPlanPolicy({
      plan: rawPlan,
      state: this.persistentState,
      policy: this.policy
    });
    const plan = policyResult.plan;

    return {
      actualGuild,
      desiredBoard,
      rawPlan,
      plan,
      persistentState: policyResult.state,
      summary: {
        operations: plan.operations.length,
        rawOperations: rawPlan.operations.length,
        notes: plan.notes.length,
        dryRun: this.config.discord?.dryRun ?? false,
        statePath: this.statePath
      }
    };
  }

  async apply() {
    const planned = await this.plan();
    if (planned.plan.operations.length === 0) {
      return {
        ...planned,
        applyResult: {
          applied: [],
          skipped: [],
          dryRun: this.config.discord?.dryRun ?? false,
          message: 'No changes required.'
        }
      };
    }

    const result = await this.adapter.applyPlan(planned.plan);
    const persistentState = recordApplyResult({
      state: planned.persistentState,
      desiredBoard: planned.desiredBoard,
      applyResult: result,
      policy: this.policy
    });

    return {
      ...planned,
      persistentState,
      applyResult: result
    };
  }
}
