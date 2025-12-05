# BubbleLab Desktop

A standalone Windows desktop application for BubbleLab workflow builder.

## Overview

BubbleLab Desktop packages the Bubble Studio frontend as an Electron application. It provides a native desktop experience for building and running AI workflows.

## Requirements

- Windows 10 or later (x64)
- [Bun](https://bun.sh) runtime installed (for backend functionality)

## Building

### Prerequisites

1. Node.js 18 or higher
2. pnpm package manager
3. From the repository root:
   ```bash
   pnpm install
   pnpm build:core
   ```

### Build the Desktop App

```bash
cd apps/bubble-desktop
pnpm build          # Build TypeScript and frontend
pnpm dist:win       # Create Windows portable executable
```

The executable will be in the `release/` directory.

## Development

To run in development mode:

1. Start the frontend dev server (from bubble-studio):

   ```bash
   cd ../bubble-studio
   pnpm dev
   ```

2. Start the backend (from bubblelab-api):

   ```bash
   cd ../bubblelab-api
   bun run dev
   ```

3. Run Electron in dev mode:
   ```bash
   cd ../bubble-desktop
   pnpm start
   ```

## Architecture

- **Electron Main Process** (`src/electron/main.ts`): Manages the application window and backend process
- **Frontend**: Bundled from `bubble-studio/dist/`
- **Backend**: The API server runs as a separate process using Bun

## Data Storage

- SQLite database is stored in the user's app data directory
- On Windows: `%APPDATA%/BubbleLab/bubblelab.db`

## Notes

- The backend requires Bun runtime to be installed on the user's system
- If Bun is not found, the app will start but backend functionality won't be available
- API keys for AI providers need to be configured separately
