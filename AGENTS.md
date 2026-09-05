# Repository Guidelines

## Project Structure & Module Organization

Obol is a local-first macOS menu-bar app with a TypeScript workspace and native Swift UI:

- `contract/` contains shared TypeScript contracts and JSON fixtures.
- `daemon/` contains the local Node/TypeScript service, provider adapters, HTTP routes, and Vitest tests.
- `dashboard/` contains the React/Vite dashboard, feature modules, provider assets, and Vitest/Testing Library tests.
- `macos/` contains the SwiftUI/AppKit app, SwiftPM core libraries and tests, Xcode resources, and packaging scripts.
- `scripts/` holds repository checks and release helpers; `docs/` and `design/` hold architecture, updater, and visual references.

## Build, Test, and Development Commands

Use Node 20+ and the repository's npm version. From the repository root:

- `npm ci` installs the locked workspace dependencies.
- `npm run build` builds all workspaces and bundles the daemon for the app.
- `npm run dev:daemon` or `npm run dev:dashboard` starts a local workspace in watch mode.
- `npm run typecheck` runs TypeScript checks; `npm test` runs all Vitest suites.
- `npm run lint` and `npm run format:check` run Biome validation.
- `swift test --package-path macos` runs the SwiftPM tests. For native checks, use `swiftformat --lint macos` and `swiftlint lint --config .swiftlint.yml --path macos`.
- `npm run package:dmg` builds the distributable DMG after the app and web assets are ready.

## Coding Style & Naming Conventions

Use Biome for TypeScript/React formatting and linting. Keep Swift at four-space indentation and a 120-column limit, as configured in `macos/.swiftformat`; follow SwiftLint thresholds in `.swiftlint.yml`. Use PascalCase for React components and Swift types, camelCase for functions and variables, and colocate feature tests as `*.test.ts` or `*.test.tsx`.

## Testing Guidelines

Add or update focused Vitest tests beside changed TypeScript/React behavior. Add Swift tests under `macos/Tests/ObolCoreTests` or `macos/Tests/ObolUpdateCoreTests`. Run the relevant package tests plus the root checks before submitting; CI does not enforce a separate coverage threshold.

## Commit & Pull Request Guidelines

Use Conventional Commit subjects such as `feat:`, `fix:`, `refactor:`, `docs:`, or `chore:`; release commits use `chore(release): vX.Y.Z`. Keep commits focused. Pull requests should explain what changed and why, list verification commands, include screenshots for UI changes, and complete `.github/PULL_REQUEST_TEMPLATE.md`. Do not include secrets or private local usage data, and keep unrelated items from `docs/enhancement-plan.md` out of the change.

## Security & Configuration

Review `SECURITY.md` before changing updater or download verification behavior. Keep credentials in local environment configuration based on `.env.example`; never commit API keys, tokens, generated usage data, or signing material.
