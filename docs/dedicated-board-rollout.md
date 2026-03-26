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

Recommended category/channel names for the first rollout:

- Category: `OpenClaw Tracker`
- Channels:
  - `openclaw-connection`
  - `openclaw-activity`
  - `openclaw-task`
  - `openclaw-phase`
  - `openclaw-heartbeat`
  - `openclaw-pending`
  - `openclaw-backlog`
  - `openclaw-blockers`

Using the expected names keeps the config generator on the happy path and avoids extra manual ID entry.

## Recommended settings for the first live board

Keep these values unless you have already proven a safer alternative in your own environment:

```json
{
  "discord": {
    "dryRun": true,
    "allowCreate": false,
    "testServerOnly": true,
    "maxOpsPerRun": 4,
    "requestDelayMs": 1000
  },
  "runner": {
    "intervalMs": 300000,
    "renameCooldownMs": 600000,
    "renameSettleMs": 180000
  }
}
```

Why this is the right starting point:

- slow enough to inspect and trust
- conservative enough to avoid obvious rename thrash
- aligned with the dedicated-board template already in the repo
- matches the dedicated-board test path that already worked

## Safe provisioning workflow

### 1) Create the board manually in Discord

Create:

- one dedicated category
- eight dedicated text channels inside it

Do **not** enable live create mode just to save a minute during initial setup.

### 2) Export the bot token and guild ID locally

```bash
export DISCORD_BOT_TOKEN='replace-me'
export DISCORD_GUILD_ID='YOUR_TEST_GUILD_ID'
```

### 3) Capture a read-only inventory snapshot locally

```bash
npm run discord:inventory
```

This writes both a readable tree and raw JSON under `runtime/generated/`.

Operator check:

- confirm the generated files exist
- open the `.txt` file and verify the dedicated category and channels are present
- stop here if the inventory does not match what Discord shows

### 4) Generate an ID-pinned local config for only the dedicated board

```bash
npm run config:dedicated-board:inventory -- \
  --inventory-json runtime/generated/discord-guild-YOUR_TEST_GUILD_ID-channels.json \
  --category-name 'OpenClaw Tracker' \
  --guild-name 'OpenClaw Dedicated Tracker Test' \
  --output runtime/live-config.local.json
```

If your board uses the recommended names, the script should resolve all IDs automatically.

If your channel names differ, rerun with explicit IDs, for example:

```bash
npm run config:dedicated-board:inventory -- \
  --inventory-json runtime/generated/discord-guild-YOUR_TEST_GUILD_ID-channels.json \
  --category-id 'YOUR_CATEGORY_ID' \
  --connection-id '...' \
  --activity-id '...' \
  --task-id '...' \
  --phase-id '...' \
  --heartbeat-id '...' \
  --pending-id '...' \
  --backlog-id '...' \
  --blockers-id '...' \
  --output runtime/live-config.local.json
```

### 5) Inspect the generated config before any apply

Open `runtime/live-config.local.json` and verify:

- `guild.id` is the correct test server
- `board.managedCategoryId` is the dedicated tracker category
- all eight channel IDs belong to the tracker board only
- `discord.dryRun` is still `true`
- `discord.allowCreate` is still `false`
- `discord.testServerOnly` is still `true`

This is the most important human review checkpoint in the whole rollout.

### 6) Run a plan first

```bash
npm run plan:dedicated
```

Review the output and make sure the plan only references the dedicated board.

If anything looks like it targets the wrong category or an unrelated channel, stop and fix the config first.

### 7) Run one guarded dry-run apply cycle

```bash
npm run apply:dedicated
```

This confirms the live adapter path, token handling, and config loading without mutating Discord.

### 8) Visually verify the board in Discord

Before live apply, verify:

- the dedicated category exists
- all eight dedicated channels exist
- the generated config matches their IDs
- no unexpected channels are in scope

### 9) Enable a single real apply cycle

Edit `runtime/live-config.local.json` and change:

```json
"dryRun": false
```

Then run:

```bash
npm run apply:dedicated
```

Do one real apply cycle first. Avoid jumping straight into watch mode.

### 10) Only then consider the watch loop

Once a single real apply works cleanly, you can test a conservative watch run.

Recommended posture:

- keep the same request spacing and op caps
- keep the same rename cooldown/settle values
- keep the board dedicated
- avoid frequent runtime churn while validating

## Common rollout mistakes and how to avoid them

### Wrong category selected
Cause:

- the category name is duplicated
- the inventory snapshot is stale

Fix:

- use a unique category name
- or pass `--category-id` explicitly
- regenerate inventory right before generating config

### Missing channel errors during config generation
Cause:

- the category does not contain the expected `openclaw-*` names

Fix:

- rename the dedicated channels to the expected names
- or supply explicit `--*-id` arguments

### Bot token present but inventory still fails
Likely causes:

- wrong guild ID
- bot is not in that server
- bot lacks permission to view channels

Fix:

- verify `DISCORD_GUILD_ID`
- verify the bot is invited to the test server
- verify the bot can see the dedicated board

### Plan output looks safe but is unexpectedly large
Cause:

- config points at a board whose names/positions differ more than expected
- dedicated board was edited after the snapshot

Fix:

- recapture inventory
- regenerate config
- compare channel IDs again

### Watch mode feels tempting before first real apply
Don’t.

The clean sequence is:

- inventory
- generated config
- plan
- dry-run apply
- real apply
- watch mode

That order catches the most operator mistakes with the least Discord impact.

## Promotion guidance after the dedicated-board test succeeds

Once the board is working in the dedicated test area, keep the same operating model when promoting it:

- still use a dedicated tracker category
- still pin by ID
- still keep create mode off unless you build a safer create-and-capture-ID flow
- still validate a plan before making structural changes
- still treat category/channel renames as slow operational updates, not live event streaming

Do not “graduate” by pointing the tracker at mixed-use conversation channels.

## Why this workflow reduces friction

- read-only inventory first gives operators a concrete source of truth
- generator removes hand-editing of eight separate channel IDs
- dedicated board keeps the blast radius tiny
- explicit review checkpoints catch wrong IDs before Discord mutations
- conservative defaults reduce rate-limit and rename-thrash risk during first launch
