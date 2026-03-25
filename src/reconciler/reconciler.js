function sortByPosition(items) {
  return [...items].sort((a, b) => a.position - b.position);
}

export function reconcileBoard(actualGuild, desiredBoard) {
  const operations = [];
  const notes = [];

  const actualCategory = actualGuild.categories.find((category) => category.key === desiredBoard.category.key);

  if (!actualCategory) {
    operations.push({
      type: 'createCategory',
      key: desiredBoard.category.key,
      name: desiredBoard.category.name,
      position: desiredBoard.category.position
    });

    for (const channel of sortByPosition(desiredBoard.category.channels)) {
      operations.push({
        type: 'createChannel',
        parentKey: desiredBoard.category.key,
        key: channel.key,
        name: channel.name,
        position: channel.position
      });
    }

    return { operations, notes };
  }

  if (actualCategory.name !== desiredBoard.category.name) {
    operations.push({
      type: 'renameCategory',
      id: actualCategory.id,
      key: actualCategory.key,
      from: actualCategory.name,
      to: desiredBoard.category.name
    });
  }

  if (actualCategory.position !== desiredBoard.category.position) {
    operations.push({
      type: 'moveCategory',
      id: actualCategory.id,
      key: actualCategory.key,
      from: actualCategory.position,
      to: desiredBoard.category.position
    });
  }

  const actualChannelsByKey = new Map(actualCategory.channels.map((channel) => [channel.key, channel]));

  for (const desiredChannel of sortByPosition(desiredBoard.category.channels)) {
    const actualChannel = actualChannelsByKey.get(desiredChannel.key);

    if (!actualChannel) {
      operations.push({
        type: 'createChannel',
        parentId: actualCategory.id,
        parentKey: actualCategory.key,
        key: desiredChannel.key,
        name: desiredChannel.name,
        position: desiredChannel.position
      });
      continue;
    }

    if (actualChannel.name !== desiredChannel.name) {
      operations.push({
        type: 'renameChannel',
        id: actualChannel.id,
        key: actualChannel.key,
        from: actualChannel.name,
        to: desiredChannel.name
      });
    }

    if (actualChannel.position !== desiredChannel.position) {
      operations.push({
        type: 'moveChannel',
        id: actualChannel.id,
        key: actualChannel.key,
        from: actualChannel.position,
        to: desiredChannel.position
      });
    }
  }

  for (const actualChannel of actualCategory.channels) {
    const stillManaged = desiredBoard.category.channels.some((channel) => channel.key === actualChannel.key);
    if (!stillManaged) {
      notes.push(`Unmanaged channel preserved: ${actualChannel.name} (${actualChannel.key})`);
    }
  }

  return { operations, notes };
}

export function formatPlan(plan) {
  const lines = [];

  if (plan.operations.length === 0) {
    lines.push('No changes required.');
  } else {
    for (const operation of plan.operations) {
      switch (operation.type) {
        case 'createCategory':
          lines.push(`+ create category ${operation.name} @${operation.position}`);
          break;
        case 'renameCategory':
          lines.push(`~ rename category ${operation.from} -> ${operation.to}`);
          break;
        case 'moveCategory':
          lines.push(`↕ move category ${operation.key} ${operation.from} -> ${operation.to}`);
          break;
        case 'createChannel':
          lines.push(`+ create channel ${operation.name} (${operation.key}) @${operation.position}`);
          break;
        case 'renameChannel':
          lines.push(`~ rename channel ${operation.from} -> ${operation.to}`);
          break;
        case 'moveChannel':
          lines.push(`↕ move channel ${operation.key} ${operation.from} -> ${operation.to}`);
          break;
        default:
          lines.push(`? unknown operation ${JSON.stringify(operation)}`);
      }
    }
  }

  if (plan.notes.length > 0) {
    lines.push('', 'Notes:');
    for (const note of plan.notes) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join('\n');
}
