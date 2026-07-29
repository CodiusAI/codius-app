# Releasing Codius

Codius releases are built by `.github/workflows/codius-release.yml`.
The coordinated npm packages are built and published separately by
`.github/workflows/npm-publish.yml` from the same version tag.

## Required repository secrets

Production macOS and Windows builds require signing credentials. Configure these repository secrets before pushing a stable tag:

| Secret                               | Purpose                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `CODIUS_CSC_LINK`                    | macOS signing certificate (`.p12`) or supported electron-builder certificate reference |
| `CODIUS_CSC_KEY_PASSWORD`            | macOS signing certificate password                                                     |
| `CODIUS_APPLE_ID`                    | Apple account used for notarization                                                    |
| `CODIUS_APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization                                                 |
| `CODIUS_APPLE_TEAM_ID`               | Apple Developer team ID                                                                |
| `CODIUS_WINDOWS_CSC_LINK`            | Windows code-signing certificate/reference                                             |
| `CODIUS_WINDOWS_CSC_KEY_PASSWORD`    | Windows signing certificate password                                                   |

The workflow's **unsigned** manual option is intended only for testing the packaging pipeline. Unsigned prereleases disable macOS hardened runtime so ad-hoc-signed helper processes can launch correctly. Do not distribute an unsigned manual build as a stable production release.

## Stable release

1. Confirm **Codius CI** is green on `main`.
2. Confirm the direct adapters for every supported agent pass their focused tests.
3. Confirm the production Codius API and model catalog are available at `https://api.codius.ai/v1`.
4. Create and push a signed SemVer tag:

   ```bash
   git checkout main
   git pull --ff-only
   git tag -s v1.0.0 -m "Codius 1.0.0"
   git push origin v1.0.0
   ```

5. The release workflow synchronizes all workspace versions, validates source, builds Linux, Windows, Apple Silicon, and Intel macOS packages, verifies `Codius-*` artifact names, and publishes them to GitHub Releases.
6. Confirm the protected npm workflow published the coordinated
   `@codius.ai/highlight`, `relay`, `protocol`, `client`, `server`, and `cli`
   packages at the exact tag version.
7. Verify installation, update checks, deep links, Codius CLI, supported-agent launches, Codius model access, inline browser tabs, and browser automation on clean machines before announcement.

## Security checklist

- No internal inference-provider API key or routing identifier may be present in the desktop source, packaged ASAR, environment templates, or logs.
- Codius inference credentials belong to the user's Codius account and the App's private model-access store.
- Browser automation remains opt-in and must clearly warn that the agent can access the Codius browser profile's authenticated sessions.
- Preserve Codius's AGPL-3.0 license, modification notices, source offer, and upstream attribution in every distributed build.
