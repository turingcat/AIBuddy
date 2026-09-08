# HeyBuddy v1.49.0 Sync

- Upstream tag: `v1.49.0` (`71fc4be1ed729e26b1dc0a4466abdd03be548a53`).
- HeyBuddy before sync: `d630adc1170157545e472d7fa6478c8b57c89610`.
- Integration: merge upstream history into `main`; no force update or push.

## Conflict Decisions

- Keep HeyBuddy product identity and independent `1.0.6` version numbering.
- Keep authentication, recharge, predefined models, product User-Agent, Chinese
  experience, inline tool images, and Windows x32/x64 packaging customizations.
- Keep deleted upstream updater implementation, updater UI, extra locales, Maven
  workflow, removed blog entry, and self-test recipe deleted. Exclude newly added
  updater tests that require the deleted implementation.
- Keep the customized CI gate and disabled telemetry. Adopt the upstream inference
  module migration; its new shared inference module does not restore PostHog calls.
- Combine subject-focused session naming with the Chinese title requirement and
  existing Chinese phrase preservation. Adapt local tests to the working-dir argument.
- Preserve cancelled tool detection in the upstream precomputed message row state.
  Keep both Chinese greeting tests and upstream draft persistence tests.
- Adopt upstream canonical model metadata and the HTTPS node-gyp tarball, updating
  lockfile snapshot references consistently.
- Adapt the upstream recipe import test mock to HeyBuddy's deeplink helper.
- Refresh the retained default-extension prompt snapshot for the built-in web-search
  skill. Set the compaction test's half-full usage explicitly so local skill prompt
  length does not trigger compaction before the assertion under test.

## Verification

- Rust: `cargo fmt --all` and `cargo clippy --all-targets --locked -- -D warnings`
  passed with the repository-pinned Rust 1.96.1 toolchain. Two constant strings in
  an upstream test were changed from `format!` to equivalent string conversion.
- Rust unit tests: 2,999 passed across heybuddy, heybuddy-agent, heybuddy-provider-types,
  heybuddy-providers, and heybuddy-context-management, with `heybuddy/rustls-tls` enabled.
  Tests ran with `--test-threads=1` because ACP tests mutate process-wide environment
  settings and one retry test failed intermittently during parallel runs.
- Rust integration tests: 39 agent tests and 4 compaction tests passed with
  `rustls-tls` and `--test-threads=1`.
- SDK TypeScript compilation and desktop `tsc --noEmit` passed.
- Desktop Vitest under Node 24: 146 files, 1,169 tests passed, including packaging
  script tests. Backend TLS tests required permission to bind loopback ports.
- Targeted message row coverage: 100% statements, branches, functions, and lines.
  This is not a measurement of whole-project path coverage.
- Prettier checks for manually adapted UI files passed.
- Buzz automation: 10 tests passed.
- Legacy Ruby CI performance and release workflow checks fail on both the pre-sync
  revision and merged tree. They reference removed workflows, the old combined Rust
  compatibility job, and an outdated installer filename expectation.
- Full native builds, whole-project Rust path coverage, and platform installer execution have not
  been verified.
