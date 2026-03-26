# openclaw-status-tracker

Dependency-light prototype for projecting **OpenClaw bot status into Discord channel/category names**.

Instead of a generic infra board, this version is specialized for an OpenClaw bot that lives in Discord and needs a compact at-a-glance board for:

- connection state
- idle vs busy presence
- current task
- execution phase
- last heartbeat age
- active queue + backlog
- blockers

## What it does

- Loads a specialized OpenClaw status config and a snapshot of Discord guild structure
- Resolves runtime from safe local sources: config defaults, JSON snapshot files, workspace/task metadata files, heartbeat files, queue/backlog JSON, blocker JSON, and env overrides
- Builds the desired OpenClaw bot status board from runtime state
- Computes a reconciliation plan with explicit create/rename/move operations
- Runs in dry-run mode by default through either a mock adapter or a live Discord REST adapter skeleton
- Supports one-shot runs or a safe polling watch loop for continuous operation
- Persists last-applied board state plus rename cooldown/coalescing observations in a local JSON state file
- Uses environment-driven token loading so secrets stay out of git

This repo intentionally uses placeholders for real Discord/OpenClaw credentials and does not execute internet-sourced code.

## Recommended operator path

If you want the smoothest path to a first successful live test, follow this exact order:

1. **Start with the mock demo** so you know the board model makes sense locally.
2. **Use a dedicated Discord category and eight dedicated text channels only.** Do not reuse existing chat channels.
3. **Capture a read-only channel inventory** from Discord before generating config.
4. **Generate an ID-pinned local config** from that inventory.
5. **Run live plan in dry-run mode** and inspect every target channel/category ID.
6. **Run a single dry-run apply cycle** to confirm the guarded live path.
7. **Only then switch `dryRun` to `false`** for the dedicated board.
8. **Keep the watch loop conservative**: slow polling, request spacing, low op caps.

That flow removes most of the failure modes we hit during setup: wrong IDs, wrong category, fuzzy channel targeting, trying to test against active rooms, and enabling live mutations before confirming the inventory matches reality.

## Quick start

```bash
cd /root/.openclaw/workspace/openclaw-status-tracker
npm run demo
```

Print the raw reconciliation plan:

```bash
npm run plan
```

Simulate applying through the mock adapter:

```bash
npm run apply:mock
```

Run the watch loop in dry-run mode first:

```bash
npm run watch
```

Simulate watch-loop apply cycles against the mock adapter:

```bash
npm run watch:apply:mock
```

## Live adapter skeleton

The repo now includes a minimal live Discord REST adapter using Node 22's built-in `fetch`.

Safe defaults:

- `discord.mode` defaults to `mock`
- `discord.dryRun` defaults to `true`
- `discord.allowCreate` defaults to `false`
- `discord.testServerOnly` must stay `true` for live mode to run
- `discord.maxOpsPerRun` caps a single apply cycle
- `discord.requestDelayMs` inserts spacing between live requests

## Recommended live settings

These values worked well for the dedicated-board rollout path and should be your default starting point:

- `discord.dryRun: true` until the board is visually confirmed
- `discord.allowCreate: false`
- `discord.testServerOnly: true`
- `discord.maxOpsPerRun: 4`
- `discord.requestDelayMs: 1000`
- `runner.intervalMs: 300000` (5 minutes)
- `runner.renameCooldownMs: 600000` (10 minutes)
- `runner.renameSettleMs: 180000` (3 minutes)
- `board.maxNameLength: 60`

Why these settings are recommended:

- they slow the system down enough to stay understandable while you validate it
- they reduce accidental bursts when config/runtime input changes quickly
- they give rename coalescing time to settle before touching Discord again
- they are compatible with the dedicated-board-first safety model already baked into the repo

Do **not** make the tracker more aggressive until you have several clean dry-run and live cycles on a board that no humans use for conversation.

### Test-server-first flow

1. Create a dedicated Discord test server and bot.
2. Pre-create one category and the text channels you want the tracker to manage.
3. Put their IDs into `examples/live-config.sample.json` or your own config copy.
4. Export the bot token:

```bash
export DISCORD_BOT_TOKEN='replace-me'
```

5. Run a live plan first:

```bash
npm run plan:live
```

6. Only if the plan looks correct, keep `dryRun: true` and test `--apply` once to confirm guarded dry-run behavior:

```bash
npm run apply:live
```

