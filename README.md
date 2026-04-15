# Copilot+

> Real-time GitHub Copilot quota display, per-model session cost tracking, and agent scope explorer — all in your VS Code status bar.

[![CI](https://github.com/juninmd/copilot-plus/actions/workflows/ci.yml/badge.svg)](https://github.com/juninmd/copilot-plus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![VS Code Engine](https://img.shields.io/badge/vscode-%5E1.100.0-blue)](https://code.visualstudio.com/)

---

## Features

### 📊 Status Bar Quota Display

Shows your remaining GitHub Copilot premium requests directly in the status bar:

```
$(copilot) 258/300 (14% left) · -3.33
```

- **258/300** — remaining / total premium requests (fetched live from GitHub)
- **(14% left)** — percentage remaining
- **-3.33** — premium requests consumed in the current session

Color changes to **warning** at 85% used and **error** when quota is exhausted.

Hover over the status bar item for a detailed tooltip with session breakdown per model.

### 🤖 Agent Explorer (Sidebar)

A TreeView that lists all registered Copilot Chat participants with their **scope badge**:

| Icon | Scope | Description |
|------|-------|-------------|
| `$(github)` **[built-in]** | Built-in | Provided by `GitHub.copilot-chat` or Microsoft extensions |
| `$(account)` **[user]** | User | Installed globally at `~/.vscode/extensions/` |
| `$(folder)` **[workspace]** | Workspace | Extension loaded from workspace folder |
| `$(tools)` **[local-dev]** | Local dev | Extension in development (`extensionDevelopmentPath`) |

### 💰 Premium Request Cost Tracking

Every model uses a different number of premium requests per call (April 2026):

| Model | Multiplier |
|-------|-----------|
| Claude Opus 4.x | **3×** |
| Claude Sonnet 4.x | **1×** |
| Gemini Pro | **1×** |
| Claude Haiku 4.x | **0.33×** |
| Gemini Flash | **0.33×** |
| GPT-5.4 mini | **0.33×** |
| Grok Code Fast | **0.25×** |
| GPT-4o, GPT-4.1, GPT-5 mini, Raptor mini | **0×** (included, no premium cost) |
| Unknown model | **1×** (conservative fallback) |

---

## How It Works

### Live Quota Fetch

The extension authenticates using your existing VS Code GitHub session (no extra login required) and calls the same internal endpoint the Copilot extension itself uses:

```
GET https://api.githubcopilot.com/copilot_internal/v2/token
Authorization: Bearer <your-github-oauth-token>
```

The response contains a short-lived JWT with your monthly quota. The extension decodes it locally — **no data leaves your machine except to GitHub's own API**.

> ⚠️ **Important:** This endpoint is internal and undocumented. GitHub may change or remove it without notice. If it stops working, the extension automatically falls back to local tracking mode.

### Fallback: Local Tracking

If the GitHub endpoint is unavailable or you're offline, the extension switches to local tracking mode, counting session and daily costs based on the model multipliers above.

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `copilotPlus.quotaTotal` | `300` | Your monthly quota (adjust if you have Business/Enterprise plan) |
| `copilotPlus.refreshIntervalMinutes` | `15` | How often to refresh quota from GitHub |

---

## Installation

### From GitHub Releases (VSIX)

1. Download the latest `copilot-plus.vsix` from [Releases](https://github.com/juninmd/copilot-plus/releases)
2. The release page includes the packaged extension ready to install directly into VS Code.
3. In VS Code: `Extensions` → `...` → `Install from VSIX...`
4. Select the downloaded file

### From Source

```bash
git clone https://github.com/juninmd/copilot-plus
cd copilot-plus
pnpm install
pnpm run package
code --install-extension copilot-plus.vsix
```

### Development

```bash
pnpm install
# Press F5 in VS Code to launch Extension Development Host
```

---

## Requirements

- VS Code `^1.100.0`
- GitHub Copilot subscription (Individual, Business, or Enterprise)
- Signed in to GitHub via VS Code

---

## Privacy & Security

- Only calls GitHub's own API endpoints using your existing VS Code auth session
- No telemetry, no external services, no data collection
- All quota data is stored locally in VS Code's extension storage
- Token is never logged or persisted

---

## License

[MIT](LICENSE) © 2026 juninmd
