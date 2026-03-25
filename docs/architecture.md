# Architecture

## Goal

Model a Discord server section as an operational status board where category names and channel names encode live state. OpenClaw can generate desired state from its own health/task context, and this service reconciles the current guild structure to match.

## Core pieces

1. **Config Loader**
   - Reads JSON config
   - Validates required shape and basic constraints
   - Normalizes defaults used by the reconciler

2. **Board Model Builder**
   - Takes config + runtime inputs
   - Produces desired category/channel names
   - Keeps presentation logic separate from Discord API concerns

3. **Discord Adapter**
   - Abstract interface for reading current guild structure and applying changes
   - Current prototype includes only a mock adapter
   - Future adapter can wrap discord.js or raw REST calls

4. **Reconciler**
   - Compares desired board to actual guild snapshot
   - Plans create/rename/reorder operations
   - Supports dry-run review before live application

5. **Service Runner**
   - CLI entrypoint for prototype usage
   - Future daemon mode can poll or react to OpenClaw events

## Data flow

```text
config + guild snapshot + runtime inputs
  -> config validation
  -> desired board model
  -> reconciliation plan
  -> dry-run output or adapter.apply(plan)
```

## Safety principles

- Dry-run first
- No credential assumptions in repo
- Explicit operations list before apply
- Stable matching prefers configured keys over fuzzy text matching
- Rename-only updates where possible to avoid churn in Discord history

## Naming approach

The board is anchored by a configured category. Channels under that category represent sections like system health, active work, queue, and alerts. Each channel has:

- stable logical key
- relative in-category sort order
- a templated display name built from runtime inputs

Example:

- Category: `STATUS · GREEN`
- Channels:
  - `uptime-99.98%`
  - `workers-3-online`
  - `queue-2-pending`
  - `alerts-none`

## Reconciliation strategy

### Matching

- Categories: match by configured `board.key`
- Channels: match by `channel.key`
- Prototype snapshots include these keys directly for deterministic planning
- Real Discord integration can persist key mapping in topic metadata, a small state store, or channel permission overwrites/comments if needed

### Planned operations

- `createCategory`
- `renameCategory`
- `moveCategory`
- `createChannel`
- `renameChannel`
- `moveChannel`

Deletes are intentionally omitted from the prototype. Unmanaged channels are reported, not removed.

## Extension plan

### OpenClaw integration

Potential inputs:
- gateway health
- active tasks count
- queue length
- error count
- last heartbeat age

These can be transformed into the `runtime.metrics` block consumed by the board model builder.

### Discord live mode

For production:
- enforce rate limiting
- retry on transient API failures
- detect permission issues cleanly
- persist last applied state for auditability
- optionally expose a preview message back to Discord before apply