7. After verifying against the test server, change your private config to `"dryRun": false` for real PATCH requests.

### Dedicated-board-safe local rollout

If you are preparing a live local config, use a dedicated board only.

1. Manually create one dedicated category plus dedicated tracker channels.
2. Export the bot token and guild ID:

```bash
export DISCORD_BOT_TOKEN='replace-me'
export DISCORD_GUILD_ID='YOUR_TEST_GUILD_ID'
```

3. Capture a read-only inventory snapshot locally:

```bash
npm run discord:inventory
```

That writes both of these files under `runtime/generated/`:

- `discord-guild-YOUR_TEST_GUILD_ID-channels.txt`
- `discord-guild-YOUR_TEST_GUILD_ID-channels.json`

4. Generate a dedicated-board config from the saved inventory snapshot:

```bash
npm run config:dedicated-board:inventory -- \
  --inventory-json runtime/generated/discord-guild-YOUR_TEST_GUILD_ID-channels.json \
  --category-name 'OpenClaw Tracker' \
  --guild-name 'OpenClaw Dedicated Tracker Test' \
  --output runtime/live-config.local.json
```

Expected dedicated channel names inside that category:

- `openclaw-connection`
- `openclaw-activity`
- `openclaw-task`
- `openclaw-phase`
- `openclaw-heartbeat`
- `openclaw-pending`
- `openclaw-backlog`
- `openclaw-blockers`

If you used different names, pass explicit `--*-id` flags instead.

5. Confirm the generated IDs belong only to the dedicated tracker board.
6. Run plan/apply in dry-run first:

```bash
npm run plan:dedicated
npm run apply:dedicated
```

7. Open Discord and verify the board visually before any real apply.
8. When ready, edit `runtime/live-config.local.json` and set `discord.dryRun` to `false`.
9. Run **one** real apply cycle first.
10. Only after that succeeds, consider the watch loop.

See `docs/dedicated-board-rollout.md` for the full checklist, `docs/operator-onboarding-checklist.md` for the fast operator path, and `docs/troubleshooting.md` for common mistakes.

## Common setup pitfalls we hit

### 1) Using an active channel instead of a dedicated tracker channel
The tracker renames channels. If the channel is used by humans, you create confusion immediately.

Avoid it:

- use one dedicated category for the tracker only
- use eight dedicated text channels inside it
- pin by ID, not by name alone

### 2) Inventory and config disagree
If the Discord board changed after the inventory snapshot was taken, generated IDs can be stale or point at the wrong resources.

Avoid it:

- capture inventory immediately before config generation
- regenerate config after any channel/category recreation
- inspect `runtime/live-config.local.json` before any apply

### 3) The category name is ambiguous
If multiple categories share the same name, generator lookup by `--category-name` can fail or be unsafe.

Avoid it:

- use unique category names in the test server
- or pass `--category-id` explicitly

### 4) Channel names do not match the expected `openclaw-*` pattern
Inventory-assisted config generation expects the dedicated tracker channel names by default.

Avoid it:

- either create the channels with the expected names
- or pass explicit channel IDs like `--task-id`, `--phase-id`, and so on

### 5) Forgetting `DISCORD_GUILD_ID` for inventory
The inventory helper will fail if the guild ID is not passed or exported.

Avoid it:

```bash
export DISCORD_GUILD_ID='YOUR_TEST_GUILD_ID'
```

### 6) Trying to go straight to watch mode
If the initial config is wrong, watch mode just repeats the mistake.

Avoid it:

- plan first
- dry-run apply once
- real apply once
- only then enable watch mode

### 7) Switching off dry-run too early
This is the easiest way to discover a wrong ID by mutating the wrong board.

Avoid it:

- leave `dryRun: true` until the dedicated board, IDs, and plan output all line up
- do one real cycle before any long-running process

## CLI

```bash
node src/index.js --config <path> --guild <path> [--adapter mock|discord-rest] [--apply] [--output json|plan] [--watch] [--interval-ms <n>] [--cycles <n>] [--state <path>]
```

- `--config`: OpenClaw Discord status configuration JSON
- `--guild`: current guild snapshot JSON when using the mock adapter
- `--adapter`: `mock` or `discord-rest`
- `--apply`: attempt to apply through the configured adapter
- `--output`: human plan or JSON
- `--watch` / `--daemon`: run a polling loop instead of a one-shot pass
- `--interval-ms`: override `runner.intervalMs`
- `--cycles`: stop after N watch cycles for testing; `0` means run until interrupted
- `--state`: override the persisted state JSON path

