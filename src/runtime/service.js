import { buildDesiredBoard } from './board-model.js';
import { reconcileBoard } from '../reconciler/reconciler.js';

export class StatusTrackerService {
  constructor({ config, adapter }) {
    this.config = config;
    this.adapter = adapter;
  }

  async plan() {
    const actualGuild = await this.adapter.fetchGuildState();
    const desiredBoard = buildDesiredBoard(this.config);
    const plan = reconcileBoard(actualGuild, desiredBoard);

    return {
      actualGuild,
      desiredBoard,
      plan,
      summary: {
        operations: plan.operations.length,
        notes: plan.notes.length,
        dryRun: this.config.discord?.dryRun ?? false
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
    return {
      ...planned,
      applyResult: result
    };
  }
}
