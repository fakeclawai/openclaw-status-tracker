function ensureCategory(guildState, parentKey) {
  const category = guildState.categories.find((entry) => entry.key === parentKey);
  if (!category) {
    throw new Error(`Cannot find category for key ${parentKey}`);
  }
  return category;
}

export class MockDiscordAdapter {
  constructor(initialGuildState) {
    this.guildState = structuredClone(initialGuildState);
  }

  async fetchGuildState() {
    return structuredClone(this.guildState);
  }

  async applyPlan(plan) {
    const applied = [];

    for (const operation of plan.operations) {
      switch (operation.type) {
        case 'createCategory': {
          this.guildState.categories.push({
            id: `sim-cat-${this.guildState.categories.length + 1}`,
            key: operation.key,
            name: operation.name,
            position: operation.position,
            channels: []
          });
          break;
        }
        case 'renameCategory': {
          const category = ensureCategory(this.guildState, operation.key);
          category.name = operation.to;
          break;
        }
        case 'moveCategory': {
          const category = ensureCategory(this.guildState, operation.key);
          category.position = operation.to;
          break;
        }
        case 'createChannel': {
          const category = ensureCategory(this.guildState, operation.parentKey);
          category.channels.push({
            id: `sim-chan-${category.channels.length + 1}`,
            key: operation.key,
            name: operation.name,
            position: operation.position
          });
          break;
        }
        case 'renameChannel': {
          const category = this.guildState.categories.find((entry) => entry.channels.some((channel) => channel.key === operation.key));
          const channel = category?.channels.find((entry) => entry.key === operation.key);
          if (!channel) throw new Error(`Cannot find channel for key ${operation.key}`);
          channel.name = operation.to;
          break;
        }
        case 'moveChannel': {
          const category = this.guildState.categories.find((entry) => entry.channels.some((channel) => channel.key === operation.key));
          const channel = category?.channels.find((entry) => entry.key === operation.key);
          if (!channel) throw new Error(`Cannot find channel for key ${operation.key}`);
          channel.position = operation.to;
          break;
        }
        default:
          throw new Error(`Unsupported operation type: ${operation.type}`);
      }

      applied.push({ ...operation, status: 'simulated' });
    }

    return {
      applied,
      resultingState: structuredClone(this.guildState)
    };
  }
}
