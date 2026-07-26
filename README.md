<p align="center">
  <a href="https://codius.ai">
    <img src="assets/codius-logo.svg" width="360" alt="Codius" />
  </a>
</p>

<h1 align="center">Codius Desktop</h1>

<p align="center"><strong>A visual command center for Codius CLI and the coding agents you already use.</strong></p>

<p align="center">
  <a href="https://github.com/prismosoft/codius-desktop/actions"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/prismosoft/codius-desktop/ci.yml?style=flat-square&branch=main" /></a>
  <a href="https://github.com/prismosoft/codius-desktop/releases"><img alt="Release" src="https://img.shields.io/github/v/release/prismosoft/codius-desktop?style=flat-square" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/prismosoft/codius-desktop?style=flat-square" /></a>
</p>

Codius Desktop is an open-source visual workspace for local coding agents. It combines agent orchestration, worktrees, Git review, terminals, schedules, MCP integration, an embedded browser, and visible browser automation while making **Codius CLI the first-run default provider**.

Users remain free to select Codex, Claude Code, GitHub Copilot, OpenCode, Pi, custom ACP agents, and other supported providers. Once a user selects another provider, Codius Desktop remembers that preference instead of forcing Codius again.

## Product architecture

```text
Codius Coding Plans
        │
        ▼
Codius API — OpenAI-compatible inference
        ▲
        │
Codius CLI — local coding agent and ACP server
        ▲
        │ Agent Client Protocol
        │
Codius Desktop
Browser · Terminal · Git · Worktrees · Diffs · Schedules · Agents
```

Codius Desktop launches the default provider with:

```bash
codius acp
```

The desktop app receives streamed responses, reasoning events, model and mode discovery, permission requests, sessions, and MCP definitions over ACP. Local files, Git operations, terminals, and browser interaction stay on the user's machine.

## Features

- **Codius by default:** A fresh install selects Codius CLI and its current Codius model catalog.
- **Multi-provider:** Continue using Codex, Claude Code, Copilot, OpenCode, Pi, or custom ACP providers.
- **Parallel agents:** Run isolated coding agents simultaneously in separate workspaces and worktrees.
- **Inline browser:** Open development sites in browser panels beside chat, terminal, logs, and diffs.
- **Visible browser automation:** Approved agents can navigate, click, type, fill forms, upload workspace files, inspect console/network output, and take screenshots in the same browser tab the user sees.
- **Git workflow:** Review diffs, stage changes, commit, and continue to pull-request workflows.
- **Schedules and loops:** Run repeatable agent tasks and orchestration flows.
- **Local-first:** The daemon and coding agents run on infrastructure controlled by the user.

## Codius environments

| Environment | Website                  | OpenAI-compatible API          |
| ----------- | ------------------------ | ------------------------------ |
| Development | `https://dev.codius.dev` | `https://devapi.codius.dev/v1` |
| Production  | `https://codius.ai`      | `https://api.codius.ai/v1`     |

Codius CLI controls which model API environment it uses. Development and prerelease CLI builds default to the development endpoints; stable releases default to production.

## Requirements

For the default provider, install Codius CLI and connect a Codius API key:

```bash
curl -fsSL https://raw.githubusercontent.com/prismosoft/codius-cli/dev/install | bash
export CODIUS_API_KEY="codius_..."
```

Verify both the CLI and ACP server:

```bash
codius --version
codius acp --help
```

Other providers require their own local CLI, account, or API key.

## First launch

Codius Desktop stores its daemon configuration, sessions, and workspace metadata under:

```text
~/.codius
```

Override it with:

```bash
CODIUS_HOME=/path/to/codius-home
```

New Codius installations use `CODIUS_HOME` and `~/.codius`.

On the first run, Desktop creates a private local configuration that:

- registers `codius acp` as the Codius provider;
- enables Codius as the fresh provider preference;
- keeps hosted relay access disabled by default;
- allows the production and development Codius web origins;
- retains all other built-in and custom providers.

## Provider behavior

The default selection logic is intentionally non-destructive:

```text
explicit task/provider selection
        ↓
saved user provider preference
        ↓
Codius first-run default
```

A user who chooses Claude Code, Codex, OpenCode, or another agent will continue with that provider on later launches. Codius is a default, not a lock-in mechanism.

## Browser automation

The embedded browser is visible inside the workspace. When browser tools are enabled for an agent, it can operate the active Codius browser profile while the user watches and can take over manually.

Typical tasks include:

- starting a local development server;
- opening a branch-specific preview URL;
- reproducing a UI bug;
- completing a login or checkout test with an existing browser session;
- inspecting console errors and network timing;
- fixing code and retesting the same flow.

Browser access should be enabled only for trusted agents because the Codius browser profile may contain authenticated sessions.

## Desktop management CLI

The desktop daemon-management command is named `codiusctl` so it does not conflict with the coding-agent command `codius`.

```bash
codiusctl status
codiusctl run --provider codius "fix the failing tests"
codiusctl ls
codiusctl attach <agent-id>
codiusctl send <agent-id> "also update the documentation"
```

Use `codius` for the coding agent itself and `codiusctl` for Desktop/daemon orchestration.

## Development

Requirements:

- Node.js matching the repository configuration
- npm
- Codius CLI available on `PATH` for end-to-end provider tests

Install and run:

```bash
git clone https://github.com/prismosoft/codius-desktop.git
cd codius-desktop
npm install
npm run dev
```

Useful commands:

```bash
npm run dev:server
npm run dev:app
npm run dev:desktop
npm run build:server
npm run typecheck
npm test
```

Test the default ACP integration:

```bash
CODIUS_ENV=development \
CODIUS_API_KEY="codius_..." \
npm run dev:desktop
```

The primary packages are:

- `packages/server` — daemon and agent orchestration
- `packages/app` — desktop/web/mobile-compatible application UI
- `packages/desktop` — Electron host and packaging
- `packages/cli` — daemon-management CLI, publicly branded `codiusctl`
- `packages/protocol` — shared provider and transport contracts

All internal workspaces use the `@codius-ai/*` package scope. Public product names, executables, application IDs, installers, documentation, endpoints, and assets are Codius-branded.

## Release identity

Public releases from this repository use:

- product: **Codius Desktop**;
- repository: `prismosoft/codius-desktop`;
- application ID: `ai.codius.desktop`;
- deep-link protocol: `codius:`;
- desktop management command: `codiusctl`;
- coding agent command: `codius`;
- data home: `~/.codius`.

Runware credentials, routing identifiers, and internal provider economics must remain in Codius server infrastructure. They must never be bundled into Desktop or Codius CLI.

## License

Codius Desktop is licensed under AGPL-3.0. Required copyright, source, and network-use notices must be preserved in distributed builds.

## Related projects

- [Codius](https://github.com/prismosoft/codius) — plans, dashboard, billing, metering, model catalog, and OpenAI-compatible API
- [Codius CLI](https://github.com/prismosoft/codius-cli) — local coding agent and ACP provider used by default

<sub>Upstream note: Codius Desktop began as a fork of [Paseo](https://github.com/getpaseo/paseo).</sub>
