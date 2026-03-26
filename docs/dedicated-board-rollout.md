# Dedicated Board Rollout

Safest next step for live enablement: **use a dedicated Discord category and dedicated text channels only**.

Do not point the tracker at an active chat room, support thread, or any existing human conversation channel.

## Recommended shape

One dedicated category plus eight dedicated text channels:

- connection
- activity
- task
- phase
- heartbeat
- pending
- backlog
- blockers

## Safe provisioning workflow

1. Create a dedicated Discord test server or test-only area.
2. Manually create one dedicated category and the eight dedicated text channels.
3. Export the bot token locally:

```bash
export DISCORD_BOT_TOKEN='replace-me'
```

4. Inventory the server structure without writing anything:

```bash
node scripts/discord-list-guild-channels.js --guild-id YOUR_TEST_GUILD_ID
```

5. Generate an ID-pinned local config for only the dedicated board:

```bash
node scripts/create-dedicated-board-config.js \
  --guild-id YOUR_TEST_GUILD_ID \
  --guild-name 'OpenClaw Dedicated Tracker Test' \
  --category-id YOUR_CATEGORY_ID \
  --connection-id YOUR_CONNECTION_CHANNEL_ID \
  --activity-id YOUR_ACTIVITY_CHANNEL_ID \
  --task-id YOUR_TASK_CHANNEL_ID \
  --phase-id YOUR_PHASE_CHANNEL_ID \
  --heartbeat-id YOUR_HEARTBEAT_CHANNEL_ID \
  --pending-id YOUR_PENDING_CHANNEL_ID \
  --backlog-id YOUR_BACKLOG_CHANNEL_ID \
  --blockers-id YOUR_BLOCKERS_CHANNEL_ID \
  --output runtime/live-config.local.json
```

6. Confirm the generated config does **not** reference any active chat channel IDs.
7. Run a plan first:

```bash
node src/index.js --config runtime/live-config.local.json --adapter discord-rest --output plan
```

8. Keep `dryRun: true` and test one apply cycle:

```bash
node src/index.js --config runtime/live-config.local.json --adapter discord-rest --apply
```

9. Review the result in Discord.
10. Only after repeated safe dry-run and dry-run apply validation, set `dryRun` to `false` in the local config.

## Why this is safer

- ID-pinned config avoids fuzzy matching
- dedicated board prevents touching in-use chat channels
- read-only inventory step comes before any config generation
- create operations remain disabled by default
- dry-run remains enabled by default

## Still required before true production confidence

- persistent audit log of live mutations
- durable 429 retry handling
- single-writer / lockfile protection
- safer automatic create-and-capture-ID flow if create mode is ever enabled
