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

## Continuous runner and persistence

The new `runner` block controls the safe polling loop and rename anti-flap behavior.

```json
{
  "runner": {
    "intervalMs": 60000,
    "renameCooldownMs": 300000,
    "renameSettleMs": 120000,
    "stateFile": ".state/openclaw-status-tracker.json"
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
- `examples/runtime/*.json` - sample runtime snapshot inputs for workspace state, heartbeat, queue, blockers, and full snapshot mode
- `examples/mock-guild-state.json` - sample current guild state
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
- Add production rollout docs after live testing on a dedicated Discord test server
