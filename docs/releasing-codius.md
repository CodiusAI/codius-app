# Releasing Codius Desktop

Codius Desktop releases are built by `.github/workflows/codius-release.yml`.

## Required repository secrets

| Secret | Purpose |
|---|---|
| `CODIUS_CSC_LINK` | macOS signing certificate/reference |
| `CODIUS_CSC_KEY_PASSWORD` | macOS certificate password |
| `CODIUS_APPLE_ID` | Apple notarization account |
| `CODIUS_APPLE_APP_SPECIFIC_PASSWORD` | Apple app-specific password |
| `CODIUS_APPLE_TEAM_ID` | Apple Developer team ID |
| `CODIUS_WINDOWS_CSC_LINK` | Windows signing certificate/reference |
| `CODIUS_WINDOWS_CSC_KEY_PASSWORD` | Windows certificate password |

The workflow's **unsigned** manual option only tests packaging. Stable production builds must be signed and notarized.

## Stable release

1. Confirm **Codius Desktop CI** is green on `main`.
2. Confirm a matching Codius CLI release and `codius acp` smoke test.
3. Confirm `https://api.codius.ai/v1` is available.
4. Push a signed SemVer tag.
5. The workflow synchronizes workspace versions, validates source, builds Linux, Windows, Apple Silicon, and Intel macOS packages, verifies Codius artifact names, and publishes GitHub release assets.
6. Verify installation, updates, deep links, `codiusctl`, `codius acp`, inline browser tabs, and browser automation on clean machines.

## Security checklist

- Never package Runware credentials or internal routing identifiers.
- Browser automation remains opt-in and warns about authenticated browser sessions.
- Preserve Paseo's AGPL-3.0 license, source offer, modification notices, and upstream attribution.
