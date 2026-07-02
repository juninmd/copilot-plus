# AGENTS.md

## Tech Stack
- **Language:** TypeScript
- **Runtime:** VS Code Extension (Node.js)
- **Build:** esbuild
- **Package Manager:** pnpm
- **Extension Type:** VS Code Extension (AI/Copilot tools)
- **API Integration:** GitHub Copilot internal API

## Project Structure
```
copilot-plus/
  src/
    extension.ts          # Extension entry point
    status-bar.ts         # Quota display in status bar
    quota-service.ts      # GitHub quota fetch & decode
    request-tracker.ts    # Session usage tracking
    agent-explorer.ts     # Agent TreeView
    models-explorer.ts    # Model list view
    tools-explorer.ts     # Tools list view
    model-advisor.ts      # Model recommendation
    history-panel.ts      # Usage history
    logger.ts             # Logging utility
    mcp-explorer.ts       # MCP server explorer
    scope-detector.ts     # Agent scope detection
    turbo.ts              # Turbo mode feature
  resources/              # Icons
  .github/workflows/      # CI
  esbuild.js              # Build config
```

## Commands
- `pnpm install` - Install deps
- `pnpm run compile` - TypeCheck + build
- `pnpm run package` - Production VSIX
- `pnpm run lint` - ESLint
- `pnpm run watch` - Dev watch mode

## Env Vars
- No user-facing env vars (uses VS Code auth session)

## Conventions
- VS Code extension API (vscode namespace)
- esbuild for bundling
- GitHub OAuth session for API calls
- Local-first: no telemetry, no external services
