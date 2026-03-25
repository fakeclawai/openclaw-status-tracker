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
      plan
    };
  }

  async apply() {
    const planned = await this.plan();
    const result = await this.adapter.applyPlan(planned.plan);
    return {
      ...planned,
      applyResult: result
    };
  }
}
