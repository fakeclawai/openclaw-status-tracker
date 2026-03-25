function ensureCategory(guildState, parentKey, parentId) {
  const category = guildState.categories.find((entry) => (parentId && entry.id === parentId) || entry.key === parentKey);
  if (!category) {
    throw new Error(`Cannot find category for key ${parentKey}`);
  }
  return category;
}

function ensureChannel(guildState, key, id) {
  const category = guildState.categories.find((entry) => entry.channels.some((channel) => (id && channel.id === id) || channel.key === key));
  const channel = category?.channels.find((entry) => (id && entry.id === id) || entry.key === key);
  if (!channel) {
    throw new Error(`Cannot find channel for key ${key}`);
  }
  return { category, channel };
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
            id: operation.id || `sim-cat-${this.guildState.categories.length + 1}`,
            key: operation.key,
            name: operation.name,
            position: operation.position,
            channels: []
          });
          break;
        }
        case 'renameCategory': {
          const category = ensureCategory(this.guildState, operation.key, operation.id);
          category.name = operation.to;
          break;
        }
        case 'moveCategory': {
          const category = ensureCategory(this.guildState, operation.key, operation.id);
          category.position = operation.to;
          break;
        }
        case 'createChannel': {
          const category = ensureCategory(this.guildState, operation.parentKey, operation.parentId);
          category.channels.push({
            id: operation.id || `sim-chan-${category.channels.length + 1}`,
            key: operation.key,
            name: operation.name,
            position: operation.position
          });
          break;
        }
        case 'renameChannel': {
          const { channel } = ensureChannel(this.guildState, operation.key, operation.id);
          channel.name = operation.to;
          break;
        }
        case 'moveChannel': {
          const { channel } = ensureChannel(this.guildState, operation.key, operation.id);
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
