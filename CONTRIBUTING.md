# Contributing to Obol

Obol is a local-first macOS app. Before opening a pull request, install Node.js 20 or newer, Xcode 16 or newer on macOS, and npm 10.

    npm ci
    npm run build
    npm run typecheck
    npm test

To run the daemon by itself:

    npm run dev:daemon
    # or, for one refresh:
    npm run once -w daemon

The native app expects the daemon bundle and dashboard build to exist before an Xcode build. npm run build produces both. The app intentionally invokes a Node executable from a small set of system paths; see the Node-path note in the README when testing from a non-login launch.

Use the existing feat: commit convention for user-facing work, for example feat: add release update checks. Keep mechanical formatter-only changes in their own commit.

docs/enhancement-plan.md is a roadmap, not a specification for every pull request. The updater and public-repo work is scoped by the implementation plan that introduced these contribution notes.
