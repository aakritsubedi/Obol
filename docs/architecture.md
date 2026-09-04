# Obol architecture

Obol has three runtimes: the daemon is the source of truth, the dashboard is
the browser UI, and the macOS app is a native presenter. All three follow the
same dependency direction:

`UI → domain → data → infrastructure`

The contract is shared separately by the daemon and dashboard. Swift keeps
hand-written decoding for compatibility, with recorded contract fixtures
covering the native boundary.

## Module rules

- UI renders and owns interaction state local to the thing it renders.
- Domain code is pure: no React, AppKit, `fetch`, filesystem, process, or
  wall-clock access unless a value is passed in.
- Data code owns API clients, stores, serialization, and vendor normalization.
- Infrastructure owns processes, filesystem access, timers, and operating
  system services.
- A feature may import shared modules and the contract, but never another
  feature. When a component gets a second consumer in another feature, promote
  it to `shared/`.
- Controllers coordinate services; they do not contain rendering or domain
  calculations.
- Feature roots expose their public surface through `index.ts`. Internal
  implementation modules are not public API.

The dashboard is composed in `src/app/`, feature code lives under
`src/features/`, and reusable code lives under `src/shared/`. The daemon keeps
HTTP, application services, domain transforms, data stores, providers, and
system infrastructure in separate directories. The macOS app keeps
Foundation-only models and transforms in `ObolCore` so they can be tested
without SwiftUI or AppKit.
