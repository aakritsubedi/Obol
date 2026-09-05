# Security

## Local daemon boundary

The daemon binds to 127.0.0.1, not a network interface. It writes a per-process 32-byte hexadecimal token to ~/.obol/runtime.json; the native app sends it in an x-token header, and the dashboard receives it once via ?t=, keeps it in localStorage, and then sends it in headers too (Server-Sent Events cannot carry headers, so the event stream is the one request that still uses the query parameter). server.ts checks both the token and the request origin, accepting only loopback HTTP origins. Costs are ccusage estimates, and ccusage runs with --offline.

## Update trust model

What protects the user: TLS to api.github.com / objects.githubusercontent.com against the system trust store. That is the real boundary. Plus the SHA-256 digest carried over that same channel, which makes the download tamper-evident at the CDN edge — it adds no trust beyond the API response, but it catches corruption and edge tampering. Plus bundle-ID and version assertions before the swap.

What codesign --verify --deep --strict buys: proof the bundle's internal seal is intact. It proves nothing about who signed it — an ad-hoc signature has no identity, and anyone can produce an ad-hoc-signed Obol.app. Run it as an integrity check; never describe it to users as authenticity verification.

What is unavailable without a Developer ID: Team ID pinning (SUExpectedBundleTeamIdentifier, SecStaticCodeCheckValidityWithErrors with an certificate leaf[subject.OU] requirement). Leave a // TODO(dev-id): pin SecRequirement at the exact call site so it's a five-line change later.

Because the ZIP arrives via URLSession and not a browser, it carries no com.apple.quarantine xattr, so the replaced app launches without the Gatekeeper block (right-click > Open on macOS 14 and earlier, Privacy & Security > Open Anyway on macOS 15+). That is a genuine win over "download the DMG again" — and precisely why the checks above must be done properly, since you are stepping around the prompt that would otherwise be the user's last warning.

The updater refuses releases without a SHA-256 digest or a SHA256SUMS entry, checks the archive's declared size, requires the Obol bundle identifier, rejects downgrades, and verifies the bundle's internal seal before a swap. Report suspected vulnerabilities through a private GitHub Security Advisory rather than a public issue.