## Runtime model

The tracker now resolves runtime in layers.

Precedence, lowest to highest:

1. `runtime` inside config as safe defaults/fallbacks
2. `runtimeSources.snapshotFile` for a full JSON runtime document
3. `runtimeSources.workspaceStateFile` for OpenClaw-friendly workspace/task metadata
4. `runtimeSources.heartbeatFile` for last-seen heartbeat metadata
5. `runtimeSources.queueFile` for pending/backlog snapshots
6. `runtimeSources.blockersFile` for blocker state
7. `runtimeSources.env` for final per-field overrides

A full snapshot can look like this:

```json
{
  "runtime": {
    "bot": {
      "presence": "busy",
      "connection": "connected",
      "activity": "discord-ops"
    },
    "task": {
      "current": "specializing-status-tracker",
      "phase": "editing-runtime-model"
    },
    "heartbeat": {
      "lastSeen": "2026-03-25T17:20:00Z"
    },
    "queue": {
      "pending": 2,
      "backlog": 5
    },
    "blockers": [
      { "code": "awaiting-live-discord-adapter" }
    ]
  }
}
```

A more realistic file-based OpenClaw setup can split state across local files:

```json
{
  "runtime": {
    "bot": {
      "presence": "offline",
      "connection": "disconnected",
      "activity": "starting"
    },
    "task": {
      "current": "awaiting-runtime-snapshot",
      "phase": "boot"
    },
    "heartbeat": {
      "lastSeen": "2026-03-25T17:00:00Z"
    },
    "queue": {
      "pending": 0,
      "backlog": 0
    },
    "blockers": []
  },
  "runtimeSources": {
    "workspaceStateFile": { "path": "examples/runtime/workspace-state.sample.json" },
    "heartbeatFile": { "path": "examples/runtime/heartbeat.sample.json" },
    "queueFile": { "path": "examples/runtime/queue.sample.json" },
    "blockersFile": { "path": "examples/runtime/blockers.sample.json" },
    "env": {
      "presence": "OPENCLAW_PRESENCE",
      "taskCurrent": "OPENCLAW_TASK_CURRENT"
    }
  }
}
```

### Supported board bindings

Each configured channel binds to one specialized state field:

- `presence`
- `connection`
- `activity`
- `task.current`
- `task.phase`
- `heartbeat.lastSeen`
- `heartbeat.age`
- `queue.pending`
- `queue.backlog`
- `blockers.summary`

`heartbeat.age` is derived automatically from the ISO timestamp.
`blockers.summary` collapses zero-or-more blockers into a compact channel-safe label.

### Presence derivation and stale-state handling

The tracker no longer treats `runtime.bot.presence` as authoritative when it says `busy`.
Instead it derives the rendered presence from:

- connection state
- heartbeat freshness
- queue/task evidence of active work
- blocker state

Default behavior:

- fresh heartbeat + active queue/task work => `busy`
- no fresh work evidence => `idle`
- stale heartbeat with stale work signals => `degraded`
- disconnected/offline runtime => `offline`

This prevents an old snapshot from pinning the board to `BUSY` after work has already stopped.

You can tune the stale windows in `runner.statusModel`:

```json
{
  "runner": {
    "statusModel": {
      "staleAfterMs": 900000,
      "offlineAfterMs": 3600000
    }
  }
}
```

## Continuous runner and persistence

The new `runner` block controls the safe polling loop and rename anti-flap behavior.

```json
{
  "runner": {
    "intervalMs": 60000,
    "renameCooldownMs": 300000,
    "renameSettleMs": 120000,
    "stateFile": ".state/openclaw-status-tracker.json",
    "statusModel": {
      "staleAfterMs": 900000,
      "offlineAfterMs": 3600000
    }
  }
}
```

What gets persisted:

- `lastAppliedBoard`: most recent desired board snapshot after an apply cycle
- `renameCooldowns`: per-category/per-channel rename cooldown windows
- `desiredNameObservations`: first-seen timestamps for candidate rename targets so a new name must remain stable before it is applied

Behavior:

- non-rename ops can still pass through immediately
- rename ops are held until the desired name has remained unchanged for `renameSettleMs`
- after a rename is applied, the same resource stays blocked until `renameCooldownMs` expires
- state survives restarts because it is stored in the JSON file from `runner.stateFile` or `--state`

