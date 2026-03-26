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
3. Export the bot token and guild ID locally:

```bash
export DISCORD_BOT_TOKEN='replace-me'
export DISCORD_GUILD_ID='YOUR_TEST_GUILD_ID'
```

4. Capture a read-only inventory snapshot locally:

```bash
npm run discord:inventory
```

This writes both a readable tree and raw JSON under `runtime/generated/`.

5. Generate an ID-pinned local config for only the dedicated board from that saved snapshot:

```bash
npm run config:dedicated-board:inventory -- \
  --inventory-json runtime/generated/discord-guild-YOUR_TEST_GUILD_ID-channels.json \
  --category-name 'OpenClaw Tracker' \
  --guild-name 'OpenClaw Dedicated Tracker Test' \
  --output runtime/live-config.local.json
```

Expected channel names inside the dedicated category:

- `openclaw-connection`
- `openclaw-activity`
- `openclaw-task`
- `openclaw-phase`
- `openclaw-heartbeat`
- `openclaw-pending`
- `openclaw-backlog`
- `openclaw-blockers`

If the names differ, rerun the generator with explicit `--connection-id`, `--activity-id`, and other `--*-id` flags.

6. Confirm the generated config does **not** reference any active chat channel IDs.
7. Run a plan first:

```bash
npm run plan:dedicated
```

8. Keep `dryRun: true` and test one apply cycle:

```bash
npm run apply:dedicated
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
