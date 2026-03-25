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
- Builds the desired OpenClaw bot status board from runtime state
- Computes a reconciliation plan with explicit create/rename/move operations
- Runs in dry-run mode by default through either a mock adapter or a live Discord REST adapter skeleton
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
node src/index.js --config <path> --guild <path> [--adapter mock|discord-rest] [--apply] [--output json|plan]
```

- `--config`: OpenClaw Discord status configuration JSON
- `--guild`: current guild snapshot JSON when using the mock adapter
- `--adapter`: `mock` or `discord-rest`
- `--apply`: attempt to apply through the configured adapter
- `--output`: human plan or JSON

## Runtime model

The prototype expects OpenClaw-flavored runtime state under `runtime`:

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
- `examples/config.sample.json` - sample mock config with managed IDs
- `examples/live-config.sample.json` - sample live/test-server config
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

- persisted cooldown / rename history
- OpenClaw event ingestion or local state-file watcher
- durable 429 retry queue and retry-after scheduler
- single-writer lock / leader election
- audit log persistence of attempted and successful Discord mutations
- safer create flow that captures newly created IDs automatically

## Next steps for real integration

- Feed `runtime` from OpenClaw heartbeat/task state or a local JSON producer
- Add rename cooldown persistence so task churn does not hammer Discord rename limits
- Persist the last applied state and op history for auditability and restart safety
- Add a local lockfile or service singleton policy
- Add production rollout docs after live testing on a dedicated Discord test server
