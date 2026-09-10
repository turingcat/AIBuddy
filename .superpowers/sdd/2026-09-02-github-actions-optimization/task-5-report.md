# Task 5 Report

Changes:

- Added event-separated concurrency to MCP conformance so new pull request updates cancel only superseded runs for that pull request.
- Added a `changes` job that skips build and conformance for documentation-only pull requests without top-level path filters that would leave required checks pending.
- Added the scheduled event while preserving full build and conformance matrix execution for push to main, merge queue, schedule, and manual dispatch.
- Preserved the single build artifact fan-out and all existing specification, conformance version, and expected-failure baseline matrix entries.
- Extended CI performance contracts for concurrency, event handling, documentation filtering, and matrix preservation.

Verification:

- Not run: `ruby scripts/test-ci-performance-contracts.rb`, builds, or test suites. The task explicitly did not authorize test or build commands.
- Static review: Ruby syntax, YAML parsing, workflow job dependencies and conditions, artifact fan-out, matrix entries, and whitespace checks.

Concerns:

- Scheduled execution and paths-filter behavior need observation in GitHub Actions once workflow execution is authorized.

Fix Round 1:

- Restricted the `changes` job that runs `dorny/paths-filter` to `contents: read` and `pull-requests: read`; build and conformance jobs retain no added permissions.
- Replaced the schedule text assertion with YAML parsing and a five-field nonempty cron assertion.
- Added a contract binding the build artifact upload name to the conformance matrix download name.
- Removed the duplicate MCP code-change event-tier test; the existing docs-only PR and non-PR coverage test remains the single assertion of that behavior.

Fix Round 2:

- Replaced the permissive five-field cron shape check with an exact YAML schedule contract: one schedule entry at daily 03:00 UTC (`0 3 * * *`).
