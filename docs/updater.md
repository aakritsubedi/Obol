# Updater design

The updater is intentionally quiet and stateful. It never sends a notification or interrupts a usage refresh.

## State machine

    idle
      │ automatic check due / manual Check
      ▼
    checking ── no release ──► idle
      │
      ├── same/older version ──► upToDate(checkedAt)
      ├── skipped version ─────► idle
      ├── newer stable release ► available(entry)
      ├── rate limit ──────────► failed("Try again later")
      └── malformed/network ──► failed(message)

    available ── Update ──► downloading(progress)
      downloading ── verified + staged ──► readyToInstall(staged)
      readyToInstall ── Install and Relaunch ──► installing
      installing ── detached helper ──► old process exits, swap, relaunch

Automatic checks happen after a 30-second launch delay, on popover open, and every six hours. The automatic cadence is gated at 24 hours and by a persisted rate-limit window. Manual Check bypasses both the 24-hour gate and the skipped-version list. releases/latest naturally excludes prereleases; the evaluator also refuses prerelease candidates unless the policy explicitly allows them.

The ETag is persisted and sent as If-None-Match. A 304 is a successful no-change check and avoids consuming GitHub's unauthenticated request budget. A 404 is the normal no-releases-yet state and renders no updater error.

## Trust model

What protects the user: TLS to api.github.com / objects.githubusercontent.com against the system trust store. That is the real boundary. Plus the SHA-256 digest carried over that same channel, which makes the download tamper-evident at the CDN edge — it adds no trust beyond the API response, but it catches corruption and edge tampering. Plus bundle-ID and version assertions before the swap.

What codesign --verify --deep --strict buys: proof the bundle's internal seal is intact. It proves nothing about who signed it — an ad-hoc signature has no identity, and anyone can produce an ad-hoc-signed Obol.app. Run it as an integrity check; never describe it to users as authenticity verification.

What is unavailable without a Developer ID: Team ID pinning (SUExpectedBundleTeamIdentifier, SecStaticCodeCheckValidityWithErrors with an certificate leaf[subject.OU] requirement). Leave a // TODO(dev-id): pin SecRequirement at the exact call site so it's a five-line change later.

Because the ZIP arrives via URLSession and not a browser, it carries no com.apple.quarantine xattr, so the replaced app launches without the right-click-Open dance. That is a genuine win over "download the DMG again" — and precisely why the checks above must be done properly, since you are stepping around the prompt that would otherwise be the user's last warning.

## Local fixture server

Build a real ZIP first:

    npm ci
    npm run build
    OBOL_VERSION=9.9.9 npm run package:dmg

Then run the dependency-free fixture server:

    npm run dev:fake-release -- --slow --scenario ok

It listens on 127.0.0.1:8787, uses a real computed digest for the first dist/Obol-*.zip it finds, emits SHA256SUMS, honors ETag/If-None-Match, and serves GitHub-shaped JSON. Set OBOL_FIXTURE_ZIP to choose a particular ZIP.

For a Debug app, enable the shared scheme's OBOL_UPDATE_FEED_URL environment variable with http://127.0.0.1:8787 and open an app whose current version is below 9.9.9. Exercise:

- ok: download, verification, staging, install, and relaunch
- 404: no error text
- ratelimit: Try again later and suppressed automatic checks
- baddigest: failure before staging; the archive is deleted and the installed app is untouched
- nodigest: refusal with the checksum message
- noassets: no offer

Also test a ZIP with the wrong bundle identifier, a lower version, a corrupted staged app for helper rollback, a server killed during download, skip then reopen, a DerivedData app path, and a non-writable /Applications parent. The installer must either leave the installed app untouched or reveal a complete staged app; it must not leave a partial target.

OBOL_UPDATE_FEED_URL and OBOL_UPDATE_REPO are read only by UpdateController under DEBUG. A release build always uses the compiled GitHub repository URL so an environment variable cannot redirect update traffic.

## Future Developer ID pinning

The exact codesign verification call in UpdateInstaller.swift is marked:

    // TODO(dev-id): pin SecRequirement at this exact call site so it's a five-line change later.

When Developer ID signing is available, add the expected Team ID requirement with SecStaticCodeCheckValidityWithErrors and a certificate leaf subject.OU constraint. Keep the existing SHA-256 and bundle/version checks; identity pinning supplements them.
