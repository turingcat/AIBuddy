# Task 6 Report: Isolate Embedded Goose Data Root

## Outcome

- `initializeAppIdentity` derives `goosePathRoot` as `path.join(userDataDir, 'goose')` after setting the AIBuddy name.
- `main.ts` uses that one owned path for `appConfig`, the recipe picker, and the embedded `goose serve` environment.
- The explicit owned root is placed after environment spreads and replaces inherited `GOOSE_PATH_ROOT` without mutating `process.env`.

## TDD

- RED: the initial focused run failed on the missing `goosePathRoot` identity contract and missing environment-root composition (4 assertions).
- Mutation RED: restoring `sanitizeGoosePathRoot(process.env)` made the main-entry test fail by rewriting `~/shared/heybuddy` to an absolute path.
- GREEN: the final focused suite passed 18/18; the child process received the owned root while its parent retained the hostile inherited value.

## Coverage And Verification

- Focused V8 coverage is 100% statements, functions, and branches for `appIdentity.ts` and `gooseServeEnv.ts`; branch coverage is the available path proxy.
- `main.ts` is only covered through its changed, no-branch wiring function/entry path. Its full-file percentage is not represented as 80% coverage.
- `pnpm --dir ui/desktop run typecheck` passed.
- Focused tests, Prettier formatting, and `git diff --check` passed. Desktop commands retain the existing Node 26 versus requested Node 24 warning.

## Files

- Identity/root ownership: `appIdentity.ts`, `appIdentity.test.ts`.
- Backend environment/root precedence: `gooseServeEnv.ts`, `gooseServeEnv.test.ts`, `gooseServe.test.ts`.
- Main-process root wiring: `main.ts`.

## Review Fix Round 1

- Added `mainGooseRoot.test.ts`, a narrowly mocked main-process boot test that reaches `appMain`, `createNewWindow`, and the embedded `createChat` backend path.
- The test asserts the exact `path.join(userDataDir, 'goose')` value reaches both `buildGooseServeEnv` and `startGooseServe`.
- Mutation RED: substituting `/shared/heybuddy` at the `main.ts` environment-builder handoff failed with the expected received root mismatch.
- GREEN: focused Task 6 suite passed 19/19. V8 reports one hit on every changed handoff statement at lines 1143, 1148-1162.
- `pnpm --dir ui/desktop run typecheck`, focused Prettier, and `git diff --check` passed. The test intentionally does not claim 80% whole-file coverage for the broad existing `main.ts` module.
