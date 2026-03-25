# openclaw-status-tracker

Prototype for using Discord category and channel names as a live status board that an OpenClaw workflow can reconcile.

## What it does

- Loads a board config and a snapshot of current Discord guild structure
- Computes desired category/channel names for a status board
- Produces a reconciliation plan with safe, explicit operations
- Runs in dry-run mode by default through a mock Discord adapter

This repo intentionally uses placeholders for real Discord/OpenClaw credentials and does not execute internet-sourced code.

## Quick start

```bash
cd /root/.openclaw/workspace/openclaw-status-tracker
npm run demo
```

You can also print the raw reconciliation plan:

```bash
npm run plan
```

## CLI

```bash
node src/index.js --config <path> --guild <path> [--apply] [--output json|plan]
```

- `--config`: board configuration JSON
- `--guild`: current guild snapshot JSON
- `--apply`: attempt to apply through the configured adapter (mock only in this prototype)
- `--output`: human plan or JSON

## Files

- `docs/architecture.md` - design notes and extension plan
- `docs/config-schema.json` - JSON schema for board config
- `examples/config.sample.json` - sample board declaration
- `examples/mock-guild-state.json` - sample current Discord state
- `src/` - runtime, reconciler, adapters, config validation

## Next steps for real integration

- Replace `MockDiscordAdapter` with a Discord API adapter
- Wire OpenClaw event sources or cron polling into board state generation
- Add rate limiting/backoff and partial-failure handling for live Discord mutations
