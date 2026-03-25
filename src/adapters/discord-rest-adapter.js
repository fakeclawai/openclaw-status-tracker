function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyChannelType(type) {
  if (type === 4) return 'category';
  if (type === 0) return 'text';
  return 'other';
}

async function parseError(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class DiscordRestAdapter {
  constructor({ guildId, token, config }) {
    this.guildId = guildId;
    this.token = token;
    this.config = config;
    this.apiBaseUrl = config.discord.apiBaseUrl;
  }

  async request(method, pathname, body) {
    const response = await fetch(`${this.apiBaseUrl}${pathname}`, {
      method,
      headers: {
        Authorization: `Bot ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw new Error(`Discord rate limited request (${method} ${pathname}). Retry-After=${retryAfter || 'unknown'} seconds. Backoff persistence still needs implementation.`);
    }

    if (!response.ok) {
      const detail = await parseError(response);
      throw new Error(`Discord API request failed (${method} ${pathname}): ${response.status} ${response.statusText} ${JSON.stringify(detail)}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  async fetchGuildState() {
    const records = await this.request('GET', `/guilds/${this.guildId}/channels`);
    const categories = records
      .filter((entry) => classifyChannelType(entry.type) === 'category')
      .map((category) => ({
        id: category.id,
        key: category.id,
        name: category.name,
        position: category.position,
        channels: records
          .filter((entry) => classifyChannelType(entry.type) === 'text' && entry.parent_id === category.id)
          .sort((a, b) => a.position - b.position)
          .map((channel) => ({
            id: channel.id,
            key: channel.id,
            name: channel.name,
            position: channel.position,
            parentId: channel.parent_id
          }))
      }))
      .sort((a, b) => a.position - b.position);

    return {
      guild: { id: this.guildId },
      categories
    };
  }

  async applyPlan(plan) {
    const applied = [];
    const skipped = [];
    const maxOpsPerRun = this.config.discord.maxOpsPerRun;
    const allowCreate = this.config.discord.allowCreate;

    if (plan.operations.length === 0) {
      return { applied, skipped, dryRun: this.config.discord.dryRun };
    }

    const operations = plan.operations.slice(0, maxOpsPerRun > 0 ? maxOpsPerRun : plan.operations.length);
    if (plan.operations.length > operations.length) {
      skipped.push({
        reason: `Operation cap hit: planned ${plan.operations.length}, allowed ${operations.length} this run.`
      });
    }

    for (const operation of operations) {
      if (operation.type === 'createCategory' || operation.type === 'createChannel') {
        if (!allowCreate) {
          skipped.push({ ...operation, reason: 'Create skipped because discord.allowCreate=false.' });
          continue;
        }
      }

      if (this.config.discord.dryRun) {
        applied.push({ ...operation, status: 'dry-run' });
        continue;
      }

      switch (operation.type) {
        case 'renameCategory':
          await this.request('PATCH', `/channels/${operation.id}`, { name: operation.to });
          break;
        case 'moveCategory':
          await this.request('PATCH', `/channels/${operation.id}`, { position: operation.to });
          break;
        case 'renameChannel':
          await this.request('PATCH', `/channels/${operation.id}`, { name: operation.to });
          break;
        case 'moveChannel':
          await this.request('PATCH', `/channels/${operation.id}`, { position: operation.to });
          break;
        case 'createCategory':
          await this.request('POST', `/guilds/${this.guildId}/channels`, {
            name: operation.name,
            type: 4,
            position: operation.position
          });
          break;
        case 'createChannel':
          await this.request('POST', `/guilds/${this.guildId}/channels`, {
            name: operation.name,
            type: 0,
            parent_id: operation.parentId,
            position: operation.position
          });
          break;
        default:
          throw new Error(`Unsupported operation type: ${operation.type}`);
      }

      applied.push({ ...operation, status: 'applied' });

      if (this.config.discord.requestDelayMs > 0) {
        await sleep(this.config.discord.requestDelayMs);
      }
    }

    return {
      applied,
      skipped,
      dryRun: this.config.discord.dryRun
    };
  }
}
