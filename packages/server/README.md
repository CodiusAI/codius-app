# @codius.ai/server

The local Codius host service. It manages coding-agent processes, workspaces,
terminal sessions, schedules, and client connections used by Codius App and the
Codius CLI.

This package is published because the CLI installs and runs the local service.
Most users should install the CLI instead of installing this package directly:

```bash
npm install --global @codius.ai/cli@beta
```

During source development, use the root workspace commands from the
[Codius App repository](https://github.com/CodiusAI/codius-app).

## Stability

The server's internal modules and exports are not yet a stable public SDK.
Follow the [Codius documentation](https://codius.ai/docs) for supported
interfaces.

## License

AGPL-3.0-or-later. See `LICENSE`.
