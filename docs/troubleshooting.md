# Troubleshooting

This guide is focused on the setup and rollout issues most likely to block a first dedicated-board deployment.

## `Missing required --guild-id <id> (or DISCORD_GUILD_ID).`

Cause:

- `npm run discord:inventory` needs a guild ID and none was provided

Fix:

```bash
export DISCORD_GUILD_ID='YOUR_TEST_GUILD_ID'
npm run discord:inventory
```

## `Missing Discord bot token. Export DISCORD_BOT_TOKEN.`

Cause:

- the live inventory helper or live adapter cannot authenticate

Fix:

```bash
export DISCORD_BOT_TOKEN='replace-me'
```

If you already exported it, confirm you exported it in the same shell session you are using to run the command.

## `Category named "..." was not found in inventory.`

Cause:

- the category name in Discord does not match what you passed
- the inventory snapshot is stale
- the bot cannot see that category

Fix:

- open `runtime/generated/discord-guild-...-channels.txt`
- confirm the exact category name
- recapture inventory if the board changed
- if needed, rerun with `--category-id` instead of `--category-name`

## `Category named "..." is ambiguous in inventory. Re-run with --category-id.`

Cause:

- multiple categories in the guild share the same name

Fix:

- use `--category-id` explicitly
- or rename the dedicated tracker category so it is unique

## `Missing channel "openclaw-..." in category "...".`

Cause:

- the dedicated channels were not created yet
- the channel names do not match the generator’s expected naming pattern

Fix:

Option 1:

- rename/create channels using the expected names:
  - `openclaw-connection`
  - `openclaw-activity`
  - `openclaw-task`
  - `openclaw-phase`
  - `openclaw-heartbeat`
  - `openclaw-pending`
  - `openclaw-backlog`
  - `openclaw-blockers`

Option 2:

- rerun the config generator with explicit `--connection-id`, `--activity-id`, and other `--*-id` flags

## Discord API request fails during inventory

Possible causes:

- wrong bot token
- wrong guild ID
- bot is not in the server
- bot lacks permission to view channels

Checks:

- verify the bot token belongs to the intended bot
- verify `DISCORD_GUILD_ID`
- confirm the bot is invited to the server
- confirm the bot can see the dedicated tracker area

## `plan:dedicated` output looks too broad

Cause:

- `runtime/live-config.local.json` references the wrong category or wrong channel IDs
- the board changed after inventory was captured

Fix:

- stop before apply
- open the config and inspect every ID
- recapture inventory
- regenerate the config
- rerun the plan

## Dry-run apply succeeds but real apply does nothing useful

Possible causes:

- runtime inputs are static, so the desired names already match
- the board is in cooldown/settle windows
- `dryRun` is still true in the local config

Checks:

- confirm `discord.dryRun` is actually `false`
- inspect runtime values from your snapshot/env inputs
- remember that rename coalescing intentionally delays some renames

## Real apply touches the wrong place

Most likely cause:

- the local config was generated from stale or incorrect inventory

Recovery:

- stop immediately
- set `dryRun` back to `true`
- recapture inventory
- regenerate config from the current board
- verify all IDs manually before any further apply

This is exactly why the recommended operator path uses a dedicated board and explicit review checkpoints.

## Watch mode feels noisy or risky

Cause:

- rollout moved to continuous operation before the operator fully trusted the config and runtime inputs

Fix:

- go back to one-shot runs
- keep `intervalMs` at 5 minutes initially
- keep `maxOpsPerRun` and request spacing conservative
- validate one real apply before any long-running loop

## General recovery rule

When in doubt, go back to this sequence:

1. inventory
2. generated config
3. inspect IDs
4. plan
5. dry-run apply
6. one real apply
7. only then watch mode