Dry-run-first watch flow:

```bash
node src/index.js \
  --config examples/config.sample.json \
  --guild examples/mock-guild-state.json \
  --watch \
  --interval-ms 1000 \
  --cycles 3
```

Then simulate apply cycles locally:

```bash
node src/index.js \
  --config examples/config.sample.json \
  --guild examples/mock-guild-state.json \
  --watch \
  --apply \
  --interval-ms 1000 \
  --cycles 3
```

For a long-running live test, keep `discord.dryRun=true` first, then switch to `false` only after you have reviewed several safe watch cycles on a dedicated test server.

## Live config additions

The live adapter works best when you bind managed Discord resources by ID.

```json
{
  "discord": {
    "mode": "discord-rest",
    "tokenEnvVar": "DISCORD_BOT_TOKEN",
    "dryRun": true,
    "allowCreate": false,
    "testServerOnly": true,
    "maxOpsPerRun": 4,
    "requestDelayMs": 1000
  },
  "board": {
    "managedCategoryId": "123456789012345678",
    "channels": [
      {
        "id": "234567890123456789",
        "key": "connection",
        "stateBinding": "connection",
        "template": "connection-{value}",
        "position": 0
      }
    ]
  }
}
```

Why IDs first:

- avoids fuzzy name matching
- prevents the tracker from touching lookalike channels
- makes dry-run/live diffing predictable
- fits test-server-first rollout better than auto-discovery

## Files

- `docs/architecture.md` - specialized design notes and extension plan
- `docs/config-schema.json` - JSON schema for the OpenClaw Discord status config
- `docs/implementation-brief.md` - product/ops guidance for a real deployment
- `examples/config.sample.json` - sample mock config with file/env runtime ingestion
- `examples/live-config.sample.json` - sample live/test-server config with snapshot ingestion
- `examples/live-config.dedicated-board.template.json` - dedicated-board-first live config template
- `examples/runtime/*.json` - sample runtime snapshot inputs for workspace state, heartbeat, queue, blockers, and full snapshot mode
- `examples/mock-guild-state.json` - sample current guild state
- `docs/dedicated-board-rollout.md` - safe rollout guide for a dedicated tracker board
- `docs/operator-onboarding-checklist.md` - practical install + launch checklist
- `docs/troubleshooting.md` - common errors, causes, and fixes
- `scripts/discord-list-guild-channels.js` - read-only guild/category/channel inventory helper
- `scripts/create-dedicated-board-config.js` - generate an ID-pinned dedicated-board local config
- `.env.example` - local env variable example
- `src/` - runtime, reconciler, adapters, config validation

## Guardrails currently implemented

- dry-run on by default
- explicit env var token loading
- no-op suppression through plan diffing
- max-operations-per-run cap
- delay between live requests
- create operations disabled by default
- live mode blocked unless `testServerOnly` is explicitly true
- hard error on Discord 429 with a message that backoff persistence still needs implementation

## What is still intentionally missing

- durable 429 retry queue and retry-after scheduler
- single-writer lock / leader election
- persistent structured audit log of attempted and successful Discord mutations
- safer create flow that captures newly created IDs automatically
- watch-driven filesystem events; current continuous mode is polling-based by design
- smarter per-binding policies so low-value channels can be more aggressively suppressed than high-value ones

## Testing the ingestion layer

Mock plan using the sample local files:

```bash
npm run plan
```

See the fully resolved board and runtime metadata:

```bash
node src/index.js --config examples/config.sample.json --guild examples/mock-guild-state.json --output json
```

Override fields from env without editing JSON:

```bash
OPENCLAW_PRESENCE=idle \
OPENCLAW_TASK_CURRENT=watching-heartbeats \
OPENCLAW_QUEUE_PENDING=3 \
node src/index.js --config examples/config.sample.json --guild examples/mock-guild-state.json
```

Test the full-snapshot path used by the live sample config:

```bash
node src/index.js --config examples/live-config.sample.json --guild examples/mock-guild-state.json --output json
```

## Next steps for real integration

- Point `runtimeSources.*.path` to actual OpenClaw-written local files in the workspace or service data directory
- Add rename cooldown persistence so task churn does not hammer Discord rename limits
- Persist the last applied state and op history for auditability and restart safety
- Add a local lockfile or service singleton policy
- Keep production rollout docs centered on the dedicated-board-first approach, not mixed-use Discord spaces
