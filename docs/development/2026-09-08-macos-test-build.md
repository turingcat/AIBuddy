# macOS Test Build, 2026-09-08

Built from the current uncommitted `feat/aibuddy-branding` worktree for user testing.
Main remains unchanged. This is a local test build, not a published or notarized release.

- Product/version: AIBuddy 1.0.6.
- Platform: macOS ARM64 (Apple Silicon).
- Backend: optimized release build with `rustls-tls`.
- Backend SHA-256 before local app signing: `65c071e6dac45c31a3792a94ec9e46eebdda036aabe593cfdcdfb0f43b277cb6`.
- App: `ui/desktop/out/AIBuddy-darwin-arm64/AIBuddy.app`.
- ZIP: `ui/desktop/out/AIBuddy-macOS-arm64-rebrand-test-20260908-0930.zip` (approximately 202 MiB).

Verification completed:

- Release backend build and Electron Forge package command succeeded.
- Packaged backend matched the release-build bytes before signing.
- Package structure and Info.plist checks passed.
- Local ad-hoc signing and strict deep signature verification passed.
- Packaged app launched with isolated user/backend data directories.
- Playwright confirmed the AIBuddy login heading and account/password controls;
  no old-brand text appeared on that screen. No login was submitted.
- Packaged `aibuddy migrate-config --help` ran successfully.
- ZIP integrity check passed.

Visual evidence: `/private/tmp/aibuddy-user-test-dqzlp7/login.png`.
Startup report: `/private/tmp/aibuddy-user-test-dqzlp7/report.json`.

The broader project still needs real mirror initialization/bridge completion and
the remaining coverage/release gates. The bounded path report is not a claim of
exhaustive whole-repository path coverage. Windows/Linux installers and authenticated
application workflows were not validated by this macOS login-screen check.
