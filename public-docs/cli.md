---
title: CLI
description: "Codius CLI reference: manage agents, workspaces, schedules, daemons, and permissions from your terminal."
nav: CLI
order: 3
category: Getting started
---

# CLI

The Codius CLI lets you manage agents from your terminal. It's the same interface exposed by the daemon's API, so anything you can do in the app you can do from the command line.

> **Agent orchestration:** You can tell coding agents to use the Codius CLI to spawn and manage other agents. Codius recognizes the calling agent, so CLI-created workers get the same workspace and parent defaults as MCP-created workers.

## Quick reference

```bash
codius run "fix the tests"            # Start an agent
codius ls                             # List running agents
codius attach <id>                    # Stream agent output
codius send <id> "also fix linting"   # Send follow-up task
codius logs <id>                      # View agent timeline
codius stop <id>                      # Stop an agent
```

## Running agents

Use `codius run` to start a new agent with a task:

```bash
codius run "implement user authentication"
codius run --provider codex "refactor the API layer"
codius run --background "run the focused test suite"
codius run --new-workspace worktree --worktree-mode branch-off --new-branch feature/x --base main "implement feature X"
codius run --workspace <workspace-id> "review the current diff"
codius run --output-schema schema.json "extract release notes"
codius run --output-schema '{"type":"object","properties":{"summary":{"type":"string"}},"required":["summary"]}' "summarize release notes"
```

From a human shell, a bare `codius run` creates a new local workspace for the current directory. Use `--workspace <id>` to add the agent to an existing workspace, or `--new-workspace local|worktree` to explicitly create a separate workspace for the run.

Worktree creation accepts `--worktree-mode branch-off|checkout-branch|checkout-pr` plus the matching `--new-branch`/`--base`, `--branch`, or `--pr-number`/`--forge` options. Use `--worktree-slug` to choose the managed directory slug.

When an existing Codius agent runs the same command, Codius recognizes it through `CODIUS_AGENT_ID`. Without explicit placement, the new agent becomes its subagent in the same workspace. `--workspace` can place that subagent elsewhere without changing its parent.

Use `--output-schema` to return only matching JSON output. You can pass a schema file path or an inline JSON schema object. This mode cannot be used with `--background`.

By default, `codius run` waits for completion. Use `--background` to return immediately while the agent keeps running.

## Workspaces

Create a workspace independently when you want to prepare its files before starting an agent:

```bash
codius workspace create --isolation local --path ~/dev/my-app --title main

codius workspace create \
  --isolation worktree \
  --path ~/dev/my-app \
  --mode branch-off \
  --new-branch feature/auth \
  --worktree-slug feature-auth \
  --base main

codius workspace create \
  --isolation worktree \
  --path ~/dev/my-app \
  --mode checkout-branch \
  --branch feature/existing \
  --worktree-slug existing-copy

codius workspace create \
  --isolation worktree \
  --path ~/dev/my-app \
  --mode checkout-pr \
  --pr-number 2186
```

Then list, use, or archive it:

```bash
codius workspace ls
codius run --workspace <workspace-id> "implement authentication"
codius workspace archive <workspace-id>
```

Add `--forge <name>` to PR checkout when Codius cannot infer the forge from the source checkout. See [Git worktrees](/docs/worktrees) for setup hooks and services.

## Listing agents

```bash
codius ls                    # Running agents in current directory
codius ls -a                 # Include completed/stopped agents
codius ls -g                 # All directories
codius ls -a -g --json       # Full list as JSON
```

## Streaming output

Use `codius attach` to stream an agent's output in real-time:

```bash
codius attach abc123   # Attach to agent (Ctrl+C to detach)
```

Agent IDs can be shortened, `abc` works if it's unambiguous.

## Sending messages

Send follow-up tasks to a running or idle agent:

```bash
codius send <id> "now run the tests"
codius send <id> --image screenshot.png "what's wrong here?"
codius send <id> --no-wait "queue this task"
```

## Viewing logs

