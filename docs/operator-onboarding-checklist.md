# Operator Onboarding Checklist

Use this when bringing up a new dedicated-board install for the first time.

## Goal

Get from an empty Discord test server to one successful real apply on a dedicated tracker board with the fewest surprises possible.

## Preflight

- [ ] Node 22+ is installed
- [ ] `npm install` has already been run in this repo
- [ ] You are working in a test server or test-only area
- [ ] The Discord bot has been invited to that server
- [ ] The bot can view and manage the dedicated tracker category/channels
- [ ] You are **not** targeting any active human conversation channels

## Create the dedicated board in Discord

Create one category:

- [ ] `OpenClaw Tracker`

Create these eight text channels inside it:

- [ ] `openclaw-connection`
- [ ] `openclaw-activity`
- [ ] `openclaw-task`
- [ ] `openclaw-phase`
- [ ] `openclaw-heartbeat`
- [ ] `openclaw-pending`
- [ ] `openclaw-backlog`
- [ ] `openclaw-blockers`

## Export required environment variables

```bash
export DISCORD_BOT_TOKEN='replace-me'
export DISCORD_GUILD_ID='YOUR_TEST_GUILD_ID'
```

Optional local runtime overrides can also be exported if needed.

## Capture inventory

```bash
npm run discord:inventory
```

Confirm these exist:

- [ ] `runtime/generated/discord-guild-YOUR_TEST_GUILD_ID-channels.txt`
- [ ] `runtime/generated/discord-guild-YOUR_TEST_GUILD_ID-channels.json`

Review the text snapshot:

- [ ] category is present
- [ ] all eight channels are present
- [ ] no naming surprises need to be handled before config generation

## Generate dedicated-board config

```bash
npm run config:dedicated-board:inventory -- \
  --inventory-json runtime/generated/discord-guild-YOUR_TEST_GUILD_ID-channels.json \
  --category-name 'OpenClaw Tracker' \
  --guild-name 'OpenClaw Dedicated Tracker Test' \
  --output runtime/live-config.local.json
```

If you used different channel names:

- [ ] rerun the generator with explicit `--category-id` and `--*-id` flags

## Inspect generated config

Open `runtime/live-config.local.json` and verify:

- [ ] `guild.id` is correct
- [ ] `managedCategoryId` is the dedicated tracker category
- [ ] eight tracker channel IDs are correct
- [ ] `dryRun` is `true`
- [ ] `allowCreate` is `false`
- [ ] `testServerOnly` is `true`
- [ ] `maxOpsPerRun` is `4`
- [ ] `requestDelayMs` is `1000`
- [ ] `intervalMs` is `300000`
- [ ] `renameCooldownMs` is `600000`
- [ ] `renameSettleMs` is `180000`

## Run validation sequence

1. Plan:

```bash
npm run plan:dedicated
```

- [ ] plan only references the dedicated tracker board

2. Guarded dry-run apply:

```bash
npm run apply:dedicated
```

- [ ] command succeeds without trying to mutate unrelated channels

3. Visual Discord check:

- [ ] board still looks exactly like the dedicated tracker area you intended

4. One real apply:

Edit `runtime/live-config.local.json` and set `dryRun` to `false`, then run:

```bash
npm run apply:dedicated
```

- [ ] one real apply succeeds
- [ ] resulting names/positions look correct in Discord

## Only after success

- [ ] consider testing watch mode
- [ ] keep the board dedicated
- [ ] keep config local and untracked
- [ ] recapture inventory + regenerate config after any board recreation or ID change

## Stop conditions

Stop immediately if any of these happen:

- [ ] the generated config references an unexpected category ID
- [ ] the plan mentions unrelated channels
- [ ] the inventory does not match what you see in Discord
- [ ] there are duplicate category names and you have not switched to explicit IDs
- [ ] you are tempted to use an existing chat room as the tracker board
