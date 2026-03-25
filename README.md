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
- Runs in dry-run mode by default through a mock Discord adapter

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

Print the full planned state as JSON:

```bash
node src/index.js --output json
```

## CLI

```bash
node src/index.js --config <path> --guild <path> [--apply] [--output json|plan]
```

- `--config`: OpenClaw Discord status configuration JSON
- `--guild`: current guild snapshot JSON
- `--apply`: attempt to apply through the configured adapter (mock only in this prototype)
- `--output`: human plan or JSON

## Runtime model

The prototype now expects OpenClaw-flavored runtime state under `runtime`:

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

## Files

- `docs/architecture.md` - specialized design notes and extension plan
- `docs/config-schema.json` - JSON schema for the OpenClaw Discord status config
- `docs/implementation-brief.md` - product/ops guidance for a real deployment
- `examples/config.sample.json` - sample OpenClaw bot status declaration
- `examples/mock-guild-state.json` - sample current Discord state
- `src/` - runtime, reconciler, adapters, config validation

## Sample board shape

Example desired board:

- Category: `OPENCLAW · BUSY · CONNECTED`
- Channels:
  - `connection-connected`
  - `activity-discord-ops`
  - `task-specializing-status-tracker`
  - `phase-editing-runtime-model`
  - `heartbeat-4m`
  - `queue-2-active`
  - `backlog-5`
  - `blockers-awaiting-live-discord-adapter`

## What is still intentionally missing

- real Discord API adapter
- persisted cooldown / rename history
- OpenClaw event ingestion or local state-file watcher
- policy for coalescing frequent task/phase changes into slow-moving Discord renames

## Next steps for real integration

- Replace `MockDiscordAdapter` with a Discord API adapter
- Feed `runtime` from OpenClaw heartbeat/task state or a local JSON producer
- Add rename cooldowns/backoff so task churn does not hammer Discord rename limits
- Persist the last applied state for auditability and safe restart behavior