```bash
codius logs <id>                  # Full timeline
codius logs <id> -f               # Follow (streaming)
codius logs <id> --tail 10        # Last 10 entries
codius logs <id> --filter tools   # Only tool calls
```

## Waiting for agents

Block until an agent finishes its current task:

```bash
codius wait <id>
codius wait <id> --timeout 60   # 60 second timeout
```

Useful in scripts or when one agent needs to wait for another.

## Schedules

Run an agent on a cron schedule. The CLI also accepts simple cadence presets and compiles them to cron. See [Schedules from the CLI](/docs/schedules-cli) for the full reference.

```bash
codius schedule create --every 30m --cwd ~/dev/my-app "Continue the refactor and leave a note."
codius schedule ls
codius schedule pause <id>
```

## Permissions

Agents may request permission for certain actions. Manage these from the CLI:

```bash
codius permit ls                # List pending requests
codius permit allow <id>        # Allow all pending for agent
codius permit deny <id> --all   # Deny all pending
```

## Agent modes

Change an agent's operational mode (provider-specific):

```bash
codius agent mode <id> --list   # Show available modes
codius agent mode <id> bypass   # Set bypass mode
codius agent mode <id> plan     # Set plan mode
codius agent detach <id>        # Make a subagent top-level
```

Detaching is an explicit lifecycle action, not a creation flag. The agent keeps running; only its relationship to its parent changes.

## Daemon management

```bash
codiusctl daemon start             # Start the daemon
codiusctl daemon start --web-ui    # Start and serve the bundled web UI
codiusctl daemon status            # Check status
codiusctl daemon stop              # Stop the daemon
```

Use `CODIUS_HOME` to run multiple isolated daemon instances.

## Connecting to a remote daemon

`--host` accepts either a local target (`host:port`, a unix socket, or a Windows pipe) or a pairing offer URL, the same `https://app.codius.ai/#offer=...` link the mobile app uses for QR pairing. With an offer URL the CLI connects through the Codius relay with end-to-end encryption, so you can drive a daemon on another machine without exposing it to the network.

Get an offer URL from the daemon you want to control:

```bash
codiusctl daemon pair --json   # prints { url, qr, ... }
```

Use it from anywhere:

```bash
codius ls --host 'https://app.codius.ai/#offer=eyJ2IjoyLC...'
codius run --host "$OFFER_URL" "fix the failing tests"
```

You can also set it once via `CODIUS_HOST` instead of passing `--host` on every command.

## Multi-agent workflows

The CLI is designed to be used by agents themselves. You can instruct an agent to spawn sub-agents for parallel work:

```bash
# Agent A spawns Agent B and waits for it
agent_id=$(codius run --background --quiet --title api-agent "implement the API")
codius wait "$agent_id"
codius logs "$agent_id" --tail 5
```

Because Agent A's ID is present in the environment, Agent B is created as its subagent in the same workspace unless `--workspace` is specified.

Simple implement + verify loop:

```bash
# Requires jq
while true; do
  codius run --provider codex "make the tests pass" >/dev/null

  verdict=$(codius run --provider claude --output-schema '{"type":"object","properties":{"criteria_met":{"type":"boolean"}},"required":["criteria_met"],"additionalProperties":false}' "ensure tests all pass")
  if echo "$verdict" | jq -e '.criteria_met == true' >/dev/null; then
    echo "criteria met"
    break
  fi
done
```

This pattern enables hierarchical task decomposition, a lead agent can break down work, delegate to specialists, and synthesize results.

## Output formats

Most commands support multiple output formats for scripting:

```bash
codius ls --json                # JSON output
codius ls --format yaml         # YAML output
codius ls -q                    # IDs only (quiet)
```

## Global options

- `--host <target>`, connect to a different daemon (`host:port`, unix socket, or `https://app.codius.ai/#offer=...` for relay). See [Connecting to a remote daemon](#connecting-to-a-remote-daemon).
- `--json`, JSON output
- `-q, --quiet`, minimal output
- `--no-color`, disable colors
